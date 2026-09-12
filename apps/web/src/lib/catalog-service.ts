import { getStorage } from "@pitch/db";
import { catalogService, getSchedule, CatalogError } from "@pitch/workflows";
import { HttpError } from "./http";
import { getReplayService } from "./replay-service";

export async function getCatalogService() {
  await getReplayService();
  return catalogService({ storage: getStorage(), schedule: getSchedule });
}

export function catalogHttpError(error: unknown) {
  return error instanceof CatalogError
    ? new HttpError(error.status, error.message, error.code)
    : error;
}
