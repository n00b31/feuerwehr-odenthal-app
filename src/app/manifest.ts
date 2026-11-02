import type { MetadataRoute } from "next";
import { publicPath } from "@/config/app";
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: publicPath("/"), name: "Feuerwehr Odenthal · Demo", short_name: "Feuerwehr",
    description: "Demo-Dienstplan mit fiktiven Daten. Keine produktive Anmeldung.",
    start_url: publicPath("/"), scope: publicPath("/"), display: "standalone", lang: "de",
    background_color: "#f7f4ef", theme_color: "#b11f4b",
    icons: [
      { src: publicPath("/icons/icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: publicPath("/icons/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: publicPath("/icons/maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
