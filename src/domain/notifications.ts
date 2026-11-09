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
export function notificationError() {
  return "Benachrichtigungsanfrage fehlgeschlagen oder nicht mehr berechtigt. Bitte erneut prüfen. Geräte-Endpoints und Schlüssel werden nicht angezeigt.";
}
