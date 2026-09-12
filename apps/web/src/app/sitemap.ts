import type { MetadataRoute } from "next";

import { getSiteUrl, routes } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const lastModified = new Date();

  return routes.map((route) => ({
    url: new URL(route, base).toString(),
    lastModified,
    changeFrequency: "weekly",
    priority: 1,
  }));
}
