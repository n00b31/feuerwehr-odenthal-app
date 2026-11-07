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
  const { seed_member, ...normal } = input;
  const { report_scope, ...range } = normal;
  const request = seed_member ? client.rpc("ff_dev_personal_report", { ...range, target_user: seed_member })
    : client.rpc("ff_year_report", { ...range, report_scope });
  const result = yearReportSchema.parse(checked(await (signal ? request.abortSignal(signal) : request)));
  if (result.year !== input.wanted_year || result.scope !== input.report_scope || result.target !== input.target_scope) {
    throw new Error("Der gelieferte Bericht stimmt nicht mit dem angeforderten Bereich überein.");
  }
  if (result.seed_member !== seed_member) throw new Error("Das synthetische Testdienstbuch stimmt nicht mit der gewählten Identität überein.");
  if (input.export_all && result.has_more) throw new Error("Unvollständiger Export wurde abgebrochen.");
  return result;
}
export async function setReportingType(client: SupabaseClient, type: string, relevant: boolean, reason: string) {
  checked(await client.rpc("ff_set_reporting_type", {
    target_type: devEventTypeSchema.parse(type), relevant: z.boolean().parse(relevant), reason: memberReasonSchema.parse(reason),
  }));
}
