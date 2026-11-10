import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { publicPath } from "@/config/app";
import { notificationWorkspaceSchema,notificationPreferencesSchema,publicApplicationKey,pushSupport,
  PushRegistrationError,notificationDiagnostic,type PushErrorCode,type NotificationPreferences } from "@/domain/notifications";

function checked<T>({data,error}:{data:T;error:unknown}) { if(error)throw error;return data; }
function pushFailure(code:PushErrorCode,cause?:unknown) {
  const error=new PushRegistrationError(code,cause);
  console.warn("FF_PUSH_DIAG",notificationDiagnostic(error));
  return error;
}
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
  let registration:ServiceWorkerRegistration|undefined;
  try { registration=await navigator.serviceWorker.getRegistration(publicPath("/")); }
  catch(error) { throw pushFailure("worker_unavailable",error); }
  if(!registration?.active)return null;
  let subscription:PushSubscription|null;
  try { subscription=await registration.pushManager.getSubscription(); }
  catch(error) { throw pushFailure("subscription_lookup_failed",error); }
  if(!subscription)return null;
  return z.uuid().nullable().parse(checked(await client.rpc("ff_push_current",{endpoint:subscription.endpoint})));
}
export async function activatePush(client:SupabaseClient,key:string,name:string) {
  if(!pushSupport())throw pushFailure("unsupported");
  // Invoke requestPermission synchronously from the caller's click, before awaiting a worker.
  let permission:NotificationPermission;
  try { permission=Notification.permission==="default" ? await Notification.requestPermission() : Notification.permission; }
  catch(error) { throw pushFailure("permission_failed",error); }
  if(permission!=="granted")throw pushFailure(permission==="denied" ? "permission_blocked" : "permission_not_granted");
  let registration:ServiceWorkerRegistration|undefined;
  try { registration=await navigator.serviceWorker.getRegistration(publicPath("/")); }
  catch(error) { throw pushFailure("worker_unavailable",error); }
  if(!registration?.active || registration.active.state!=="activated")throw pushFailure("worker_unavailable");
  let applicationServerKey:ArrayBuffer;
  try { applicationServerKey=publicApplicationKey(key); }
  catch(error) { throw pushFailure("public_key_invalid",error); }
  let subscription:PushSubscription|null;
  try { subscription=await registration.pushManager.getSubscription(); }
  catch(error) { throw pushFailure("subscription_lookup_failed",error); }
  const previousKey=subscription?.options?.applicationServerKey;
  if(previousKey){
    const previous=new Uint8Array(previousKey),current=new Uint8Array(applicationServerKey);
    if(previous.length!==current.length || previous.some((value,index)=>value!==current[index]))
      throw pushFailure("subscription_key_mismatch");
  }
  let created=false;
  if(!subscription){
    try { subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey});created=true; }
    catch(error) {
      if(Notification.permission==="denied")throw pushFailure("permission_blocked",error);
      throw pushFailure(error instanceof Error && error.name==="AbortError" && Notification.permission==="granted"
        ? "push_service_failed" : "subscription_create_failed",error);
    }
  }
  try {
    return z.uuid().parse(checked(await client.rpc("ff_push_register",{subscription:subscription.toJSON(),device_name:name})));
  } catch(error) {
    if(created){
      try { if(!await subscription.unsubscribe())throw new Error("unsubscribe_failed"); }
      catch(cleanupError) { throw pushFailure("subscription_cleanup_failed",cleanupError); }
    }
    throw pushFailure("backend_registration_failed",error);
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
