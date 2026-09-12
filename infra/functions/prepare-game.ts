import {
  GetFunctionCommand,
  InvokeCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import { getStorage } from "@pitch/db";
import { gameIdSchema, predictionResponseSchema } from "@pitch/domain";
import { gamePreparationWorker, getGameReplay } from "@pitch/workflows";

const client = new LambdaClient({});
const run = gamePreparationWorker({
  storage: getStorage(),
  loadGame: getGameReplay,
  resolveModel: async () => {
    const alias = process.env.MODEL_INVOKE_TARGET;
    if (!alias) throw new Error("MODEL_INVOKE_TARGET is required.");
    const model = await client.send(
      new GetFunctionCommand({ FunctionName: alias }),
    );
    const version = model.Configuration?.Version;
    const name = model.Configuration?.FunctionName;
    const digest = model.Code?.ResolvedImageUri?.split("@")[1];
    if (
      !version ||
      !/^\d+$/.test(version) ||
      !name ||
      !digest?.startsWith("sha256:")
    )
      throw new Error(
        "Preparation requires an immutable published model image.",
      );
    const target = `${name}:${version}`;
    return {
      target,
      artifact: `lambda:${target}@${digest}:normalizer-v3:samples8`,
    };
  },
  predict: async (request, model) => {
    const result = await client.send(
      new InvokeCommand({
        FunctionName: model.target,
        Payload: Buffer.from(JSON.stringify({ action: "predict", request })),
      }),
      { abortSignal: AbortSignal.timeout(60_000) },
    );
    if (result.FunctionError || !result.Payload)
      throw new Error("Model invocation failed.");
    const body = JSON.parse(new TextDecoder().decode(result.Payload));
    if (body.ok !== true)
      throw new Error(
        `Model could not predict (${String(body.code ?? "unavailable")}).`,
      );
    return predictionResponseSchema.parse(body.prediction);
  },
  log: (event) => console.log(JSON.stringify(event)),
});

type StreamEvent = {
  Records: Array<{
    dynamodb?: {
      NewImage?: Record<
        string,
        { S?: string; M?: Record<string, { S?: string }> }
      >;
    };
  }>;
};
export async function handler(event: StreamEvent) {
  for (const record of event.Records) {
    const image = record.dynamodb?.NewImage;
    const key = image?.key?.S;
    const value = image?.value?.M;
    if (!key?.startsWith("game-job:") || value?.status?.S !== "queued")
      continue;
    const id = gameIdSchema.parse(key.slice("game-job:".length));
    const requestId = value.requestId?.S;
    if (!requestId)
      throw new Error("Preparation event has no request identity.");
    await run(id, requestId);
  }
}
