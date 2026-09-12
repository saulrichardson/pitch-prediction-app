export const site = {
  name: "Pitch Prediction App",
  description: "Real-game next-pitch prediction and actual reveal scoring.",
  url: "https://baseball.saulrichardson.io",
};

export const routes = ["/"] as const;

export function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || site.url;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must be an absolute URL, for example https://baseball.saulrichardson.io.",
    );
  }

  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("NEXT_PUBLIC_SITE_URL must use https outside local development.");
  }

  return url;
}
