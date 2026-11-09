import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { publicPath } from "@/config/app";
import { notificationWorkspaceSchema,notificationPreferencesSchema,publicApplicationKey,type NotificationPreferences } from "@/domain/notifications";

function checked<T>({data,error}:{data:T;error:unknown}) { if(error)throw error;return data; }
export async function readNotifications(client:SupabaseClient,actor:string,id?:string) {
  const snapshot=notificationWorkspaceSchema.parse(checked(await client.rpc("ff_notifications",{notice_id:id ? z.uuid().parse(id) : null})));
  if(snapshot.actor_id!==actor)throw new Error("Benachrichtigungsidentität stimmt nicht überein.");
  return snapshot;
}
export async function readNotification(client:SupabaseClient,id?:string) {
  checked(await client.rpc("ff_notification_read",{notice_id:id ? z.uuid().parse(id) : null}));
}
export async function saveNotificationPreferences(client:SupabaseClient,value:NotificationPreferences) {
  checked(await client.rpc("ff_notification_preferences",notificationPreferencesSchema.parse(value)));
}
export async function currentPushDevice(client:SupabaseClient) {
  if(!("serviceWorker" in navigator))return null;
  const registration=await navigator.serviceWorker.getRegistration(publicPath("/"));
  const subscription=await registration?.pushManager.getSubscription();
  if(!subscription)return null;
  return z.uuid().nullable().parse(checked(await client.rpc("ff_push_current",{endpoint:subscription.endpoint})));
}
export async function activatePush(client:SupabaseClient,key:string,name:string) {
  // Invoke requestPermission synchronously from the caller's click, before awaiting a worker.
  const permission=Notification.permission==="default" ? await Notification.requestPermission() : Notification.permission;
  if(permission!=="granted")throw new Error("Browserberechtigung wurde nicht erteilt. Die In-App-Übersicht bleibt verfügbar.");
  const registration=await navigator.serviceWorker.getRegistration(publicPath("/"));
  if(!registration?.active)throw new Error("Der App-Service-Worker ist noch nicht bereit. Bitte die App erneut öffnen.");
  let subscription=await registration.pushManager.getSubscription();
  let created=false;
  if(!subscription){subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicApplicationKey(key)});created=true;}
  try {
    return z.uuid().parse(checked(await client.rpc("ff_push_register",{subscription:subscription.toJSON(),device_name:name})));
  } catch(error) {
    if(created && !await subscription.unsubscribe())throw new Error("Registrierung fehlgeschlagen; Browser-Abonnement konnte nicht entfernt werden.");
    throw error;
  }
}
export async function deactivatePush(client:SupabaseClient,id:string,current=false) {
  let failure:unknown;
  try { checked(await client.rpc("ff_push_deactivate",{device_id:z.uuid().parse(id),endpoint:null})); }
  catch(error) { failure=error; }
  if(current && "serviceWorker" in navigator){
    const registration=await navigator.serviceWorker.getRegistration(publicPath("/"));
    const subscription=await registration?.pushManager.getSubscription();
    if(subscription && !await subscription.unsubscribe())throw new Error("Browser-Abonnement konnte nicht entfernt werden.");
  }
  if(failure)throw failure;
}
export async function releaseCurrentPush(client:SupabaseClient) {
  if(!("serviceWorker" in navigator))return;
  const registration=await navigator.serviceWorker.getRegistration(publicPath("/"));
  const subscription=await registration?.pushManager.getSubscription();
  if(!subscription)return;
  let failure:unknown;
  try { checked(await client.rpc("ff_push_deactivate",{device_id:null,endpoint:subscription.endpoint})); }
  catch(error){failure=error;}
  const removed=await subscription.unsubscribe();
  for(const notification of await registration!.getNotifications())if(notification.tag.startsWith("ff-notice:"))notification.close();
  if(!removed)throw new Error("Browser-Abonnement konnte nicht entfernt werden.");
  if(failure)throw failure;
}
export async function testPush(client:SupabaseClient,id:string) {
  const result=checked(await client.functions.invoke("push-dispatch",{body:{action:"test",device_id:z.uuid().parse(id)}}));
  return z.object({queued:z.literal(true)}).parse(result);
}
