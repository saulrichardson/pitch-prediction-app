import type { MetadataRoute } from "next";

import { getSiteUrl, site } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.name,
    short_name: "Pitch Prediction",
    description: site.description,
    start_url: getSiteUrl().toString(),
    display: "standalone",
    background_color: "#071128",
    theme_color: "#0f766e",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
