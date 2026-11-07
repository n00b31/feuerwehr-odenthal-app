import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { reportsContextSchema, reportQuerySchema, yearReportSchema, type ReportQuery } from "@/domain/dev-reports";
import { devEventTypeSchema } from "@/domain/dev-events";
import { memberReasonSchema } from "@/domain/dev-members";
import { checked } from "./supabase-repository";

export async function readReportsContext(client: SupabaseClient) {
  return reportsContextSchema.parse(checked(await client.rpc("ff_reports_context")));
}
export async function readYearReport(client: SupabaseClient, query: ReportQuery, signal?: AbortSignal) {
  const input = reportQuerySchema.parse(query);
  const request = client.rpc("ff_year_report", input);
  const result = yearReportSchema.parse(checked(await (signal ? request.abortSignal(signal) : request)));
  if (result.year !== input.wanted_year || result.scope !== input.report_scope || result.target !== input.target_scope) {
    throw new Error("Der gelieferte Bericht stimmt nicht mit dem angeforderten Bereich überein.");
  }
  if (input.export_all && result.has_more) throw new Error("Unvollständiger Export wurde abgebrochen.");
  return result;
}
export async function setReportingType(client: SupabaseClient, type: string, relevant: boolean, reason: string) {
  checked(await client.rpc("ff_set_reporting_type", {
    target_type: devEventTypeSchema.parse(type), relevant: z.boolean().parse(relevant), reason: memberReasonSchema.parse(reason),
  }));
}
