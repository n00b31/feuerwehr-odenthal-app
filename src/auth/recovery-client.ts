import { FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authErrorMessage } from "./validation";

export const recoveryRequestMessage = "Wenn ein bereits verifiziertes, berechtigtes Konto existiert und die Versandgrenzen es erlauben, wird eine Wiederherstellung angefordert. Diese Antwort bestätigt weder ein Konto noch den Mailversand. DEV: nur autorisierte Testkonten. Es gelten die Versandgrenzen der App, von Supabase Auth und des konfigurierten Mailanbieters.";

export async function requestPasswordRecovery(client: SupabaseClient, input:
  { mode: "self"; email: string } | { mode: "admin"; target_user: string }) {
  const { data, error } = await client.functions.invoke("password-recovery", { body: input });
  if (error) {
    if (error instanceof FunctionsHttpError && error.context instanceof Response) {
      const status = error.context.status;
      throw Object.assign(new Error(status === 429 ? "Anfragegrenze erreicht. Später erneut versuchen; kein automatischer Retry."
        : status === 401 || status === 403 ? "Keine serverseitig bestätigte Berechtigung zur Wiederherstellung."
        : status === 400 ? "Ein bestehendes Konto mit bereits verifizierter Feuerwehr-Adresse ist erforderlich."
        : "Wiederherstellung oder Versandstatus nicht verfügbar. DEV-Versand, Edge Function und Migration 025 prüfen; keine automatische Wiederholung."),
      { code: status === 429 ? "recovery_rate_limit" : "recovery_request_failed" });
    }
    throw new Error(authErrorMessage(error));
  }
  z.object({ status: z.literal("conditional") }).parse(data);
}

export async function exchangeServerRecovery(client: SupabaseClient, requestId: string, code: string) {
  const { data, error } = await client.functions.invoke("password-recovery", {
    body: { mode: "exchange", request_id: requestId, code },
  });
  if (error) throw Object.assign(new Error("Recovery exchange unavailable"), { code: "recovery_invalid" });
  const proof = z.object({ status: z.literal("verified"), user_id: z.uuid(),
    session: z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1) }) }).parse(data);
  const saved = await client.auth.setSession(proof.session);
  if (saved.error) throw saved.error;
  if (saved.data.user?.id !== proof.user_id) throw Object.assign(new Error("Recovery identity mismatch"), { code: "recovery_invalid" });
  return proof.user_id;
}
