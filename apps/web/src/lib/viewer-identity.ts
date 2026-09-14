import crypto from "node:crypto";
import { isIP } from "node:net";

export function pseudonymizeViewerIp(ip: string, secret: string) {
  if (!isIP(ip)) throw new Error("Trusted viewer IP is invalid.");
  if (secret.length < 32)
    throw new Error("Viewer pseudonym secret must be at least 32 characters.");
  return crypto
    .createHmac("sha256", secret)
    .update(`preparation-caller\0${ip}`)
    .digest("hex");
}
