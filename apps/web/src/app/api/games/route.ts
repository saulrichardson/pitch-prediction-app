import { getCatalogService, catalogHttpError } from "@/lib/catalog-service";
import { ok, serverError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const date = new URL(request.url).searchParams.get("date") ?? undefined;
    return ok(await (await getCatalogService()).list(date));
  } catch (error) {
    return serverError(catalogHttpError(error));
  }
}
