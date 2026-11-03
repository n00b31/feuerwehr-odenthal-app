export function parseAppMode(value?: string) {
  if (!value || value === "supabase-dev") return "supabase-dev";
  if (value === "demo") return "demo";
  throw new Error("NEXT_PUBLIC_APP_MODE muss supabase-dev oder demo sein.");
}

export function getAppMode() {
  return parseAppMode(process.env.NEXT_PUBLIC_APP_MODE);
}
