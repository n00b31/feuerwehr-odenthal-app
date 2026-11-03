"use client";

import type { ReactNode } from "react";
import { getAppMode } from "@/config/mode";
import { DemoProvider } from "./demo-provider";
import { Shell } from "./shell";
import { SupabaseDev } from "./supabase-dev";

export function Application({ children }: { children: ReactNode }) {
  if (getAppMode() === "demo") return <DemoProvider><Shell>{children}</Shell></DemoProvider>;
  return <SupabaseDev />;
}
