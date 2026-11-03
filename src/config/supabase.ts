import { z } from "zod";

const publicConfigSchema = z.object({
  url: z.string().regex(/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/),
  publishableKey: z.string().regex(/^sb_publishable_[A-Za-z0-9_-]+$/),
});

export function parseSupabasePublicConfig(input: { url?: string; publishableKey?: string }) {
  if (!input.url && !input.publishableKey) return { status: "not-configured" } as const;
  const parsed = publicConfigSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Supabase DEV: Projekt-HTTPS-URL und Publishable Key gemeinsam konfigurieren. Nur sb_publishable_-Schlüssel sind erlaubt; keine geheimen oder alten JWT-Schlüssel.");
  }
  return { status: "configured", url: new URL(parsed.data.url).origin, publishableKey: parsed.data.publishableKey } as const;
}

export function getSupabasePublicConfig() {
  return parseSupabasePublicConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
