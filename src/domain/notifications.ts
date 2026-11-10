import { z } from "zod";
import { dashboardEventHref } from "./dashboard";

export const notificationCategories = {
  services: "Übungsdienste", changes: "Terminänderungen", reminders: "Erinnerungen",
  vehicles: "Fahrzeugreservierungen", administration: "Administrative Aufgaben", information: "Allgemeine Informationen",
} as const;
export const notificationCategorySchema = z.enum(["services","changes","reminders","vehicles","administration","information"]);
export const notificationPreferencesSchema = z.object({
  push_enabled:z.boolean(),categories:z.array(notificationCategorySchema).max(6),reminder_two_hours:z.boolean(),
});
export const noticeSchema = z.object({
  id:z.uuid(),source_kind:z.enum(["event","attendance","vehicle","registration","test"]),target_id:z.uuid(),
  event_type:z.string(),category:notificationCategorySchema,title:z.string(),message:z.string(),
  created_at:z.iso.datetime({offset:true}),read_at:z.iso.datetime({offset:true}).nullable(),
  delivery:z.object({total:z.number().int().nonnegative(),accepted:z.number().int().nonnegative(),
    pending:z.number().int().nonnegative(),failed:z.number().int().nonnegative(),cancelled:z.number().int().nonnegative()}),
});
export const notificationWorkspaceSchema = z.object({
  actor_id:z.uuid(),unread:z.number().int().nonnegative(),notices:z.array(noticeSchema).max(100),
  preferences:notificationPreferencesSchema,server_ready:z.boolean(),
  public_key:z.string().regex(/^[A-Za-z0-9_-]{87}$/).nullable(),
  devices:z.array(z.object({id:z.uuid(),device_name:z.string(),created_at:z.iso.datetime({offset:true}),
    last_success_at:z.iso.datetime({offset:true}).nullable(),active:z.boolean()})),
});
export type NotificationWorkspace = z.infer<typeof notificationWorkspaceSchema>;
export type Notice = z.infer<typeof noticeSchema>;
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export function notificationHref(notice: Pick<Notice,"source_kind"|"target_id">) {
  const id=z.uuid().parse(notice.target_id);
  switch(notice.source_kind){
    case "vehicle":return dashboardEventHref(id,"fahrzeuge");
    case "event":return dashboardEventHref(id);
    case "attendance":return dashboardEventHref(id,"dienste","attendance");
    case "registration":return "/administration/";
    case "test":return "/profil/";
  }
}
export function pushSupport() {
  return typeof window!=="undefined" && window.isSecureContext && "serviceWorker" in navigator
    && "PushManager" in window && "Notification" in window;
}
export function publicApplicationKey(key:string):ArrayBuffer {
  if(!/^[A-Za-z0-9_-]{87}$/.test(key))throw new Error("Öffentlicher Push-Schlüssel ungültig.");
  const value=atob(key.replace(/-/g,"+").replace(/_/g,"/")+"=");
  const bytes=new Uint8Array(value.length);
  for(let i=0;i<value.length;i++)bytes[i]=value.charCodeAt(i);
  if(bytes.length!==65 || bytes[0]!==4)throw new Error("Öffentlicher Push-Schlüssel ungültig.");
  return bytes.buffer;
}
const pushErrors = {
  unsupported: "Dieser Browser unterstützt Push hier nicht. Eine sichere Verbindung und ein geeigneter Browser sind erforderlich. In-App-Nachrichten bleiben verfügbar.",
  permission_blocked: "Benachrichtigungen sind im Browser blockiert. Die Freigabe muss bewusst in den Website-Einstellungen geändert werden.",
  permission_not_granted: "Die Benachrichtigungsberechtigung wurde nicht erteilt. In-App-Nachrichten bleiben verfügbar.",
  permission_failed: "Die Benachrichtigungsberechtigung konnte nicht abgefragt werden. Bitte Browser- und Systemeinstellungen prüfen.",
  worker_unavailable: "Der App-Service-Worker ist nicht verfügbar oder noch nicht aktiviert. Bitte kurz warten und die App erneut öffnen; ungespeicherte Eingaben vorher sichern.",
  subscription_lookup_failed: "Das vorhandene Browser-Abonnement konnte nicht geprüft werden. Es wurde nicht gelöscht. In-App-Nachrichten bleiben verfügbar.",
  subscription_key_mismatch: "Das bestehende Browser-Abonnement verwendet einen anderen öffentlichen Push-Schlüssel. Es wurde nicht ersetzt. Bitte dieses eigene Gerät bewusst deaktivieren und anschließend erneut aktivieren.",
  public_key_invalid: "Der öffentliche Push-Schlüssel ist ungültig. Bitte die Administration informieren; vorhandene Geräte bleiben unverändert.",
  push_service_failed: "Der Browser konnte das Abonnement bei seinem Push-Dienst nicht erstellen, obwohl die Website-Berechtigung erteilt ist. In Edge: Browser vollständig schließen und neu starten. Falls es weiter fehlschlägt, Netzwerk, Proxy/VPN und Browser-/Windows-Richtlinien prüfen lassen. Erneutes Erteilen der Website-Berechtigung allein behebt diesen Fehler nicht. In-App-Nachrichten bleiben verfügbar.",
  subscription_create_failed: "Der Browser konnte kein Push-Abonnement erstellen. Bitte Browser- und Systemeinstellungen prüfen. Die Website-Berechtigung allein bestätigt noch keine Push-Registrierung.",
  backend_registration_failed: "Das Browser-Abonnement konnte nicht beim Backend registriert werden. Bitte Verbindung, Anmeldung und Freigabe prüfen und erneut versuchen. Andere registrierte Geräte bleiben unverändert.",
  subscription_cleanup_failed: "Die Backend-Registrierung ist fehlgeschlagen und das neu erstellte Browser-Abonnement konnte nicht entfernt werden. Bitte erneut prüfen; andere Geräte wurden nicht verändert.",
} as const;
export type PushErrorCode = keyof typeof pushErrors;
export class PushRegistrationError extends Error {
  readonly browserError:string;
  constructor(readonly code:PushErrorCode,cause?:unknown) {
    super(pushErrors[code]);
    this.name="PushRegistrationError";
    const name=cause instanceof Error ? cause.name : "";
    this.browserError=["AbortError","NotAllowedError","InvalidStateError","NotSupportedError","SecurityError","NetworkError","TypeError"].includes(name) ? name : "UnknownError";
  }
}
export function notificationDiagnostic(error:PushRegistrationError) {
  return {code:error.code,browserError:error.browserError};
}
export function notificationError(cause?:unknown) {
  if(cause instanceof PushRegistrationError)return `${cause.message} Diagnosecode: ${cause.code}.`;
  return "Benachrichtigungsanfrage fehlgeschlagen oder nicht mehr berechtigt. Bitte erneut prüfen. Geräte-Endpoints und Schlüssel werden nicht angezeigt.";
}
