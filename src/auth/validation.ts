import { z } from "zod";
import { publicPath } from "../config/app";

export const emailSchema = z.email("Bitte eine gültige E-Mail-Adresse eingeben.").trim()
  .refine((value) => /^[^@\s]+@feuerwehr-odenthal\.de$/i.test(value), "Nur @feuerwehr-odenthal.de ist erlaubt.");
export const registrationSchema = z.object({
  email: emailSchema,
  password: z.string().min(12, "Das Passwort muss mindestens 12 Zeichen enthalten.").max(128),
  displayName: z.string().trim().min(2, "Bitte einen Anzeigenamen eingeben.").max(120),
});

export function callbackUrl(origin: string) {
  return new URL(publicPath("/auth/callback/"), origin).href;
}

export function authErrorMessage(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
  if (status === 429 || /rate_limit/.test(code)) return "Supabase-Versand- oder Anmeldelimit erreicht. Bitte später erneut versuchen; es erfolgt keine automatische Wiederholung.";
  if (code === "email_address_not_authorized") return "Diese Testadresse ist für den integrierten Supabase-DEV-Mailversand nicht autorisiert. Im Dashboard prüfen; die Domainregel nicht abschalten.";
  if (code === "email_not_confirmed") return "Bitte zuerst die E-Mail-Adresse über die Bestätigungsmail verifizieren.";
  if (code === "invalid_credentials") return "Anmeldung fehlgeschlagen. E-Mail-Adresse und Passwort prüfen.";
  if (code === "weak_password") return "Das Passwort erfüllt die Supabase-Passwortregeln nicht.";
  if (/otp_expired|flow_state|code_verifier|bad_code/.test(code)) return "Der Bestätigungslink ist abgelaufen, bereits verwendet oder gehört zu einem anderen Browser. Nach bestätigter E-Mail erneut anmelden, sonst eine neue Bestätigung anfordern.";
  if (error instanceof Error && (error.name === "TypeError" || /fetch/i.test(error.name))) return "Supabase ist nicht erreichbar. Netzwerkverbindung prüfen; der Zugriff bleibt gesperrt.";
  return "Supabase-Anfrage fehlgeschlagen. DEV-Konfiguration, Auth-Hook, Migrationen und Verbindung prüfen. Es wurde kein erfolgreicher Abschluss bestätigt.";
}
