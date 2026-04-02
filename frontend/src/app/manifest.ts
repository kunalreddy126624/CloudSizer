import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CloudSizer",
    short_name: "CloudSizer",
    description: "Multi-cloud sizing, architecture recommendation, and pricing estimation workspace.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef5ff",
    theme_color: "#17315c",
    categories: ["business", "productivity", "utilities"],
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon"
      }
    ]
  };
}
