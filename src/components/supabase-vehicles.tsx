"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import type {SupabaseClient} from "@supabase/supabase-js";
import {Truck,ChevronLeft,ChevronRight,RefreshCw,Bell} from "lucide-react";
import {readVehicles,requestVehicle,decideVehicle,saveVehicle,readVehicleNotification,saveVehicleOption} from "@/data/supabase-vehicles";
import {vehicleStatus,bindingVehicle,vehicleOverlap,vehicleRequestPayload,type VehicleWorkspace,type Vehicle,
  type VehicleReservation,type VehicleRequestDraft,type VehicleInput,type VehicleState} from "@/domain/vehicles";
import {calendarRange,moveCalendar,calendarInterval,calendarDateSchema,type CalendarView} from "@/domain/calendar";
import {addLocalDays,berlinParts,dateLabel,fromBerlin} from "@/domain/time";
import {eventErrorMessage} from "@/domain/dev-events";
import {AppDialog} from "./app-dialog";

export function VehicleBadge({item}:{item:Pick<VehicleReservation,"kind"|"state">}){
  const status=vehicleStatus[item.state];
  return <span className={`badge ${item.kind==="block" && item.state==="APPROVED" ? "danger" : status.tone}`}>
    {item.kind==="block" && item.state==="APPROVED" ? "⊘ Gesperrt / nicht verfügbar" : `${status.symbol} ${status.label}`}</span>;
}
export function SupabaseVehicles({client,actorId,initialTime,initialEventId=null}:{client:SupabaseClient;actorId:string;initialTime:string;initialEventId?:string|null}){
  const [snapshot,setSnapshot]=useState<VehicleWorkspace|null>(null),[date,setDate]=useState(()=>berlinParts(initialTime).date);
  const [view,setView]=useState<CalendarView>("month"),[vehicleId,setVehicleId]=useState<string|null>(null);
  const [selected,setSelected]=useState<string|null>(initialEventId),[draft,setDraft]=useState<VehicleRequestDraft|null>(null);
  const [editing,setEditing]=useState<{vehicle?:Vehicle;input:VehicleInput}|null>(null),[reason,setReason]=useState("");
  const [error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const epoch=useRef({value:0}),working=useRef(false);
  const [observedEvent,setObservedEvent]=useState(initialEventId);
  if(initialEventId!==observedEvent){
    setObservedEvent(initialEventId);
    if(initialEventId){setSelected(initialEventId);setReason("");}
  }
  const reload=useCallback(()=>{
    const version=++epoch.current.value;
    return readVehicles(client,calendarRange(date,view),vehicleId,selected).then(data=>{
      if(version!==epoch.current.value)return;
      setSnapshot(data);setError("");
      if(!vehicleId && data.vehicles.length) setVehicleId(data.vehicles[0].id);
      if(selected && !data.retained){setSelected(null);setMessage("Vorgang nicht mehr berechtigt verfügbar.");}
    }).catch(cause=>{
      if(version!==epoch.current.value)return;
      setSnapshot(null);setError(cause && typeof cause==="object" && "code" in cause && cause.code==="PGRST202"
        ? "Fahrzeugverwaltung noch nicht verfügbar. DEV-Migrationen 021 bis 023 müssen installiert sein." : eventErrorMessage(cause));
    });
  },[client,date,view,vehicleId,selected]);
  useEffect(()=>{
    const lifetime=epoch.current;
    void reload();const timer=window.setInterval(()=>{if(!document.hidden && !working.current)void reload();},30_000);
    return()=>{lifetime.value++;window.clearInterval(timer);};
  },[reload]);
  async function run(operation:()=>Promise<unknown>,success:string){
    if(working.current)return;
    working.current=true;setBusy(true);setError("");setMessage("");epoch.current.value++;
    try{const result=await operation();setMessage(typeof result==="string" ? result : success);await reload();}
    catch(cause){setError(eventErrorMessage(cause));}
    finally{working.current=false;setBusy(false);}
  }
  const vehicle=snapshot?.vehicles.find(v=>v.id===vehicleId);
  const item=snapshot?.retained ?? snapshot?.items.find(i=>i.id===selected);
  const range=calendarRange(date,view),items=snapshot?.items.filter(i=>i.vehicle_id===vehicleId) ?? [];
  function navigate(direction:number){
    try{setDate(moveCalendar(date,view,direction));}
    catch(cause){setError(eventErrorMessage(cause));}
  }
  function createRequest(block=false){
    if(!snapshot || !vehicle)return;
    const unit=block ? vehicle.unit_id : snapshot.own_units.find(u=>vehicle.usage_units.includes(u.id))?.id ?? "";
    const day=addLocalDays(berlinParts(snapshot.server_now).date,1);
    setDraft({vehicle_id:vehicle.id,unit_id:unit,responsible_id:actorId,kind:block ? "block" : "reservation",
      title:"",description:"",destination:"",notes:"",purpose_key:block ? null : snapshot.purposes.find(p=>p.active)?.key ?? "",
      start:`${day}T09:00`,end:`${day}T10:00`});
  }
  function editVehicle(v?:Vehicle){
    if(!snapshot)return;
    setEditing({vehicle:v,input:v ? {...v,name:v.name} : {
      name:"",unit_id:snapshot.units[0]?.id ?? "",type_key:snapshot.types.find(t=>t.active)?.key ?? "",
      active:true,reservable:true,call_sign:"",location:"",description:"",unit_admin_enabled:false,
      manager_ids:[actorId],usage_units:snapshot.own_units.map(u=>u.id),
    }});
  }
  function open(i:VehicleReservation){setSelected(i.id);setVehicleId(i.vehicle_id);setReason("");}
  const draftVehicle=snapshot?.vehicles.find(v=>v.id===draft?.vehicle_id);
  const draftValid=!!draftVehicle?.active && draftVehicle.current_access && (draft?.kind==="block" ? draftVehicle.can_manage :
    draftVehicle.reservable && !!snapshot?.own_units.some(u=>u.id===draft?.unit_id && draftVehicle.usage_units.includes(u.id)));
  let conflicts:VehicleReservation[]=[];
  let draftError="";
  if(draft){
    try{const input=vehicleRequestPayload(draft);conflicts=items.filter(i=>(bindingVehicle(i) || i.state==="REQUESTED") && vehicleOverlap(i,input));}
    catch(cause){draftError=eventErrorMessage(cause);}
  }
  return <section className="card section-card vehicles" aria-label="Fahrzeuge und Reservierungen">
    <div className="event-card-top"><h2><Truck size={22}/>Fahrzeuge und Reservierungen</h2>
      <button className="button secondary" disabled={busy} onClick={()=>void reload()}><RefreshCw size={18}/>Fahrzeuge aktualisieren</button></div>
    <p className="muted text-sm">Anfragen sind unverbindlich. Nur genehmigte Nutzungen und Sperrungen blockieren Zeiträume; die Genehmigung wird transaktional in Supabase geprüft.</p>
    {error && !draft && !selected && !editing && <p className="notice error" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
    {snapshot && <>
      <div className="form-grid"><label>Fahrzeug auswählen<select value={vehicleId ?? ""} onChange={e=>setVehicleId(e.target.value || null)}>
        <option value="" disabled>Fahrzeug wählen</option>{snapshot.vehicles.map(v=><option key={v.id} value={v.id}>{v.name}{!v.active ? " · Inaktiv" : !v.reservable ? " · Nicht reservierbar" : ""}</option>)}
      </select></label>
      <label>Fahrzeugmonat<input type="month" min="2000-01" max="2199-12" value={date.slice(0,7)}
        onChange={e=>{const parsed=calendarDateSchema.safeParse(`${e.target.value}-01`);if(parsed.success)setDate(parsed.data);else setError("Gültigen Fahrzeugmonat wählen.");}}/></label></div>
      <div className="calendar-toolbar"><button className="icon-button" aria-label="Vorheriger Fahrzeugzeitraum" onClick={()=>navigate(-1)}><ChevronLeft/></button>
        <div className="calendar-views" aria-label="Fahrzeugkalenderdarstellung">{(["month","week","list"] as const).map((v,i)=>
          <button className="button secondary" key={v} aria-pressed={v===view} onClick={()=>setView(v)}>{["Monat","Woche","Liste"][i]}</button>)}</div>
        <button className="icon-button" aria-label="Nächster Fahrzeugzeitraum" onClick={()=>navigate(1)}><ChevronRight/></button>
        <button className="button secondary" onClick={()=>setDate(berlinParts(snapshot.server_now).date)}>Fahrzeugkalender heute</button></div>
      {!snapshot.vehicles.length && <p className="notice" role="status">Keine berechtigt sichtbaren Fahrzeuge eingerichtet. Globale Administration muss Fahrzeug-Stammdaten und Nutzungsfreigaben prüfen.</p>}
      {vehicle && <>
        <h3>{vehicle.name}</h3><p>{snapshot.types.find(t=>t.key===vehicle.type_key)?.name} · {snapshot.units.find(u=>u.id===vehicle.unit_id)?.name}
          {vehicle.call_sign && ` · ${vehicle.call_sign}`}{vehicle.location && ` · ${vehicle.location}`}</p><p>{vehicle.description}</p>
        <p><span className={`badge ${vehicle.active && vehicle.reservable ? "success" : "danger"}`}>
          {vehicle.active && vehicle.reservable ? "✓ Anfragen möglich" : "⊘ Nicht verfügbar für neue Anfragen"}</span></p>
        <div className="dev-actions">
          {vehicle.current_access && vehicle.active && vehicle.reservable && snapshot.own_units.some(u=>vehicle.usage_units.includes(u.id)) &&
            <button className="button" disabled={busy} onClick={()=>createRequest()}>Reservierung beantragen</button>}
          {vehicle.can_manage && <><button className="button secondary" disabled={busy || !vehicle.active} onClick={()=>createRequest(true)}>Fahrzeug sperren</button>
            <button className="button secondary" disabled={busy} onClick={()=>editVehicle(vehicle)}>Fahrzeug bearbeiten</button></>}
          {snapshot.configure && <button className="button secondary" disabled={busy} onClick={()=>editVehicle()}>Fahrzeug anlegen</button>}
        </div>
        <div className={view==="list" ? "calendar-list" : "calendar-month"} aria-label={`Fahrzeugkalender ${view}`}>
          {range.days.map(day=>{
            const bounds={starts_at:fromBerlin(`${day}T00:00`),ends_at:fromBerlin(`${addLocalDays(day,1)}T00:00`)};
            const daily=items.filter(i=>vehicleOverlap(i,bounds));
            const bound=daily.some(bindingVehicle);
            return <section key={day} className="calendar-cell"><h4>{dateLabel(`${day}T12:00:00Z`,{month:"short",day:"numeric"})}</h4>
              <span className={`badge ${bound || !vehicle.active || !vehicle.reservable || !vehicle.current_access ? "danger" : "success"}`}>
                {!vehicle.current_access ? "Nur eigene Historie · keine aktuelle Verfügbarkeit" : bound ? "⊘ Teilweise verbindlich belegt" : !vehicle.active || !vehicle.reservable ? "⊘ Nicht verfügbar" : "✓ Keine verbindliche Belegung"}</span>
              {daily.map(i=><button key={i.id} className="calendar-chip" onClick={()=>open(i)}>
                <VehicleBadge item={i}/><strong>{i.title}</strong><span>{calendarInterval({...i,all_day:false})}</span></button>)}
            </section>;
          })}
        </div>
        <details><summary>Eigene Anfragen · ausgewähltes Fahrzeug und Zeitraum</summary>{items.filter(i=>i.own).map(i=>
          <button className="notice-row" key={i.id} onClick={()=>open(i)}><span><strong>{i.title}</strong><VehicleBadge item={i}/></span></button>)}
          {!items.some(i=>i.own) && <p>Keine eigenen Anfragen in diesem Zeitraum.</p>}</details>
      </>}
      {!vehicle && snapshot.configure && <button className="button" onClick={()=>editVehicle()}>Fahrzeug anlegen</button>}
      <details><summary>Genehmigungsaufgaben ({snapshot.tasks_total})</summary>
        {snapshot.tasks_total>snapshot.tasks.length && <p className="notice" role="status">Die ältesten {snapshot.tasks.length} von {snapshot.tasks_total} Aufgaben werden angezeigt. Bearbeitete Aufgaben geben weitere frei.</p>}
        {snapshot.tasks.map(i=><button className="notice-row" key={i.id} onClick={()=>open(i)}>
          <span><strong>{i.vehicle_name} · {i.title}</strong><VehicleBadge item={i}/><small>{i.requester_name} · {calendarInterval({...i,all_day:false})}</small></span></button>)}
        {!snapshot.tasks.length && <p>Keine offenen berechtigten Genehmigungsaufgaben.</p>}</details>
      <details><summary><Bell size={16}/> Interne Benachrichtigungen ({snapshot.notifications.filter(n=>!n.read_at).length} ungelesen in den letzten 100)</summary>
        {snapshot.notifications.map(n=><article className="notice-row" key={n.id}><span><strong>{n.message}</strong>
          <small>{n.read_at ? "Gelesen" : "Ungelesen"} · {dateLabel(n.created_at,{year:"numeric"})}</small>
          <div className="dev-actions"><button className="button secondary" onClick={()=>{setSelected(n.event_id);setReason("");}}>Vorgang öffnen</button>
            {!n.read_at && <button className="button secondary" disabled={busy} onClick={()=>void run(()=>readVehicleNotification(client,n.id),"Benachrichtigung als gelesen gespeichert.")}>Als gelesen markieren</button>}</div></span></article>)}
        {!snapshot.notifications.length && <p>Keine berechtigten Benachrichtigungen.</p>}</details>
      {snapshot.configure && <VehicleOptions snapshot={snapshot} busy={busy} save={(kind,key,name,active)=>void run(
        ()=>saveVehicleOption(client,kind,key,name,active),"Fahrzeugkonfiguration gespeichert.")}/>}
    </>}
    {draft && <AppDialog title={draft.kind==="block" ? "Fahrzeug vorübergehend sperren" : "Reservierungsanfrage"} close={()=>setDraft(null)}>
      <form className="form-grid" onSubmit={e=>{e.preventDefault();void run(async()=>{
        const result=await requestVehicle(client,vehicleRequestPayload(draft));setDraft(null);setSelected(result.id);
        if(result.conflicts.some(c=>c.binding!==false))return "Anfrage gespeichert, aber Zeitraum bereits verbindlich belegt. Genehmigung nicht möglich, solange der Konflikt besteht.";
        if(result.conflicts.length)return "Anfrage gespeichert. Weitere unverbindliche Anfragen überschneiden sich; nur eine Genehmigung für den Zeitraum ist möglich.";
      },"Vorgang gespeichert. Status und Konflikte im Detail prüfen.");}}>
        <p className="span-2">{draftVehicle?.name ?? "Fahrzeug nicht mehr berechtigt verfügbar"}</p>
        <label>Nutzungseinheit<select value={draft.unit_id} disabled={draft.kind==="block"} required onChange={e=>setDraft({...draft,unit_id:e.target.value})}>
          <option value="">Einheit wählen</option>{(draft.kind==="block" ? snapshot?.units : snapshot?.own_units.filter(u=>draftVehicle?.usage_units.includes(u.id)))?.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <label>Verantwortliche Person<select value={draft.responsible_id} required onChange={e=>setDraft({...draft,responsible_id:e.target.value})}>
          <option value="">Person wählen</option>{snapshot?.people.filter(p=>draft.kind==="block" || p.units.includes(draft.unit_id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Beginn (Europe/Berlin)<input type="datetime-local" value={draft.start} required onChange={e=>setDraft({...draft,start:e.target.value})}/></label>
        <label>Ende (Europe/Berlin)<input type="datetime-local" value={draft.end} required onChange={e=>setDraft({...draft,end:e.target.value})}/></label>
        {draft.kind==="reservation" && <label>Verwendungszweck<select required value={draft.purpose_key ?? ""} onChange={e=>setDraft({...draft,purpose_key:e.target.value})}>
          {snapshot?.purposes.filter(p=>p.active).map(p=><option key={p.key} value={p.key}>{p.name}</option>)}</select></label>}
        <label>{draft.kind==="block" ? "Sperrungsgrund" : "Zweck / Titel"}<input value={draft.title} minLength={3} maxLength={120} required onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
        <label>Beschreibung<textarea value={draft.description} maxLength={2000} onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
        <label>Zielort<input value={draft.destination} maxLength={200} onChange={e=>setDraft({...draft,destination:e.target.value})}/></label>
        <label>Bemerkung<textarea value={draft.notes} maxLength={2000} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
        {!draftValid && <p className="span-2 notice error" role="alert">Fahrzeug ist nicht mehr aktiv, reservierbar oder für die gewählte Einheit berechtigt. Entwurf bleibt erhalten; Speichern ist gesperrt.</p>}
        {!!conflicts.length && <p className="span-2 notice" role="status">{conflicts.some(bindingVehicle)
          ? "Zeitraum bereits verbindlich belegt. Anfrage kann gespeichert werden, aber nicht überlappend genehmigt. Eine Sperrung muss zuerst mit bestehenden Buchungen geklärt werden."
          : "Weitere unverbindliche Anfrage im Zeitraum. Anfragen dürfen konkurrieren; es können keine überlappenden Nutzungen genehmigt werden."}</p>}
        {(error || draftError) && <p className="span-2 notice error" role="alert">{error || draftError}</p>}
        <button className="button" disabled={busy || !snapshot || !draftValid}> {draft.kind==="block" ? "Sperrung speichern" : "Anfrage absenden"}</button>
      </form>
    </AppDialog>}
    {selected && item && <AppDialog title={item.title} close={()=>setSelected(null)}>
      <VehicleBadge item={item}/><p>{item.vehicle_name} · {calendarInterval({...item,all_day:false})}</p>
      <p>Antragsteller: {item.requester_name} · Verantwortlich: {item.responsible_name} · {item.unit_name}</p>
      <p>{item.description}</p><p>{item.destination}</p><p>{item.notes}</p>
      {item.decision_reason && <p>Entscheidung: {item.decision_reason}</p>}{item.cancellation_reason && <p>Stornierung: {item.cancellation_reason}</p>}
      {["REQUESTED","APPROVED"].includes(item.state) && (item.can_manage || item.own && item.kind==="reservation") && <>
        <label>Begründung<textarea value={reason} maxLength={2000} onChange={e=>setReason(e.target.value)}/></label>
        <div className="dev-actions">{(item.can_manage && item.state==="REQUESTED" ? ["APPROVED","REJECTED","CANCELLED"] :
          item.can_manage && Date.parse(item.ends_at)<=Date.parse(snapshot?.server_now ?? initialTime) ? ["CANCELLED","COMPLETED"] : ["CANCELLED"]).map(state=>
          <button className={`button secondary ${state==="REJECTED" || state==="CANCELLED" ? "danger-button" : ""}`} key={state} disabled={busy || !snapshot}
            onClick={()=>void run(()=>decideVehicle(client,item,state as VehicleState,reason),"Reservierungsstatus gespeichert.")}>
            {state==="APPROVED" ? "Genehmigen" : state==="REJECTED" ? "Ablehnen" : state==="COMPLETED" ? "Nutzung abschließen" : "Stornieren"}</button>)}</div>
      </>}
      {error && <p className="notice error" role="alert">{error}</p>}
    </AppDialog>}
    {editing && snapshot && <AppDialog title={editing.vehicle ? "Fahrzeug bearbeiten" : "Fahrzeug anlegen"} close={()=>setEditing(null)}>
      <VehicleForm input={editing.input} snapshot={snapshot} busy={busy} change={input=>setEditing({...editing,input})}
        save={()=>void run(async()=>{const id=await saveVehicle(client,editing.input,editing.vehicle);setEditing(null);setVehicleId(id);},"Fahrzeug gespeichert.")}/>
      {error && <p className="notice error" role="alert">{error}</p>}
    </AppDialog>}
  </section>;
}
function VehicleForm({input,snapshot,busy,change,save}:{input:VehicleInput;snapshot:VehicleWorkspace;busy:boolean;change:(input:VehicleInput)=>void;save:()=>void}){
  const toggle=(field:"manager_ids"|"usage_units",id:string)=>change({...input,[field]:input[field].includes(id) ? input[field].filter(x=>x!==id) : [...input[field],id]});
  return <form className="form-grid" onSubmit={e=>{e.preventDefault();save();}}>
    <label>Fahrzeugname<input required minLength={2} maxLength={120} value={input.name} onChange={e=>change({...input,name:e.target.value})}/></label>
    <label>Fahrzeugtyp<select value={input.type_key} onChange={e=>change({...input,type_key:e.target.value})}>{snapshot.types.filter(t=>t.active).map(t=><option key={t.key} value={t.key}>{t.name}</option>)}</select></label>
    <label>Besitzende Einheit<select required disabled={!snapshot.configure} value={input.unit_id} onChange={e=>change({...input,unit_id:e.target.value})}>
      {snapshot.units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
    <label>Funkrufzeichen (optional)<input maxLength={80} value={input.call_sign} onChange={e=>change({...input,call_sign:e.target.value})}/></label>
    <label>Standort (optional)<input maxLength={200} value={input.location} onChange={e=>change({...input,location:e.target.value})}/></label>
    <label>Fahrzeugbeschreibung<textarea maxLength={2000} value={input.description} onChange={e=>change({...input,description:e.target.value})}/></label>
    <label className="calendar-check"><input type="checkbox" checked={input.active} onChange={e=>change({...input,active:e.target.checked})}/>Fahrzeug aktiv</label>
    <label className="calendar-check"><input type="checkbox" checked={input.reservable} onChange={e=>change({...input,reservable:e.target.checked})}/>Reservierbar</label>
    <label className="calendar-check"><input type="checkbox" disabled={!snapshot.configure} checked={input.unit_admin_enabled} onChange={e=>change({...input,unit_admin_enabled:e.target.checked})}/>Einheitsführung der besitzenden Einheit darf dieses Fahrzeug verwalten</label>
    <fieldset className="span-2" disabled={!snapshot.configure}><legend>Fahrzeugverwalter · mindestens eine Person</legend>
      {snapshot.people.map(p=><label className="calendar-check" key={p.id}><input type="checkbox" checked={input.manager_ids.includes(p.id)} onChange={()=>toggle("manager_ids",p.id)}/>{p.name}</label>)}</fieldset>
    <fieldset className="span-2" disabled={!snapshot.configure}><legend>Freigegebene Nutzungseinheiten</legend>
      {snapshot.units.map(u=><label className="calendar-check" key={u.id}><input type="checkbox" checked={input.usage_units.includes(u.id)} onChange={()=>toggle("usage_units",u.id)}/>{u.name}</label>)}</fieldset>
    <p className="muted text-sm span-2">Keine globalen Rechte durch Fahrzeugverwaltung. Deaktivierung erhält vorhandene Buchungen und Historie.</p>
    <button className="button" disabled={busy}>Fahrzeug speichern</button>
  </form>;
}
function VehicleOptions({snapshot,busy,save}:{snapshot:VehicleWorkspace;busy:boolean;save:(kind:"type"|"purpose",key:string,name:string,active:boolean)=>void}){
  const [kind,setKind]=useState<"type"|"purpose">("type"),[key,setKey]=useState(""),[name,setName]=useState(""),[active,setActive]=useState(true);
  return <details><summary>Fahrzeugtypen und Verwendungszwecke · globale Konfiguration</summary>
    <form className="form-grid" onSubmit={e=>{e.preventDefault();save(kind,key,name,active);}}>
      <label>Konfigurationsart<select value={kind} onChange={e=>setKind(e.target.value==="type" ? "type" : "purpose")}><option value="type">Fahrzeugtyp</option><option value="purpose">Verwendungszweck</option></select></label>
      <label>Vorhandener Eintrag<select value="" onChange={e=>{const item=(kind==="type" ? snapshot.types : snapshot.purposes).find(x=>x.key===e.target.value);if(item){setKey(item.key);setName(item.name);setActive(item.active);}}}>
        <option value="">Neu anlegen oder auswählen</option>{(kind==="type" ? snapshot.types : snapshot.purposes).map(o=><option key={o.key} value={o.key}>{o.name}</option>)}</select></label>
      <label>Technischer Schlüssel<input required pattern="[a-z0-9_-]{2,40}" value={key} onChange={e=>setKey(e.target.value)}/></label>
      <label>Bezeichnung<input required minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>
      <label className="calendar-check"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/>Eintrag aktiv</label>
      <button className="button" disabled={busy}>Konfiguration speichern</button>
    </form></details>;
}
