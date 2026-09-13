// These small shared input contracts run in both the browser and the API.
// Import them directly so the browser does not load model/edition validators.
import * as z from "zod/mini";

export const gameDateSchema = z.iso.date();
export const commandSchema = z.strictObject({
  id: z.uuid(),
  expectedRevision: z.int().check(z.gte(0)),
  action: z.enum(["reveal", "next", "back", "restart"]),
});
export type ReplayCommand = z.infer<typeof commandSchema>;
