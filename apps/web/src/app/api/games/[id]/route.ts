import { z } from "zod";
import { gameDateSchema } from "@pitch/domain";
import { getCatalogService, catalogHttpError } from "@/lib/catalog-service";
import {
  assertSameOrigin,
  badRequest,
  ok,
  readJsonObject,
  serverError,
} from "@/lib/http";
import { withSession } from "@/lib/route-params";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const date = new URL(request.url).searchParams.get("date") ?? "";
    return ok(await (await getCatalogService()).status(id, date));
  } catch (error) {
    return serverError(catalogHttpError(error));
  }
}
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const input = z
      .object({ date: gameDateSchema })
      .strict()
      .safeParse(await readJsonObject(request));
    if (!input.success) return badRequest("Choose a date from the game list.");
    await withSession();
    const { id } = await context.params;
    return ok({
      replay: await (await getCatalogService()).request(id, input.data.date),
    });
  } catch (error) {
    return serverError(catalogHttpError(error));
  }
}
