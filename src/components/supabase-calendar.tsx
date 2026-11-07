"use client";

import { useCallback,useEffect,useRef,useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarDays,ChevronLeft,ChevronRight,Plus,RefreshCw } from "lucide-react";
import { readCalendar,saveCalendarEvent,changeCalendarEvent,calendarConflicts,saveCalendarResource,saveCalendarCategory } from "@/data/supabase-calendar";
import { calendarDateSchema,calendarDraft,calendarKindSchema,calendarPayload,calendarRange,calendarTime,eventsOnDay,
  moveCalendar,weekColumns,emptyCalendarFilters,type CalendarView,type CalendarDraft,type CalendarEvent,
  type CalendarContext,type CalendarFilters,type CalendarConflict } from "@/domain/calendar";
import { berlinParts,dateLabel } from "@/domain/time";
import { eventErrorMessage } from "@/domain/dev-events";
import { AppDialog } from "./app-dialog";

type Snapshot=Awaited<ReturnType<typeof readCalendar>>;
type Editor={event?:CalendarEvent; draft:CalendarDraft};
function errorMessage(error:unknown) {
  if (error && typeof error==="object" && "code" in error && error.code==="PGRST202")
    return "Kalender noch nicht verfügbar. Die geprüften Migrationen 018 und 019 müssen im DEV installiert sein.";
  return eventErrorMessage(error);
}
const dayName=(day:string) => dateLabel(`${day}T12:00:00Z`,{ year:"numeric" });

export function SupabaseCalendar({client,actorId,initialTime,openService}:{
  client:SupabaseClient; actorId:string; initialTime:string; openService:(id:string,edit:boolean)=>Promise<void>;
}) {
  const [date,setDate]=useState(()=>berlinParts(initialTime).date);
  const [view,setView]=useState<CalendarView>("month");
  const [filters,setFilters]=useState<CalendarFilters>(emptyCalendarFilters);
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [editor,setEditor]=useState<Editor|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const [day,setDay]=useState<string|null>(null);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [conflicts,setConflicts]=useState<CalendarConflict[]>([]);
  const [reason,setReason]=useState("");
  const epoch=useRef({value:0}),working=useRef(false),retained=useRef<string[]>([]);
  const range=calendarRange(date,view);
  const reload=useCallback(async()=>{
    const version=++epoch.current.value;
    try {
      const bounds=calendarRange(date,view);
      const result=await readCalendar(client,bounds,filters,retained.current);
      if(version!==epoch.current.value) return;
      setSnapshot(result); setError("");
      if(retained.current.length && ![...result.events,...result.retained_events].some((e)=>e.id===retained.current[0])) {
        retained.current=[]; setSelected(null); setMessage("Geöffneter Termin nicht mehr berechtigt verfügbar.");
      }
    } catch(cause) {
      if(version!==epoch.current.value) return;
      setSnapshot(null); setSelected(null); setError(errorMessage(cause));
    }
  },[client,date,view,filters]);
  useEffect(()=>{
    const lifetime=epoch.current;
    void reload();
    const timer=window.setInterval(()=>{if(!document.hidden && !working.current) void reload();},30_000);
    return ()=>{lifetime.value++;window.clearInterval(timer);};
  },[reload]);
  async function run(operation:()=>Promise<unknown>,success:string) {
    if(working.current) return;
    working.current=true; setBusy(true);setError("");setMessage("");epoch.current.value++;
    try {await operation();setMessage(success);await reload();}
    catch(cause){setError(errorMessage(cause));}
    finally{working.current=false;setBusy(false);}
  }
  function choose(event:CalendarEvent) {setDay(null);setSelected(event.id);retained.current=[event.id];setReason("");}
  function closeSelected(){setSelected(null);retained.current=[];}
  function navigate(direction:number) {
    try {setDate(moveCalendar(date,view,direction));}
    catch(cause){setError(errorMessage(cause));}
  }
  const all=snapshot ? [...snapshot.events,...snapshot.retained_events.filter(e=>!snapshot.events.some(x=>x.id===e.id))] : [];
  const selectedEvent=all.find(e=>e.id===selected);
  function edit(event?:CalendarEvent) {
    if(!snapshot) return;
    closeSelected();setConflicts([]);
    setEditor(event ? {event,draft:calendarDraft(event)} : {draft:{
      title:"",description:"",location:"",start:`${date}T18:00`,end:`${date}T19:30`,all_day:false,
      entry_kind:"information",scope_kind:snapshot.context.manageable_units.length ? "unit" :
        snapshot.context.organization ? "organization" : "function",
      unit_id:snapshot.context.manageable_units[0]?.id ?? "",function_id:"",
      organizer_id:actorId,category_id:snapshot.context.categories.find(c=>c.active)?.id ?? "",
      resource_id:"",audience:"scope",unit_ids:[],
    }});
  }
  async function checkConflicts() {
    if(!editor) return;
    await run(async()=>{
      const input=calendarPayload(editor.draft);
      if(!input.resource_id) throw new Error("Bitte ein Gerätehaus für die Belegungsprüfung auswählen.");
      const list=await calendarConflicts(client,input.resource_id,input.starts_at,input.ends_at,editor.event?.id);
      setConflicts(list);
    },"Belegungsprüfung abgeschlossen. Dies ist eine Warnung, keine Reservierung oder Genehmigung.");
  }
  const ctx=snapshot?.context;
  const canCreate=ctx && (ctx.organization || ctx.manageable_units.length>0 || ctx.functions.some(f=>f.manage));
  return <section className="card section-card calendar" aria-label="Gemeinsamer Feuerwehrkalender">
    <div className="event-card-top"><h2><CalendarDays size={22}/>Gemeinsamer Feuerwehrkalender</h2>
      <div className="dev-actions">
        <button className="button secondary" disabled={busy} onClick={()=>void reload()}><RefreshCw size={18}/>Kalender aktualisieren</button>
        {canCreate && <button className="button" disabled={busy} onClick={()=>edit()}><Plus size={18}/>Kalendereintrag erstellen</button>}
      </div>
    </div>
    <p className="muted text-sm">Eine gemeinsame Terminquelle · Europe/Berlin · Dienste behalten ihre Teilnahme- und Anwesenheitsverwaltung. Belegungen warnen vor Konflikten, erteilen aber keine Genehmigung.</p>
    {error && <p className="notice error" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
    <div className="calendar-toolbar">
      <button className="icon-button" disabled={busy} aria-label="Vorheriger Zeitraum" onClick={()=>navigate(-1)}><ChevronLeft/></button>
      <label>Kalendermonat<input type="month" min="2000-01" max="2199-12" value={date.slice(0,7)}
        onChange={e=>{const parsed=calendarDateSchema.safeParse(`${e.target.value}-01`);if(parsed.success)setDate(parsed.data);else setError("Gültigen Kalendermonat wählen.");}}/></label>
      <button className="icon-button" disabled={busy} aria-label="Nächster Zeitraum" onClick={()=>navigate(1)}><ChevronRight/></button>
      <button className="button secondary" onClick={()=>setDate(berlinParts(snapshot?.server_now ?? initialTime).date)}>Heute</button>
      <div className="calendar-views" aria-label="Kalenderdarstellung">{(["month","week","list"] as const).map((value,i)=>
        <button key={value} className="button secondary" aria-pressed={view===value} onClick={()=>setView(value)}>{["Monat","Woche","Liste"][i]}</button>)}</div>
    </div>
    {ctx && <CalendarFilterControls context={ctx} filters={filters} change={setFilters}/>}
    {editor && ctx && <CalendarForm editor={editor} context={ctx} busy={busy} change={setEditor} close={()=>setEditor(null)}
      check={()=>void checkConflicts()} submit={()=>void run(async()=>{
        const result=await saveCalendarEvent(client,calendarPayload(editor.draft),editor.event);
        setConflicts(result.conflicts);setEditor(null);
      },"Kalendereintrag in Supabase gespeichert. Etwaige Konflikte sind nur Warnungen.")}/>}
    {!!conflicts.length && <section className="notice" role="status"><h3>⚠ Überschneidung erkannt</h3>
      <p>Der Termin kann gespeichert werden. Eine Genehmigung ist damit nicht verbunden.</p>
      {conflicts.map((c,i)=><p key={c.id ?? i}>{c.title} · {dayName(berlinParts(c.starts_at).date)} {calendarTime(c.starts_at)} – {calendarTime(c.ends_at)}</p>)}</section>}
    {snapshot && <>
      <p className="muted text-sm">{dayName(range.start)} – {dayName(range.days.at(-1)!)} · {snapshot.events.length} sichtbare Termine</p>
      {view==="month" ? <div className="calendar-month" aria-label="Monatskalender">
        {["Mo","Di","Mi","Do","Fr","Sa","So"].map(label=><div key={label} className="calendar-weekday">{label}</div>)}
        {range.days.map(d=>{
          const items=eventsOnDay(snapshot.events,d);
          const today=berlinParts(snapshot.server_now).date===d;
          return <div key={d} className={`calendar-cell ${d.slice(0,7)!==date.slice(0,7) ? "adjacent" : ""} ${today ? "today" : ""}`}>
            <button className="calendar-day" aria-label={`Tagesübersicht ${dayName(d)}`} aria-current={today ? "date" : undefined} onClick={()=>setDay(d)}>{Number(d.slice(-2))}</button>
            {items.slice(0,2).map(event=><CalendarChip key={event.id} event={event} choose={choose}/>)}
            {items.length>2 && <button className="calendar-more" onClick={()=>setDay(d)}>+{items.length-2} weitere</button>}
          </div>;
        })}
      </div> : view==="week" ? <div className="calendar-week-scroll"><div className="calendar-week" aria-label="Wochenkalender">
        {range.days.map(d=>{
          const columns=weekColumns(snapshot.events,d);
          return <section key={d}><button className="calendar-weekday calendar-day" onClick={()=>setDay(d)}>{dayName(d)}</button>
          <div className="calendar-week-all-day">{eventsOnDay(snapshot.events,d).filter(e=>e.all_day).map(e=><CalendarChip key={e.id} event={e} choose={choose}/>)}</div>
          <div className="calendar-hours" aria-label={`Zeitachse ${dayName(d)}`}>
            {Array.from({length:24},(_,hour)=><span className="calendar-hour" key={hour} style={{top:hour*30}}>{hour}:00</span>)}
            {columns.items.map(({event,top,height,lane})=><div className="calendar-week-event" key={event.id}
              style={{top,height,left:`${lane*100/columns.lanes}%`,width:`${96/columns.lanes}%`}}>
              <CalendarChip event={event} choose={choose}/></div>)}
          </div></section>;
        })}
      </div></div> : <CalendarDayList events={snapshot.events} days={range.days} choose={choose}/>}
      {snapshot.events.length===0 && <p>Keine berechtigt sichtbaren Termine in diesem Zeitraum und diesen Filtern.</p>}
      {ctx?.configure && <CalendarSettings client={client} context={ctx} busy={busy} run={run}/>}
    </>}
    {day && snapshot && <AppDialog title={`Termine ${dayName(day)}`} close={()=>setDay(null)}>
      <CalendarDayList events={snapshot.events} days={[day]} choose={choose}/></AppDialog>}
    {selectedEvent && <AppDialog title={selectedEvent.title} close={closeSelected}>
      <p>{dayName(berlinParts(selectedEvent.starts_at).date)} · {selectedEvent.all_day ? "Ganztägig" : `${calendarTime(selectedEvent.starts_at)} – ${calendarTime(selectedEvent.ends_at)}`}</p>
      <p>{selectedEvent.location} · {selectedEvent.scope_name} · {selectedEvent.status==="cancelled" ? "Abgesagt" : "Geplant"}</p>
      <p className="description">{selectedEvent.description}</p><p>Verantwortlich: {selectedEvent.organizer_name}</p>
      {selectedEvent.resource_name && <p>Gerätehaus: {selectedEvent.resource_name}</p>}
      {selectedEvent.entry_kind==="participation" ? <div className="dev-actions">
        <button className="button" onClick={()=>void run(async()=>{await openService(selectedEvent.id,false);closeSelected();},"Bestehende Dienstverwaltung geöffnet.")}>Dienst und Teilnahme öffnen</button>
        {selectedEvent.can_manage && <button className="button secondary" disabled={Date.parse(selectedEvent.starts_at)<=Date.parse(snapshot?.server_now ?? initialTime)}
          onClick={()=>void run(async()=>{await openService(selectedEvent.id,true);closeSelected();},"Bestehende Terminbearbeitung geöffnet.")}>Bestehende Bearbeitung öffnen</button>}
      </div> : <>
        <p className="notice">Reiner {selectedEvent.entry_kind==="booking" ? "Belegungs" : "Informations"}termin · keine Teilnahmeabfrage oder Anwesenheitsliste.</p>
        {selectedEvent.can_manage && <><button className="button secondary" onClick={()=>edit(selectedEvent)}>Kalendereintrag bearbeiten</button>
          <label>Begründung für Absage / Archivierung<input value={reason} onChange={e=>setReason(e.target.value)} minLength={5}/></label>
          <div className="dev-actions">{(["cancel","archive"] as const).map(action=><button key={action} className="button secondary danger-button" disabled={busy}
            onClick={()=>void run(async()=>{await changeCalendarEvent(client,selectedEvent,action,reason);closeSelected();},
              action==="cancel" ? "Kalendereintrag abgesagt." : "Kalendereintrag archiviert; Historie bleibt erhalten.")}>
            {action==="cancel" ? "Kalendereintrag absagen" : "Kalendereintrag archivieren"}</button>)}</div></>}
      </>}
    </AppDialog>}
  </section>;
}
function CalendarChip({event,choose}:{event:CalendarEvent;choose:(event:CalendarEvent)=>void}) {
  return <button className={`calendar-chip ${event.status==="cancelled" ? "cancelled" : ""}`} onClick={()=>choose(event)}>
    <span>{event.all_day ? "Ganztägig" : calendarTime(event.starts_at)}</span><strong>{event.title}</strong>
    {event.status==="cancelled" && <span>✕ Abgesagt</span>}
  </button>;
}
function CalendarDayList({events,days,choose}:{events:CalendarEvent[];days:string[];choose:(e:CalendarEvent)=>void}) {
  return <div className="calendar-list">{days.filter(d=>eventsOnDay(events,d).length>0).map(d=><section key={d}>
    <h3>{dayName(d)}</h3>{eventsOnDay(events,d).map(event=><CalendarChip key={event.id} event={event} choose={choose}/>)}</section>)}</div>;
}
function CalendarFilterControls({context,filters,change}:{context:CalendarContext;filters:CalendarFilters;change:(f:CalendarFilters)=>void}) {
  const toggle=(field:"scopes"|"types"|"kinds",values:string[])=>{
    const assigned=values.every(v=>filters[field].includes(v));
    change({...filters,[field]:assigned ? filters[field].filter(v=>!values.includes(v)) : [...new Set([...filters[field],...values])]});
  };
  return <details className="calendar-filters"><summary>Kalenderfilter</summary>
    <p className="muted text-sm">Innerhalb einer Filtergruppe ODER, zwischen Gruppen UND. Berechtigungen gelten immer serverseitig.</p>
    <fieldset><legend>Bereich</legend>{[["mine","Meine Einheit"],["organization","Gesamte Feuerwehr"],["units","Einheiten"],["function","Sonderfunktionen"]].map(([value,label])=>
      <label key={value} className="calendar-check"><input type="checkbox" checked={filters.scopes.includes(value)} onChange={()=>toggle("scopes",[value])}/>{label}</label>)}</fieldset>
    <fieldset><legend>Terminmerkmale</legend>{[
      {label:"Übungsdienste / Ausbildung",field:"types" as const,values:["regular","special","breathing","training"]},
      {label:"Veranstaltungen",field:"types" as const,values:["community"]},
      {label:"Gerätehausbelegung",field:"kinds" as const,values:["booking"]},
      {label:"Organisatorische Information",field:"kinds" as const,values:["information"]},
    ].map(({label,field,values})=><label className="calendar-check" key={label}><input type="checkbox" checked={values.every(v=>filters[field].includes(v))}
      onChange={()=>toggle(field,values)}/>{label}</label>)}</fieldset>
    <div className="form-grid">{([{field:"units",label:"Einheitsfilter",options:context.units},
      {field:"categories",label:"Kalenderkategorie",options:context.categories},
      {field:"resources",label:"Gerätehausfilter",options:context.resources}] as const).map(({field,label,options})=>
      <label key={field}>{label}<select value={filters[field][0] ?? ""} onChange={e=>change({...filters,[field]:e.target.value ? [e.target.value] : []})}>
        <option value="">Alle berechtigt sichtbaren</option>{options.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>)}</div>
    <label className="calendar-check"><input type="checkbox" checked={filters.cancelled} onChange={e=>change({...filters,cancelled:e.target.checked})}/>Abgesagte Termine anzeigen</label>
    <button className="button secondary" onClick={()=>change(emptyCalendarFilters)}>Kalenderfilter zurücksetzen</button>
  </details>;
}
function CalendarForm({editor,context,busy,change,close,submit,check}:{editor:Editor;context:CalendarContext;busy:boolean;
  change:(e:Editor)=>void;close:()=>void;submit:()=>void;check:()=>void}) {
  const d=editor.draft;
  const field=<K extends keyof CalendarDraft>(key:K,value:CalendarDraft[K])=>change({...editor,draft:{...d,[key]:value}});
  const scopes=[...(context.organization ? [{value:"organization",name:"Gesamte Feuerwehr"}] : []),
    ...context.manageable_units.map(u=>({value:`unit:${u.id}`,name:u.name})),
    ...context.functions.filter(f=>f.manage).map(f=>({value:`function:${f.id}`,name:f.name}))];
  return <section className="soft-panel" aria-label="Kalendereintrag bearbeiten">
    <h3>{editor.event ? "Kalendereintrag bearbeiten" : "Neuer organisatorischer Kalendereintrag"}</h3>
    <form className="form-grid" onSubmit={e=>{e.preventDefault();submit();}}>
      <label className="span-2">Zweck / Titel<input value={d.title} required minLength={3} maxLength={120} onChange={e=>field("title",e.target.value)}/></label>
      <label className="span-2">Beschreibung<textarea value={d.description} rows={3} maxLength={2000} onChange={e=>field("description",e.target.value)}/></label>
      <label>Eintragsart<select value={d.entry_kind} onChange={e=>field("entry_kind",calendarKindSchema.parse(e.target.value))}>
        <option value="information">Information ohne Teilnahmeabfrage</option><option value="booking">Gerätehausbelegung</option></select></label>
      <label>Kalenderkategorie<select value={d.category_id} required onChange={e=>field("category_id",e.target.value)}>
        <option value="">Kategorie wählen</option>{context.categories.filter(c=>c.active || c.id===d.category_id).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Verwaltungsbereich<select value={d.scope_kind==="organization" ? "organization" : `${d.scope_kind}:${d.scope_kind==="unit" ? d.unit_id : d.function_id}`}
        required onChange={e=>{const [kind,id]=e.target.value.split(":");change({...editor,draft:{...d,scope_kind:kind==="unit" ? "unit" : kind==="function" ? "function" : "organization",
          unit_id:kind==="unit" ? id : "",function_id:kind==="function" ? id : "",audience:"scope",unit_ids:[]}});}}>
        <option value="">Bereich wählen</option>{scopes.map(s=><option key={s.value} value={s.value}>{s.name}</option>)}</select></label>
      <label>Sichtbarkeit<select value={d.audience} onChange={e=>change({...editor,draft:{...d,audience:e.target.value==="units" ? "units" :
        e.target.value==="leadership" ? "leadership" : "scope",unit_ids:[]}})}>
        <option value="scope">Mitglieder des Bereichs</option>{d.scope_kind==="organization" && <option value="units">Mehrere ausgewählte Einheiten</option>}
        <option value="leadership">Eingeschränkter Führungskreis</option></select></label>
      {d.audience==="units" && <fieldset className="span-2"><legend>Zieleinheiten</legend>{context.units.map(u=><label className="calendar-check" key={u.id}>
        <input type="checkbox" checked={d.unit_ids.includes(u.id)} onChange={()=>field("unit_ids",d.unit_ids.includes(u.id) ? d.unit_ids.filter(id=>id!==u.id) : [...d.unit_ids,u.id])}/>{u.name}</label>)}</fieldset>}
      <label className="calendar-check"><input type="checkbox" checked={d.all_day} onChange={e=>field("all_day",e.target.checked)}/>Ganztägig</label>
      <label>Verantwortliche Person<select value={d.organizer_id} required onChange={e=>field("organizer_id",e.target.value)}>
        <option value="">Person wählen</option>{context.organizers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Beginn (Europe/Berlin)<input type={d.all_day ? "date" : "datetime-local"} value={d.all_day ? d.start.slice(0,10) : d.start}
        required onChange={e=>field("start",d.all_day ? `${e.target.value}T00:00` : e.target.value)}/></label>
      <label>{d.all_day ? "Letzter Tag (einschließlich)" : "Ende (Europe/Berlin)"}<input type={d.all_day ? "date" : "datetime-local"} value={d.all_day ? d.end.slice(0,10) : d.end}
        required onChange={e=>field("end",d.all_day ? `${e.target.value}T00:00` : e.target.value)}/></label>
      <label>Ort<input value={d.location} required maxLength={200} onChange={e=>field("location",e.target.value)}/></label>
      {d.entry_kind==="booking" && <label>Gerätehaus<select value={d.resource_id} required onChange={e=>field("resource_id",e.target.value)}>
        <option value="">Gerätehaus wählen</option>{context.resources.filter(r=>r.active && r.resource_type==="building").map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
      <p className="span-2 muted text-sm">Keine Teilnahmeabfrage. Ganztägige Termine verwenden Berliner Tagesgrenzen. Wiederkehrende organisatorische Termine sind noch nicht freigeschaltet.</p>
      <div className="span-2 dev-actions"><button className="button secondary" type="button" onClick={close} disabled={busy}>Kalenderbearbeitung verwerfen</button>
        {d.entry_kind==="booking" && <button className="button secondary" type="button" onClick={check} disabled={busy}>Überschneidungen prüfen</button>}
        <button className="button" disabled={busy}>Kalendereintrag speichern</button></div>
    </form>
  </section>;
}
function CalendarSettings({client,context,busy,run}:{client:SupabaseClient;context:CalendarContext;busy:boolean;run:(op:()=>Promise<unknown>,message:string)=>Promise<void>}) {
  const [name,setName]=useState(""),[unit,setUnit]=useState(""),[category,setCategory]=useState("");
  const [resource,setResource]=useState<{id:string;revision:number}|undefined>(),[active,setActive]=useState(true);
  const [categoryId,setCategoryId]=useState<string|null>(null),[categoryActive,setCategoryActive]=useState(true);
  return <details className="calendar-settings"><summary>Kalenderkonfiguration · globale Administration</summary>
    <form className="form-grid" onSubmit={e=>{e.preventDefault();void run(async()=>{
      const id=await saveCalendarResource(client,name,unit || null,resource,active);
      setResource({id,revision:resource ? resource.revision+1 : 0});
    },"Gerätehaus gespeichert.");}}>
      <label>Ressource bearbeiten<select value={resource?.id ?? ""} onChange={e=>{
        const r=context.resources.find(r=>r.id===e.target.value);setResource(r ? {id:r.id,revision:r.revision} : undefined);
        setName(r?.name ?? "");setUnit(r?.unit_id ?? "");setActive(r?.active ?? true);
      }}><option value="">Neues Gerätehaus</option>{context.resources.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label>Gerätehausname<input value={name} minLength={2} maxLength={120} required onChange={e=>setName(e.target.value)}/></label>
      <label>Ressourceneinheit<select value={unit} onChange={e=>setUnit(e.target.value)}><option value="">Gemeinsam</option>
        {context.units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <label className="calendar-check"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/>Ressource aktiv</label>
      <button className="button" disabled={busy}>Gerätehaus speichern</button>
    </form>
    <p className="muted text-sm">Ressourcentypen Raum, Fahrzeug und Material sind strukturell vorbereitet, keine Fahrzeugreservierung oder Genehmigung.</p>
    <form className="form-grid" onSubmit={e=>{e.preventDefault();void run(async()=>{
      setCategoryId(await saveCalendarCategory(client,category,categoryId,categoryActive));
    },"Kategorie gespeichert.");}}>
      <label>Kategorie bearbeiten<select value={categoryId ?? ""} onChange={e=>{
        const c=context.categories.find(c=>c.id===e.target.value);setCategoryId(c?.id ?? null);setCategory(c?.name ?? "");setCategoryActive(c?.active ?? true);
      }}><option value="">Neue Kategorie</option>{context.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Kategoriename<input value={category} required minLength={2} maxLength={80} onChange={e=>setCategory(e.target.value)}/></label>
      <label className="calendar-check"><input type="checkbox" checked={categoryActive} onChange={e=>setCategoryActive(e.target.checked)}/>Kategorie aktiv</label>
      <button className="button" disabled={busy}>Kalenderkategorie speichern</button>
    </form>
  </details>;
}
