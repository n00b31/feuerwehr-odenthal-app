"use client";

import Link from "next/link";
import { useCallback,useEffect,useRef,useState,type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Bell,RefreshCw,CalendarDays,Clock3,Truck,ShieldCheck,Info } from "lucide-react";
import { z } from "zod";
import { notificationCategories,notificationCategorySchema,notificationError,notificationHref,pushSupport,pushStages,
  type PushStage,type NotificationPreferences,type Notice } from "@/domain/notifications";
import { activatePush,currentPushDevice,deactivatePush,removePush,readNotification,readNotifications,saveNotificationPreferences,testPush } from "@/data/supabase-notifications";
import { dateLabel } from "@/domain/time";
import { AppDialog } from "./app-dialog";
import { useMobileLayout } from "./responsive-ui";
import { useNotifications } from "./notification-context";

function changed(){window.dispatchEvent(new Event("ff-notifications-changed"));}
async function openNotice(client:SupabaseClient,actor:string,id:string){
  const snapshot=await readNotifications(client,actor,z.uuid().parse(id));
  const notice=snapshot.notices.find(item=>item.id===id);
  if(!notice)throw new Error("notice_not_available");
  await readNotification(client,id);changed();
  return notificationHref(notice);
}
export function NotificationBridge({client,actorId}:{client:SupabaseClient;actorId:string|null}){
  const router=useRouter(),[pending,setPending]=useState<string|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const observed=useRef<string|null>(null);
  const [incoming]=useState(()=>typeof window==="undefined"?null:new URLSearchParams(window.location.search).get("notification"));
  const open=useCallback(async(id:string)=>{
    if(!actorId)return;
    setBusy(true);setError("");
    try{const href=await openNotice(client,actorId,id);setPending(null);router.push(href);}
    catch{setError("Diese Benachrichtigung oder der zugehörige Vorgang ist nicht mehr berechtigt verfügbar.");}
    finally{setBusy(false);}
  },[client,actorId,router]);
  useEffect(()=>{
    let active=true;
    const id=incoming;
    if(id && actorId && observed.current!==id){
      const consume=()=>{
          observed.current=id;
          const url=new URL(window.location.href);
          if(url.searchParams.get("notification")===id){url.searchParams.delete("notification");window.history.replaceState(null,"",url);}
      };
      void openNotice(client,actorId,id).then(href=>{if(active){consume();router.push(href);}})
        .catch(()=>{if(active){consume();setError("Diese Benachrichtigung oder der zugehörige Vorgang ist nicht mehr berechtigt verfügbar.");}});
    }
    function receive(event:MessageEvent){
      if(event.data?.type!=="FF_NOTIFICATION_OPEN")return;
      const parsed=z.uuid().safeParse(event.data.notification_id);
      if(parsed.success){setPending(parsed.data);setError("");}
    }
    if("serviceWorker" in navigator)navigator.serviceWorker.addEventListener("message",receive);
    return()=>{active=false;if("serviceWorker" in navigator)navigator.serviceWorker.removeEventListener("message",receive);};
  },[client,actorId,router,incoming]);
  return <>{pending && <section className="notice" role="status"><strong>Neue organisatorische Nachricht</strong>
    <p>Die aktuelle Arbeitsansicht bleibt erhalten. Erst bewusstes Öffnen wechselt zum berechtigten Vorgang.</p>
    {!actorId && <p>Bitte zuerst anmelden und die serverseitige Freigabe abwarten.</p>}
    <div className="dev-actions"><button className="button" disabled={busy || !actorId} onClick={()=>void open(pending)}>Benachrichtigung öffnen</button>
      <button className="button secondary" disabled={busy} onClick={()=>setPending(null)}>Später</button></div></section>}
    {error && <p className="notice error" role="alert">{error}</p>}</>;
}
function deliveryLabel(notice:Notice){
  const d=notice.delivery;
  if(!d.total)return "In-App verfügbar · kein Push-Auftrag";
  return `Push: ${d.accepted} vom Dienst angenommen · ${d.pending} ausstehend · ${d.failed} fehlgeschlagen · ${d.cancelled} nicht mehr zulässig`;
}
const noticeIcons={services:CalendarDays,changes:RefreshCw,reminders:Clock3,vehicles:Truck,administration:ShieldCheck,information:Info};
export function NotificationPreview({client,actorId}:{client:SupabaseClient;actorId:string}){
  const {snapshot,error,reload}=useNotifications(),mobile=useMobileLayout(),router=useRouter();
  const [opened,setOpened]=useState(false),[busy,setBusy]=useState(false),[openError,setOpenError]=useState("");
  const [position,setPosition]=useState<CSSProperties>({});
  const notices=[...(snapshot?.notices??[])].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||a.id.localeCompare(b.id)).slice(0,5);
  async function select(id:string){
    setBusy(true);setOpenError("");
    try{const href=await openNotice(client,actorId,id);setOpened(false);router.push(href);}
    catch{setOpenError("Diese Benachrichtigung oder der zugehörige Vorgang ist nicht mehr berechtigt verfügbar.");}
    finally{setBusy(false);}
  }
  return <><button className="icon-button notification-bell" aria-label="Benachrichtigungen öffnen"
    aria-haspopup="dialog" aria-expanded={opened} title={error||`${snapshot?.unread??0} ungelesene Benachrichtigungen`}
    onClick={event=>{
      const rect=event.currentTarget.getBoundingClientRect();
      setPosition({top:rect.bottom+8,right:Math.max(12,Math.min(window.innerWidth-rect.right,window.innerWidth-Math.min(420,window.innerWidth-24)-12))});
      setOpenError("");setOpened(true);
      void reload().catch(()=>{/* The shared inbox displays the error in the preview. */});
    }}><Bell size={20}/>{(error || !!snapshot?.unread) && <span className="notification-badge">{error?"!":snapshot!.unread>99?"99+":snapshot!.unread}</span>}</button>
    {opened && <AppDialog title="Aktuelle Benachrichtigungen" className={`notification-preview${mobile?" mobile-sheet":""}`}
      style={mobile?undefined:position} lockScroll closeDisabled={busy} close={()=>setOpened(false)}>
      {(error || openError) && <p className="notice error" role="alert">{openError||error}</p>}
      {!snapshot && !error && <p role="status">Benachrichtigungen werden geladen …</p>}
      {snapshot && <>
        {!notices.length?<p>Keine neuen Benachrichtigungen. <span>Dein Posteingang ist leer.</span></p>
          :!snapshot.unread && <p>Keine ungelesenen Benachrichtigungen. Deine letzten gelesenen Nachrichten:</p>}
        <div className="notification-preview-list">{notices.map(notice=>{
          const Icon=noticeIcons[notice.category];
          return <button key={notice.id} className="notification-preview-item" disabled={busy} onClick={()=>void select(notice.id)}>
            <Icon size={20} aria-hidden="true"/><span><strong>{notice.title}</strong><span className="notification-excerpt">{notice.message}</span>
              <small><time dateTime={notice.created_at}>{dateLabel(notice.created_at,{year:"numeric",hour:"2-digit",minute:"2-digit"})}</time> · {notice.read_at?"Gelesen":"Ungelesen"}</small></span>
          </button>;
        })}</div>
      </>}
      <nav className="dev-actions" aria-label="Benachrichtigungsaktionen">
        <Link className="button secondary" href="/profil/#posteingang" onClick={()=>setOpened(false)}>Alle Benachrichtigungen</Link>
        <Link className="button secondary" href="/profil/#benachrichtigungseinstellungen" onClick={()=>setOpened(false)}>Einstellungen</Link>
      </nav>
    </AppDialog>}
  </>;
}
export function SupabaseNotifications({client,actorId,onPushBusy}:{client:SupabaseClient;actorId:string;onPushBusy:(busy:boolean)=>void}){
  const router=useRouter();
  const {snapshot,error:inboxError,reload:reloadInbox}=useNotifications();
  const [preferences,setPreferences]=useState<NotificationPreferences|null>(null);
  const [device,setDevice]=useState<string|null>(null),[name,setName]=useState("Mein Gerät");
  const [permission,setPermission]=useState<NotificationPermission|"unsupported">("default");
  const [error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const [pushStage,setPushStage]=useState<PushStage|null>(null);
  const [registrationFailed,setRegistrationFailed]=useState(false);
  const stage=useRef<PushStage|null>(null);
  function progress(value:PushStage){stage.current=value;setPushStage(value);setRegistrationFailed(false);}
  const working=useRef(false),dirty=useRef(false),epoch=useRef({value:0});
  const reload=useCallback(()=>{
    const version=++epoch.current.value;
    return reloadInbox().then(async data=>{
      if(!data)return false;
      let id:string|null=null,deviceError="";
      try { if(pushSupport())id=await currentPushDevice(client); }
      catch(cause) { deviceError=notificationError(cause); }
      if(version!==epoch.current.value)return false;
      if(!dirty.current)setPreferences(data.preferences);setDevice(id);
      setPermission(pushSupport()?Notification.permission:"unsupported");if(deviceError)setError(deviceError);
      return !deviceError;
    });
  },[client,reloadInbox]);
  useEffect(()=>{const lifetime=epoch.current;return()=>{lifetime.value++;};},[]);
  useEffect(()=>{
    let current=true;
    if(snapshot && !working.current)void (async()=>{
      const id=pushSupport()?await currentPushDevice(client):null;
      if(!current)return;
      if(!dirty.current)setPreferences(snapshot.preferences);
      setDevice(id);setPermission(pushSupport()?Notification.permission:"unsupported");
    })().catch(cause=>{if(current)setError(notificationError(cause));});
    return()=>{current=false;};
  },[client,snapshot]);
  async function run(operation:()=>Promise<unknown>,success:string){
    if(working.current)return;
    working.current=true;setBusy(true);onPushBusy(true);setError("");setMessage("");
    try{await operation();if(await reload())setMessage(success);}
    catch(cause){
      if(stage.current)setRegistrationFailed(true);
      setPermission(pushSupport()?Notification.permission:"unsupported");
      if(stage.current && stage.current!=="backend")setError(notificationError(cause));
      else try { await reload();setError(notificationError(cause)); }
      catch(refreshError){setError(`${notificationError(cause)} Aktualisierung fehlgeschlagen: ${notificationError(refreshError)}`);}
    }
    finally{working.current=false;setBusy(false);onPushBusy(false);setPushStage(null);stage.current=null;}
  }
  const local=snapshot?.devices.find(item=>item.id===device);
  const current=local?.active?local:undefined;
  const status=permission==="unsupported" ? "Auf diesem Gerät nicht unterstützt" : permission==="denied" ? "Vom Browser blockiert"
    : current && snapshot?.preferences.push_enabled ? "Aktiviert" : local ? "Deaktiviert"
    : permission==="granted" ? "Nicht aktiviert · Browserberechtigung erteilt" : "Noch nicht eingerichtet";
  return <section className="card section-card" aria-label="Benachrichtigungen">
    <div className="event-card-top"><h2><Bell size={22}/> Benachrichtigungen</h2>
      <button className="button secondary" disabled={busy} onClick={()=>{setError("");void reload().catch(cause=>setError(notificationError(cause)));}}><RefreshCw size={18}/>Benachrichtigungen aktualisieren</button></div>
    <p className="notice">Organisatorische Informationen, keine Alarmierung. Kein Ersatz für aPager oder die offizielle Feuerwehralarmierung.</p>
    <p><strong>Push-Status: {status}</strong></p>
    <p role="status">Registrierung: {pushStage?"Registrierung läuft":registrationFailed?"Registrierung fehlgeschlagen":current?"Aktiv":local?"Deaktiviert":"Nicht eingerichtet"}</p>
    <p>Die Browserberechtigung wird ausschließlich bei bewusster Aktivierung angefragt. Auf dem Sperrbildschirm stehen keine fachlichen Details.</p>
    {permission==="unsupported" && <p className="notice">In-App-Nachrichten bleiben verfügbar. Auf dem iPhone die App in Safari über „Teilen“ → „Zum Home-Bildschirm“ installieren und von dort öffnen. Ein geeignetes aktuelles System und eine sichere Verbindung sind erforderlich.</p>}
    {permission==="denied" && <p className="notice">Die Ablehnung wird respektiert. Zum späteren Freigeben die Benachrichtigungsberechtigung in den Browser- beziehungsweise Systemeinstellungen selbst ändern.</p>}
    {(error || inboxError) && <p className="notice error" role="alert">{error||inboxError}</p>}
    {message && <p className="notice" role="status">{message}</p>}
    {busy && pushStage && <p className="notice" role="status" aria-live="polite">{pushStages[pushStage]}</p>}
    {!snapshot && !error && <p role="status">Persönliche Benachrichtigungen werden geladen …</p>}
    {snapshot && preferences && <>
      {!snapshot.server_ready && <p className="notice">Push-Versand ist serverseitig noch nicht eingerichtet oder pausiert. In-App-Nachrichten sind unabhängig von der Browserunterstützung verfügbar.</p>}
      <div className="form-grid"><label>Gerätename<input value={name} onChange={event=>setName(event.target.value)} minLength={1} maxLength={80} disabled={busy}/></label>
        <button className="button" disabled={busy || permission==="unsupported" || permission==="denied" || !snapshot.server_ready || !snapshot.public_key || !name.trim()}
          onClick={()=>void run(()=>activatePush(client,snapshot.public_key!,name,progress,local?.id),"Push für dieses eigene Gerät aktiviert.")}>Push-Benachrichtigungen aktivieren</button>
        {current && <button className="button secondary" disabled={busy} onClick={()=>void run(()=>deactivatePush(client,current.id),"Push für dieses Gerät deaktiviert.")}>Push auf diesem Gerät deaktivieren</button>}
        <button className="button secondary" disabled={busy || !current || !snapshot.preferences.push_enabled || !snapshot.server_ready}
          onClick={()=>void run(()=>testPush(client,current!.id),"DEV-Test nur an dieses eigene Gerät angefordert. Anbieterannahme ist kein Nachweis einer Geräteanzeige.")}>Test-Push senden · DEV</button></div>
      <p className="muted text-sm">Testlimit pro Konto, gemeinsam für alle Geräte: höchstens einmal pro Minute und dreimal pro Stunde. Deaktivieren, Reaktivieren oder Entfernen setzt dieses Limit nicht zurück.</p>
      <form id="benachrichtigungseinstellungen" className="form-grid" onSubmit={event=>{event.preventDefault();void run(async()=>{
        await saveNotificationPreferences(client,preferences);dirty.current=false;
      },"Benachrichtigungseinstellungen gespeichert.");}}>
        <h3 className="span-2">Benachrichtigungseinstellungen</h3>
        {JSON.stringify(preferences)!==JSON.stringify(snapshot.preferences) && <p className="notice span-2">Diese Einstellungen sind noch nicht gespeichert. Der Push-Status zeigt weiterhin den bestätigten Serverstand.</p>}
        <label className="checkbox-label span-2"><input type="checkbox" checked={preferences.push_enabled} disabled={busy} onChange={event=>{dirty.current=true;setPreferences({...preferences,push_enabled:event.target.checked});}}/>Push global aktivieren</label>
        <p className="muted text-sm span-2">Die Kategorien steuern neue organisatorische In-App- und Push-Mitteilungen. Sicherheitsmails, E-Mail-Verifizierung und Freigabe bleiben unverändert.</p>
        {Object.entries(notificationCategories).map(([key,label])=><label className="checkbox-label" key={key}><input type="checkbox" disabled={busy}
          checked={preferences.categories.includes(notificationCategorySchema.parse(key))} onChange={event=>{
            dirty.current=true;const category=notificationCategorySchema.parse(key);setPreferences({...preferences,
              categories:event.target.checked?[...preferences.categories,category]:preferences.categories.filter(value=>value!==category)});
          }}/>{label}</label>)}
        <label className="checkbox-label span-2"><input type="checkbox" checked={preferences.reminder_two_hours} disabled={busy} onChange={event=>{
          dirty.current=true;setPreferences({...preferences,reminder_two_hours:event.target.checked});
        }}/>Zusätzliche Übungsdienst-Erinnerung zwei Stunden vorher</label>
        <button className="button secondary" disabled={busy}>Benachrichtigungseinstellungen speichern</button>
      </form>
      <h3>Registrierte Geräte</h3>
      <p className="muted text-sm">Aktivierung und Anbieterannahme sind getrennt. „Noch keine“ bedeutet nur: bisher kein bestätigter Versand. Andere Browser können hier serverseitig deaktiviert oder entfernt werden; ihr lokales Abonnement bleibt dort bestehen. Bereits an den Anbieter übergebene Nachrichten können nicht zurückgerufen werden.</p>
      {!snapshot.devices.length && <p>Noch kein Gerät registriert.</p>}
      {snapshot.devices.map(item=><article className="notice-row" key={item.id}><span><strong>{item.device_name}{item.id===device ? " · dieses Gerät" : ""}</strong>
        <small>Registrierung: {item.active?"Aktiv":"Deaktiviert"} · Registriert {dateLabel(item.created_at)} · Letzte Anbieterannahme: {item.last_success_at?dateLabel(item.last_success_at):"noch keine"}</small>
        {!item.active && item.id!==device && <small>Zum Reaktivieren dieses Gerät öffnen und Push dort erneut aktivieren.</small>}</span>
        <div className="dev-actions">
          {item.active && <button className="button secondary" disabled={busy} onClick={()=>void run(()=>deactivatePush(client,item.id),"Eigenes Gerät deaktiviert.")}>Gerät deaktivieren</button>}
          {!item.active && item.id===device && <button className="button secondary" disabled={busy || permission!=="granted" || !snapshot.server_ready}
            onClick={()=>void run(()=>activatePush(client,snapshot.public_key!,item.device_name,progress,item.id),"Eigenes Gerät reaktiviert.")}>Gerät reaktivieren</button>}
          <button className="button secondary" disabled={busy} onClick={()=>{
            if(window.confirm(`Gerät „${item.device_name}“ dauerhaft entfernen? Neue Push-Zustellungen werden verhindert. Auf einem anderen Gerät bleibt dessen lokales Browser-Abonnement bestehen.`))
              void run(()=>removePush(client,item.id,item.id===device),"Eigenes Gerät dauerhaft entfernt.");
          }}>Gerät entfernen</button>
        </div></article>)}
      <h3 id="posteingang">Posteingang · {snapshot.unread} ungelesen</h3>
      <p className="muted text-sm">Die neuesten bis zu 100 berechtigt sichtbaren Nachrichten. Ungelesen zählt alle sichtbaren Nachrichten. Versandstatus bezeichnet Push-Dienstannahme, nicht den nachgewiesenen Empfang.</p>
      <button className="button secondary" disabled={busy || !snapshot.unread} onClick={()=>void run(()=>readNotification(client),"Alle berechtigt sichtbaren Nachrichten als gelesen markiert.")}>Alle als gelesen markieren</button>
      {!snapshot.notices.length && <p>Keine berechtigt sichtbaren Benachrichtigungen.</p>}
      {snapshot.notices.map(notice=><article className="notice-row" key={notice.id}><span><strong>{notice.title}</strong>
        <small>{notice.read_at?"Gelesen":"Ungelesen"} · {dateLabel(notice.created_at)}</small><p>{notice.message}</p><small>{deliveryLabel(notice)}</small>
        <div className="dev-actions"><button className="button secondary" disabled={busy} onClick={()=>void run(async()=>router.push(await openNotice(client,actorId,notice.id)),"Berechtigten Vorgang geöffnet.")}>Vorgang öffnen</button>
          {!notice.read_at && <button className="button secondary" disabled={busy} onClick={()=>void run(()=>readNotification(client,notice.id),"Nachricht als gelesen gespeichert.")}>Als gelesen markieren</button>}</div></span></article>)}
    </>}
  </section>;
}

const adminSchema=z.object({
  global:z.boolean(),config:z.object({enabled:z.boolean(),ready:z.boolean(),categories:z.array(notificationCategorySchema),
    reminder_hours:z.number(),unanswered_hours:z.number()}).nullable(),
  deliveries:z.array(z.object({id:z.uuid(),title:z.string(),event_type:z.string(),status:z.string(),attempts:z.number(),
    attempted_at:z.string().nullable(),finished_at:z.string().nullable(),error_code:z.string().nullable()})),
});
export function NotificationAdministration({client}:{client:SupabaseClient}){
  const [opened,setOpened]=useState(false);
  return <section className="card section-card"><details onToggle={event=>{if(event.currentTarget.open)setOpened(true);}}>
    <summary>Organisatorischer Benachrichtigungsversand</summary>{opened && <AdminBody client={client}/>}</details></section>;
}
function AdminBody({client}:{client:SupabaseClient}){
  const [snapshot,setSnapshot]=useState<z.infer<typeof adminSchema>|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const reload=useCallback(()=>Promise.resolve(client.rpc("ff_notification_admin")).then(({data,error})=>{
    if(error)throw error;setSnapshot(adminSchema.parse(data));
  }),[client]);
  useEffect(()=>{void reload().catch(()=>setError(notificationError()));},[reload]);
  async function configure(enabled:boolean,categories:NotificationPreferences["categories"]){
    setBusy(true);setError("");
    try{const {error}=await client.rpc("ff_notification_configure",{enabled,categories});if(error)throw error;await reload();}
    catch{setError(notificationError());}finally{setBusy(false);}
  }
  return <><p>Nur serverseitig berechtigte Versanddiagnosen. Endpoints und Subscription-Schlüssel werden nicht angezeigt. Keine zusätzlichen FIRE_CHIEF-Rechte.</p>
    {error && <p className="notice error" role="alert">{error}</p>}
    <button className="button secondary" disabled={busy} onClick={()=>void reload().catch(()=>setError(notificationError()))}>Versandstatus aktualisieren</button>
    {snapshot?.global && snapshot.config && <fieldset disabled={busy}><legend>Globale organisatorische Kategorien</legend>
      <label className="checkbox-label"><input type="checkbox" checked={snapshot.config.enabled} onChange={event=>void configure(event.target.checked,snapshot.config!.categories)}/>Organisatorische Verarbeitung und Versand freigegeben</label>
      {Object.entries(notificationCategories).map(([key,label])=><label className="checkbox-label" key={key}><input type="checkbox" checked={snapshot.config!.categories.includes(notificationCategorySchema.parse(key))}
        onChange={event=>{const category=notificationCategorySchema.parse(key);void configure(snapshot.config!.enabled,event.target.checked?
          [...snapshot.config!.categories,category]:snapshot.config!.categories.filter(value=>value!==category));}}/>{label}</label>)}
      <p>Erinnerungen: {snapshot.config.reminder_hours} Stunden vor Übungsdienst, {snapshot.config.unanswered_hours} Stunden bei fehlender Antwort; optional zwei Stunden und nach Dienstende. Zeitabstände sind serverseitig vorbereitet, keine lokale Uhr als Autorität.</p></fieldset>}
    {snapshot && !snapshot.deliveries.length && <p>Keine berechtigt sichtbaren Versandaufträge.</p>}
    {snapshot?.deliveries.map(item=><article className="notice-row" key={item.id}><span><strong>{item.title}</strong><small>{item.status} · Versuche {item.attempts} · {item.error_code??"kein Fehler"}</small>
      <small>{item.attempted_at?dateLabel(item.attempted_at):"Noch kein Versandversuch"} · {item.event_type}</small></span></article>)}</>;
}
