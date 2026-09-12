import { commandSchema } from "@pitch/domain";
import { getReplayService } from "@/lib/replay-service";
import { withSession } from "@/lib/route-params";
import {
  assertSameOrigin,
  badRequest,
  ok,
  readJsonObject,
  serverError,
} from "@/lib/http";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const session = await withSession();
    const { id } = await context.params;
    if (!/^[a-f0-9]{64}$/.test(id)) return badRequest("Invalid replay.");
    return ok({
      replay: await (await getReplayService()).read(id, session.workspaceId),
    });
  } catch (error) {
    return serverError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    if (!/^[a-f0-9]{64}$/.test(id)) return badRequest("Invalid replay.");
    const command = commandSchema.safeParse(await readJsonObject(request));
    if (!command.success) return badRequest("Invalid replay action.");
    const session = await withSession();
    return ok({
      replay: await (
        await getReplayService()
      ).command(id, session.workspaceId, command.data),
    });
  } catch (error) {
    return serverError(error);
  }
}
