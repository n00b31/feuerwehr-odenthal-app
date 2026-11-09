import type { SupabaseClient } from "@supabase/supabase-js";
import { dashboardSchema } from "@/domain/dashboard";
import { checked } from "./supabase-repository";

export async function readDashboard(client: SupabaseClient, actor: string, signal?: AbortSignal) {
  const request = client.rpc("ff_dashboard");
  const data = dashboardSchema.parse(checked(await (signal ? request.abortSignal(signal) : request)));
  if (data.actor_id !== actor) throw new Error("Dashboard gehört nicht zur authentifizierten Sitzung.");
  return data;
}
