"use client";

import {useEffect,useRef,useState} from "react";
import type {SupabaseClient} from "@supabase/supabase-js";
import {AppDialog} from "./app-dialog";
import {readPlanningContext,readSeriesWorkspace,previewEventPlan,commitEventPlan,type SeriesWorkspace} from "@/data/supabase-planning";
import {seriesRuleSchema,seriesDates,parseEventCsv,csvTemplate,CSV_BYTE_LIMIT,
  type SeriesRule,type PlanningContext,type CsvPreviewRow,type PlanPreview,type PlanRequest} from "@/domain/event-planning";
import {eventErrorMessage} from "@/domain/dev-events";
import {addLocalDays,localInput} from "@/domain/time";
import {calendarInterval} from "@/domain/calendar";
import {EVENT_TYPES} from "@/config/app";

export type PlanningAction="series"|"csv"|"template"|{eventId:string};
type Basics=NonNullable<PlanRequest["data"]>;
const frequencies={daily:"Täglich",weekly:"Wöchentlich",biweekly:"Alle zwei Wochen",threeweekly:"Alle drei Wochen",
  monthly:"Monatlich",custom_weeks:"Benutzerdefinierter Wochenrhythmus"} as const;
function planningError(error:unknown) {
  return error && typeof error==="object" && "code" in error && error.code==="PGRST202"
    ? "Serien-/CSV-Verwaltung noch nicht verfügbar. Geprüfte Migration 033 muss im DEV installiert sein." : eventErrorMessage(error);
}
function downloadTemplate(context:PlanningContext,preferredUnit:string|null){
  const ordered={...context,units:[...context.units].sort((a,b)=>Number(b.id===preferredUnit)-Number(a.id===preferredUnit))};
  const url=URL.createObjectURL(new Blob([csvTemplate(ordered)],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");link.href=url;link.download="feuerwehr-termine-vorlage.csv";link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function SupabasePlanning({client,action,initialTime,preferredUnit,close,changed}:{
  client:SupabaseClient;action:PlanningAction;initialTime:string;preferredUnit:string|null;close:()=>void;changed:()=>Promise<void>;
}) {
  const [context,setContext]=useState<PlanningContext|null>(null),[series,setSeries]=useState<SeriesWorkspace|null>(null);
  const [rule,setRule]=useState<SeriesRule>(()=>seriesRuleSchema.parse({start_date:addLocalDays(localInput(initialTime).slice(0,10),7),
    start_time:"19:30",end_time:"21:30",frequency:"weekly",count:10,end_date:null}));
  const [data,setData]=useState<Basics>({title:"",description:"",location:"",event_type:"regular",scope_kind:"unit",
    unit_id:null,function_id:null,organizer_id:null});
  const [selection,setSelection]=useState<"single"|"following"|"all">("single");
  const [operation,setOperation]=useState<"series_update"|"series_cancel"|"series_end">("series_update");
  const [endDate,setEndDate]=useState(()=>localInput(initialTime).slice(0,10)),[reason,setReason]=useState("");
  const [csv,setCsv]=useState<CsvPreviewRow[]>([]),[fileName,setFileName]=useState("");
  const [error,setError]=useState(""),[busy,setBusy]=useState(true),[confirmed,setConfirmed]=useState(false);
  const [preview,setPreview]=useState<{request:PlanRequest;value:PlanPreview}|null>(null);
  const [result,setResult]=useState<{count:number;replayed:boolean}|null>(null);
  const requestId=useRef(""),epoch=useRef(0),working=useRef(false);
  const editing=typeof action==="object",csvMode=action==="csv" || action==="template";
  useEffect(()=>{
    let alive=true;const version=++epoch.current;requestId.current=crypto.randomUUID();
    Promise.all([readPlanningContext(client),typeof action==="object" ? readSeriesWorkspace(client,action.eventId) : Promise.resolve(null)])
      .then(([ctx,workspace])=>{
        if(!alive || version!==epoch.current)return;
        setContext(ctx);setSeries(workspace);
        const first=workspace?.anchor;
        setData(first ? {title:first.title,description:first.description,location:first.location,event_type:first.event_type,
          scope_kind:first.scope_kind,unit_id:first.unit_id,function_id:first.function_id,organizer_id:first.organizer_id} :
          {title:"",description:"",location:"",event_type:"regular",scope_kind:ctx.units.some(u=>u.manageable) ? "unit" :
            ctx.functions.some(f=>f.manageable) ? "function" : "organization",
          unit_id:ctx.units.find(u=>u.id===preferredUnit && u.manageable)?.id ?? ctx.units.find(u=>u.manageable)?.id ?? null,
          function_id:!ctx.units.some(u=>u.manageable) ? ctx.functions.find(f=>f.manageable)?.id ?? null : null,organizer_id:ctx.actor_id});
        if(first)setRule(seriesRuleSchema.parse({...workspace?.series.rule,
          frequency:workspace?.series.frequency ?? "weekly",start_date:localInput(first.starts_at).slice(0,10),
          start_time:localInput(first.starts_at).slice(11),end_time:localInput(first.ends_at).slice(11),
          count:workspace?.series.occurrence_count ?? 1,end_date:null}));
        if(action==="template")downloadTemplate(ctx,preferredUnit);
        setBusy(false);
      }).catch(cause=>{if(alive && version===epoch.current){setContext(null);setError(planningError(cause));setBusy(false);}});
    return()=>{alive=false;epoch.current++;};
  },[client,action,preferredUnit]);
  function invalidate(){
    epoch.current++;requestId.current=crypto.randomUUID();setPreview(null);setConfirmed(false);setError("");
  }
  function changeRule<K extends keyof SeriesRule>(key:K,value:SeriesRule[K]){invalidate();setRule(r=>({...r,[key]:value}));}
  function changeData<K extends keyof Basics>(key:K,value:Basics[K]){invalidate();setData(d=>({...d,[key]:value}));}
  function changeSelection(value:"single"|"following"|"all"){
    invalidate();setSelection(value);
    const first=series?.instances.find(e=>!e.protected && !e.exception &&
      (value==="all" || value==="following" && e.instance_number>=series.anchor.instance_number || e.id===series.anchor.id));
    if(first)setRule(r=>({...r,start_date:localInput(first.starts_at).slice(0,10)}));
  }
  async function selectFile(file:File|undefined){
    if(!file)return;
    invalidate();const version=epoch.current;setBusy(true);setCsv([]);setFileName(file.name);
    try{
      if(!context)throw new Error("Berechtigte Konfiguration zuerst laden.");
      if(file.size>CSV_BYTE_LIMIT)throw new Error("CSV ist größer als 512 KiB.");
      const text=new TextDecoder("utf-8",{fatal:true}).decode(await file.arrayBuffer());
      const rows=parseEventCsv(text,context);
      if(version===epoch.current)setCsv(rows);
    }catch(cause){if(version===epoch.current)setError(cause instanceof TypeError ? "CSV ist keine gültige UTF-8-Datei." : planningError(cause));}
    finally{if(version===epoch.current)setBusy(false);}
  }
  function request():PlanRequest{
    if(!context)throw new Error("Berechtigte Konfiguration fehlt.");
    if(csvMode){
      if(!csv.length || csv.some(r=>!r.event || r.errors.length))throw new Error("Alle CSV-Fehler korrigieren; es gibt keinen stillen Teilimport.");
      return {operation:"csv_import",request_id:requestId.current,rows:csv.flatMap(r=>r.event ? [r.event] : [])};
    }
    const parsedRule=seriesRuleSchema.parse(rule);
    if(!editing){seriesDates(parsedRule);return {operation:"series_create",request_id:requestId.current,data,rule:parsedRule};}
    if(!series)throw new Error("Serie fehlt.");
    return {operation,request_id:requestId.current,series_id:series.series.id,anchor_id:series.anchor.id,
      selection,rule:parsedRule,data,end_date:endDate,reason};
  }
  async function inspect(){
    if(working.current)return;
    working.current=true;setBusy(true);setError("");setPreview(null);setConfirmed(false);const version=epoch.current;
    try{const input=request(),value=await previewEventPlan(client,input);if(version===epoch.current)setPreview({request:input,value});}
    catch(cause){if(version===epoch.current)setError(planningError(cause));}
    finally{working.current=false;if(version===epoch.current)setBusy(false);}
  }
  async function save(){
    if(working.current || !preview || !confirmed)return;
    working.current=true;setBusy(true);setError("");
    try{
      const saved=await commitEventPlan(client,preview.request,preview.value.token,true);
      setResult({count:saved.count,replayed:saved.replayed});setPreview(null);
      try{await changed();}catch(cause){setError(`Vorgang gespeichert, Anzeige konnte nicht aktualisiert werden: ${planningError(cause)}`);}
    }catch(cause){setPreview(null);setConfirmed(false);setError(planningError(cause));}
    finally{working.current=false;setBusy(false);}
  }
  function download(){
    if(!context)return;
    try{
      downloadTemplate(context,preferredUnit);
    }catch(cause){setError(planningError(cause));}
  }
  const scopeValue=data.scope_kind==="organization" ? "organization" : `${data.scope_kind}:${data.unit_id ?? data.function_id ?? ""}`;
  const organizers=context?.organizers.filter(p=>p.id===context.actor_id || data.scope_kind==="organization" ||
    data.scope_kind==="unit" && !!data.unit_id && p.unit_ids.includes(data.unit_id) ||
    data.scope_kind==="function" && !!data.function_id && p.function_ids.includes(data.function_id)) ?? [];
  return <AppDialog title={csvMode ? "Termine aus CSV importieren" : editing ? "Terminserie verwalten" : "Terminserie erstellen"}
    close={()=>{if(!busy)close();}}>
    {busy && <p role="status">Vorgang wird geprüft …</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {result ? <><p className="notice success" role="status">{result.count} Termine {editing ? "verarbeitet" : "gespeichert"}.
      {result.replayed && " Bereits ausgeführte Bestätigung – keine zweite Anlage."}</p><button className="button" onClick={close}>Ergebnis schließen</button></> : context && <>
      <p className="muted text-sm">Europe/Berlin · maximal 52 Serieninstanzen / 200 CSV-Termine · keine automatische Speicherung.</p>
      {csvMode ? <>
        <button className="button secondary" disabled={busy} onClick={download}>CSV-Vorlage herunterladen</button>
        <label>CSV-Datei (UTF-8, Semikolon)<input type="file" accept=".csv,text/csv" disabled={busy} onChange={e=>void selectFile(e.target.files?.[0])}/></label>
        <p>Datum TT.MM.JJJJ oder JJJJ-MM-TT; Zeit HH:mm. Genau Einheit oder Sonderfunktion. Organisator leer: du selbst.
          Beispielzeilen sind fiktiv und vor einem Import zu prüfen.</p>
        {!!csv.length && <><p role="status">{fileName} · {csv.length} Zeilen · {csv.filter(r=>r.event && !r.errors.length).length} gültig · {csv.filter(r=>r.errors.length).length} fehlerhaft.</p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="CSV-Zeilenprüfung"><table><thead><tr><th>Zeile</th><th>Titel</th><th>Prüfung</th></tr></thead>
            <tbody>{csv.map(r=><tr key={r.line}><td>{r.line}</td><td>{r.title}</td><td>{r.errors.length ? <span className="notice error">✕ {r.errors.join(" · ")}</span> : "✓ Lokal gültig; Serverprüfung folgt"}</td></tr>)}</tbody></table></div></>}
      </> : <>
        {editing && <><label>Serienaktion<select value={operation} disabled={busy} onChange={e=>{invalidate();setOperation(e.target.value==="series_cancel" ? "series_cancel" : e.target.value==="series_end" ? "series_end" : "series_update");}}>
          <option value="series_update">Termine ändern</option><option value="series_cancel">Termine absagen</option><option value="series_end">Serie zu Datum beenden</option></select></label>
          {operation!=="series_end" && <label>Änderungsbereich<select value={selection} disabled={busy} onChange={e=>changeSelection(e.target.value==="following" ? "following" : e.target.value==="all" ? "all" : "single")}>
            <option value="single">Nur diesen Termin</option><option value="following">Diesen und alle folgenden Termine</option><option value="all">Gesamte Serie (nur zulässige zukünftige Termine)</option></select></label>}
          <p className="notice">Begonnene, abgesagte oder eingefrorene Instanzen bleiben erhalten. Individuelle Ausnahmen bleiben bei regulärer Serienänderung geschützt.
            Datumsänderungen betreffen vorhandene IDs, nicht neue Teilnahmelisten.</p>
          {operation!=="series_update" && <><label>Absagegrund<textarea value={reason} minLength={5} maxLength={2000} disabled={busy} onChange={e=>{invalidate();setReason(e.target.value);}}/></label>
            {operation==="series_end" && <label>Letzter Serientag (inklusive)<input type="date" value={endDate} disabled={busy} onChange={e=>{invalidate();setEndDate(e.target.value);}}/></label>}</>}
        </>}
        {(!editing || operation==="series_update") && <fieldset className="form-grid planning-fields" disabled={busy}>
          <label>Titel<input value={data.title} minLength={3} maxLength={120} onChange={e=>changeData("title",e.target.value)}/></label>
          <label>Ort<input value={data.location} maxLength={200} onChange={e=>changeData("location",e.target.value)}/></label>
          <label className="span-2">Beschreibung<textarea value={data.description} maxLength={2000} onChange={e=>changeData("description",e.target.value)}/></label>
          <label>Terminart<select value={data.event_type} onChange={e=>changeData("event_type",e.target.value==="regular" ? "regular" : e.target.value==="special" ? "special" : e.target.value==="breathing" ? "breathing" : e.target.value==="training" ? "training" : e.target.value==="community" ? "community" : "other")}>
            {Object.entries(EVENT_TYPES).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
          <label>Terminbereich<select value={scopeValue} disabled={editing} onChange={e=>{
            invalidate();const value=e.target.value;
            setData(d=>({...d,scope_kind:value==="organization" ? "organization" : value.startsWith("unit:") ? "unit" : "function",
              unit_id:value.startsWith("unit:") ? value.slice(5) : null,function_id:value.startsWith("function:") ? value.slice(9) : null,organizer_id:context.actor_id}));
          }}>
            {context.units.filter(u=>u.manageable).map(u=><option key={u.id} value={`unit:${u.id}`}>Einheit {u.name}</option>)}
            {context.functions.filter(f=>f.manageable).map(f=><option key={f.id} value={`function:${f.id}`}>Sonderfunktion {f.name}</option>)}
            {context.organization && <option value="organization">Alle Einheiten</option>}</select></label>
          <label>Organisator<select value={data.organizer_id ?? context.actor_id} onChange={e=>changeData("organizer_id",e.target.value)}>
            {organizers.map(p=><option key={p.id} value={p.id}>{p.name}{p.id===context.actor_id ? " (du selbst)" : ""}</option>)}</select></label>
          <label>Startdatum<input type="date" value={rule.start_date} onChange={e=>changeRule("start_date",e.target.value)}/></label>
          <label>Startzeit<input type="time" value={rule.start_time} onChange={e=>changeRule("start_time",e.target.value)}/></label>
          <label>Endzeit<input type="time" value={rule.end_time} onChange={e=>changeRule("end_time",e.target.value)}/></label>
          {(!editing || selection!=="single") && <><label>Wiederholungsregel<select value={rule.frequency} onChange={e=>changeRule("frequency",seriesRuleSchema.shape.frequency.parse(e.target.value))}>
            {Object.entries(frequencies).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
            {rule.frequency==="custom_weeks" && <label>Wochenabstand<input type="number" min={1} max={52} value={rule.weeks} onChange={e=>changeRule("weeks",Number(e.target.value))}/></label>}
            {rule.frequency==="monthly" && <><label>Monatliche Regel<select value={rule.monthly_mode} onChange={e=>changeRule("monthly_mode",e.target.value==="ordinal" ? "ordinal" : "day")}>
              <option value="day">Gleicher Monatstag (Monatsende begrenzt)</option><option value="ordinal">Wochentag im Monat</option></select></label>
              {rule.monthly_mode==="ordinal" && <><label>Woche im Monat<select value={rule.ordinal} onChange={e=>changeRule("ordinal",Number(e.target.value))}>
                {[1,2,3,4,5].map(n=><option key={n} value={n}>{n}.</option>)}</select></label>
                <label>Wochentag<select value={rule.weekday} onChange={e=>changeRule("weekday",Number(e.target.value))}>
                  {["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"].map((name,i)=><option key={name} value={i+1}>{name}</option>)}</select></label></>}</>}
          </>}
          {!editing && <><label>Maximale Anzahl (1–52, alternativ Enddatum)<input type="number" min={1} max={52} value={rule.count ?? ""} onChange={e=>changeRule("count",e.target.value ? Number(e.target.value) : null)}/></label>
            <label>Serienende (inklusive, optional bei Anzahl)<input type="date" value={rule.end_date ?? ""} onChange={e=>changeRule("end_date",e.target.value || null)}/></label></>}
        </fieldset>}
      </>}
      <button className="button secondary" disabled={busy || csvMode && (!csv.length || csv.some(r=>r.errors.length))} onClick={()=>void inspect()}>Vorschau prüfen</button>
      {preview && <>
        <p role="status">{preview.value.rows.length} Termine · {preview.value.protected_count} geschützt/übersprungen · {preview.value.duplicate_count} mögliche Duplikate.</p>
        {!!preview.value.response_count && <p className="notice" role="alert">{preview.value.response_count} vorhandene Rückmeldungen werden ungültig. Werte und Zeitpunkte bleiben erhalten; Mitglieder müssen erneut antworten.</p>}
        {!!preview.value.duplicate_count && <p className="notice error" role="alert">Duplikate erkannt. Keine Speicherung; Datei oder Planung korrigieren.</p>}
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Servervorschau"><table><thead><tr><th>Titel</th><th>Zeitraum (Berlin)</th><th>Bereich</th><th>Prüfung</th></tr></thead>
          <tbody>{preview.value.rows.map((r,i)=><tr key={r.event_id ?? i}><td>{r.title}</td><td>{calendarInterval({...r,all_day:false})}</td><td>{r.scope_name}</td><td>{r.duplicate ? "✕ Duplikat" : "✓ Geprüft"}</td></tr>)}</tbody></table></div>
        <label className="calendar-check"><input type="checkbox" checked={confirmed} disabled={busy || !preview.value.can_commit} onChange={e=>setConfirmed(e.target.checked)}/>
          Ich bestätige die geprüften Änderungen einschließlich angezeigter Rückmeldungsinvalidierung.</label>
        <button className="button" disabled={busy || !confirmed || !preview.value.can_commit} onClick={()=>void save()}>{csvMode ? "Import bestätigen" : "Änderungen bestätigen"}</button>
      </>}
    </>}
  </AppDialog>;
}
