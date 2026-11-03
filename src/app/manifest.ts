import type { MetadataRoute } from "next";
import { publicPath } from "@/config/app";
import { getAppMode } from "@/config/mode";
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  const demo = getAppMode() === "demo";
  return {
    id: publicPath("/"), name: `Feuerwehr Odenthal · ${demo ? "Demo" : "DEV"}`, short_name: "Feuerwehr",
    description: demo ? "Demo-Dienstplan mit fiktiven Daten. Keine produktive Anmeldung." : "Supabase DEV: Nur autorisierte Testkonten, Zugriff nach Administratorfreigabe.",
    start_url: publicPath("/"), scope: publicPath("/"), display: "standalone", lang: "de",
    background_color: "#f7f8fa", theme_color: "#c62828",
    icons: [
      { src: publicPath("/icons/icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: publicPath("/icons/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: publicPath("/icons/maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
