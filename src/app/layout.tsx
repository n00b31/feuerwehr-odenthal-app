import type { Metadata } from "next";
import type { Viewport } from "next";
import { Application } from "@/components/application";
import { ThemeProvider } from "@/components/theme-provider";
import { publicPath } from "@/config/app";
import { themePreferenceScript } from "@/config/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Feuerwehr Odenthal · Mein Dienst", template: "%s · Feuerwehr Odenthal" },
  description: "Feuerwehr Odenthal: getrennte lokale Demo und Supabase-DEV-Mitgliederbereich.",
  applicationName: "Feuerwehr Odenthal",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  appleWebApp: { capable: true, title: "Feuerwehr", statusBarStyle: "default" },
  manifest: publicPath("/manifest.webmanifest"),
  icons: {
    icon: [{ url: publicPath("/icons/favicon-32.png"), type: "image/png", sizes: "32x32" }],
    apple: publicPath("/icons/apple-touch-icon.png"),
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f7f8fa" };
const themeScript = `(() => {
  const param = new URLSearchParams(window.location.search).get("scoutTheme");
  const theme =
    param || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);
})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript + themePreferenceScript }} /></head>
      <body><ThemeProvider><Application>{children}</Application></ThemeProvider></body>
    </html>
  );
}
