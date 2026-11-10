import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["supabase-auth.spec.ts", "supabase-events.spec.ts", "supabase-reports.spec.ts", "supabase-calendar.spec.ts", "supabase-vehicles.spec.ts", "supabase-planning.spec.ts", "supabase-dashboard.spec.ts", "supabase-notifications.spec.ts"],
  workers: 1,
  fullyParallel: false,
  timeout: 45_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
    browserName: "chromium",
    ...(process.env.PLAYWRIGHT_CHANNEL==="msedge" ? {channel:"msedge"} : {}),
    viewport: { width: 390, height: 844 },
    trace: "off",
    screenshot: "only-on-failure",
  },
  reporter: "list",
});
