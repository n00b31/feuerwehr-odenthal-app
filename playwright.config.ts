import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testIgnore: ["supabase-auth.spec.ts", "supabase-events.spec.ts", "supabase-reports.spec.ts", "supabase-calendar.spec.ts", "supabase-vehicles.spec.ts", "supabase-planning.spec.ts", "supabase-dashboard.spec.ts", "supabase-notifications.spec.ts", "supabase-mobile.spec.ts", "supabase-setup.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  reporter: "list",
});
