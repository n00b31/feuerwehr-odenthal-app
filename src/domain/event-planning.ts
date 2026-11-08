import {z} from "zod";
import {devEventTypeSchema} from "./dev-events";
import {addLocalDays,fromBerlin,localInput} from "./time";
import {EVENT_TYPES} from "../config/app";

export const SERIES_LIMIT=52,IMPORT_LIMIT=200,CSV_BYTE_LIMIT=512*1024;
export const frequencySchema=z.enum(["daily","weekly","biweekly","threeweekly","monthly","custom_weeks"]);
export const seriesRuleSchema=z.object({
  start_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time:z.string().regex(/^\d{2}:\d{2}$/),
  end_time:z.string().regex(/^\d{2}:\d{2}$/),
  frequency:frequencySchema,
  weeks:z.number().int().min(1).max(52).default(1),
  monthly_mode:z.enum(["day","ordinal"]).default("day"),
  ordinal:z.number().int().min(1).max(5).default(1),
  weekday:z.number().int().min(1).max(7).default(1),
  end_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  count:z.number().int().min(1).max(SERIES_LIMIT).nullable(),
}).refine(r=>r.count!==null || r.end_date!==null,"Serienende oder Anzahl erforderlich.");
export type SeriesRule=z.infer<typeof seriesRuleSchema>;
export const plannedEventSchema=z.object({
  title:z.string().trim().min(3).max(120),description:z.string().max(2000),
  location:z.string().trim().min(1).max(200),event_type:devEventTypeSchema,
  scope_kind:z.enum(["unit","function","organization"]),unit_id:z.uuid().nullable(),function_id:z.uuid().nullable(),
  organizer_id:z.uuid().nullable(),starts_at:z.iso.datetime({offset:true}),ends_at:z.iso.datetime({offset:true}),
  response_deadline:z.iso.datetime({offset:true}).nullable().default(null),
}).refine(e=>Date.parse(e.ends_at)>Date.parse(e.starts_at),"Ende muss nach Beginn liegen.")
  .refine(e=>e.scope_kind==="unit" ? !!e.unit_id && !e.function_id :
    e.scope_kind==="function" ? !!e.function_id && !e.unit_id : !e.unit_id && !e.function_id,"Genau einen Terminbereich wählen.");
export type PlannedEvent=z.infer<typeof plannedEventSchema>;
export const planningContextSchema=z.object({
  actor_id:z.uuid(),actor_name:z.string(),server_now:z.iso.datetime({offset:true}),
  units:z.array(z.object({id:z.uuid(),name:z.string(),manageable:z.boolean()})),
  functions:z.array(z.object({id:z.uuid(),name:z.string(),manageable:z.boolean()})),
  organization:z.boolean(),
  organizers:z.array(z.object({id:z.uuid(),name:z.string(),unit_ids:z.array(z.uuid()),function_ids:z.array(z.uuid())})),
});
export type PlanningContext=z.infer<typeof planningContextSchema>;
export const planPreviewSchema=z.object({
  token:z.string().regex(/^[a-f0-9]{64}$/),can_commit:z.boolean(),protected_count:z.number().int().nonnegative(),
  response_count:z.number().int().nonnegative(),duplicate_count:z.number().int().nonnegative(),
  rows:z.array(z.object({
    event_id:z.uuid().nullable(),title:z.string(),starts_at:z.iso.datetime({offset:true}),ends_at:z.iso.datetime({offset:true}),
    location:z.string(),scope_name:z.string(),duplicate:z.boolean(),
  })).max(IMPORT_LIMIT),
});
export type PlanPreview=z.infer<typeof planPreviewSchema>;
export type PlanRequest={
  operation:"series_create"|"csv_import"|"series_update"|"series_cancel"|"series_end";
  request_id:string;series_id?:string;anchor_id?:string;selection?:"single"|"following"|"all";
  rule?:SeriesRule;data?:Omit<PlannedEvent,"starts_at"|"ends_at"|"response_deadline">;
  rows?:PlannedEvent[];end_date?:string;reason?:string;
};

export function localDate(value:string) {
  const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const german=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if(!iso && !german)throw new Error("Datum: TT.MM.JJJJ oder JJJJ-MM-TT erforderlich.");
  const date=iso ? value : `${german![3]}-${german![2]}-${german![1]}`;
  fromBerlin(`${date}T12:00`);
  return date;
}
export function localInterval(date:string,start:string,end:string) {
  localDate(date);
  if(start===end)throw new Error("Beginn und Ende dürfen nicht gleich sein.");
  const startInstant=fromBerlin(`${date}T${start}`);
  const endInstant=fromBerlin(`${end<start ? addLocalDays(date,1) : date}T${end}`);
  return {starts_at:startInstant,ends_at:endInstant};
}
export function seriesDates(input:SeriesRule) {
  const r=seriesRuleSchema.parse(input);localDate(r.start_date);
  if(r.end_date && (localDate(r.end_date)<r.start_date))throw new Error("Serienende liegt vor dem Start.");
  const maxYear=Number(r.start_date.slice(0,4))+5;
  const horizon=`${maxYear}${r.start_date.slice(4)}`;
  if(maxYear>9998 || r.end_date && r.end_date>horizon)throw new Error("Planungshorizont: höchstens fünf Jahre.");
  const rows:{starts_at:string;ends_at:string}[]=[];
  for(let offset=0;offset<=5*366;offset++){
    const date=addLocalDays(r.start_date,offset);
    if(date>horizon || r.end_date && date>r.end_date)break;
    const d=new Date(`${date}T12:00:00Z`),anchor=new Date(`${r.start_date}T12:00:00Z`);
    const months=(d.getUTCFullYear()-anchor.getUTCFullYear())*12+d.getUTCMonth()-anchor.getUTCMonth();
    const interval=r.frequency==="weekly" ? 7 : r.frequency==="biweekly" ? 14 : r.frequency==="threeweekly" ? 21 :
      r.frequency==="custom_weeks" ? r.weeks*7 : 1;
    const lastDay=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
    const match=r.frequency==="monthly" ? months>=0 && (r.monthly_mode==="ordinal"
      ? (d.getUTCDay() || 7)===r.weekday && Math.ceil(d.getUTCDate()/7)===r.ordinal
      : d.getUTCDate()===Math.min(anchor.getUTCDate(),lastDay)) : offset%interval===0;
    if(!match)continue;
    if(rows.length===SERIES_LIMIT)throw new Error("Mehr als 52 Instanzen. Anzahl begrenzen oder Serienende verkürzen.");
    rows.push(localInterval(date,r.start_time,r.end_time));
    if(r.count && rows.length===r.count)break;
  }
  if(!rows.length || r.count && !r.end_date && rows.length<r.count)throw new Error("Keine ausreichenden Termine innerhalb des Planungshorizonts.");
  return rows;
}

export const CSV_HEADERS=["Datum","Beginn","Ende","Titel","Beschreibung","Ort","Einheit","Terminart","Sonderfunktion","Organisator"] as const;
export function csvRecords(text:string) {
  if(new TextEncoder().encode(text).length>CSV_BYTE_LIMIT)throw new Error("CSV ist größer als 512 KiB.");
  const records:{line:number;cells:string[]}[]=[];
  let cells:string[]=[],cell="",quoted=false,closed=false,line=1,recordLine=1;
  const input=text.replace(/^\uFEFF/,"");
  function flushCell(){cells.push(cell);cell="";closed=false;}
  function flushRow(){flushCell();if(cells.some(v=>v.trim()) && !cells[0].trim().startsWith("#"))records.push({line:recordLine,cells});cells=[];recordLine=line+1;}
  for(let i=0;i<input.length;i++){
    const ch=input[i];
    if(quoted){
      if(ch==='"'){if(input[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}
      else{cell+=ch;if(ch==="\n")line++;}
      continue;
    }
    if(ch==='"'){if(cell || closed)throw new Error(`Zeile ${line}: unerwartetes Anführungszeichen.`);quoted=true;}
    else if(ch===";")flushCell();
    else if(ch==="\n" || ch==="\r"){
      if(ch==="\r" && input[i+1]==="\n")i++;
      flushRow();line++;
    }else{if(closed)throw new Error(`Zeile ${line}: Zeichen nach einem quotierten Feld.`);cell+=ch;}
  }
  if(quoted)throw new Error(`Zeile ${recordLine}: nicht geschlossenes CSV-Feld.`);
  if(cell || cells.length)flushRow();
  if(records.length>IMPORT_LIMIT+1)throw new Error("CSV darf höchstens 200 Termine enthalten.");
  return records;
}
export type CsvPreviewRow={line:number;title:string;event:PlannedEvent|null;errors:string[];duplicate:boolean};
export function parseEventCsv(text:string,context:PlanningContext):CsvPreviewRow[]{
  const records=csvRecords(text),head=records.shift();
  if(!head || head.cells.join(";")!==CSV_HEADERS.join(";"))throw new Error(`Spalten exakt: ${CSV_HEADERS.join(";")}`);
  if(!records.length)throw new Error("CSV enthält keine Termine.");
  const keys=new Set<string>();
  return records.map(row=>{
    const [date,start,end,title,description,location,unitName,eventType,functionName,organizerName]=row.cells.map(v=>v.trim());
    const errors:string[]=[];
    let event:PlannedEvent|null=null,duplicate=false;
    if(row.cells.length!==CSV_HEADERS.length)errors.push("Falsche Spaltenanzahl.");
    try{
      const equal=(a:string,b:string)=>a.toLocaleLowerCase("de-DE")===b.toLocaleLowerCase("de-DE");
      const unit=context.units.find(u=>equal(u.name,unitName ?? ""));
      const fn=context.functions.find(f=>equal(f.name,functionName ?? ""));
      const organization=equal(unitName ?? "","Alle Einheiten");
      if(functionName && unitName)throw new Error("Einheit oder Sonderfunktion angeben, nicht beide; Funktionsdienste gelten funktionsweit.");
      if(functionName && !fn)throw new Error("Sonderfunktion nicht erkannt.");
      if(!functionName && !unit && !organization)throw new Error("Einheit nicht erkannt oder fehlt.");
      if(fn && !fn.manageable || unit && !unit.manageable || organization && !context.organization)throw new Error("Keine Verwaltung für diesen Bereich.");
      const matches=organizerName ? context.organizers.filter(p=>equal(p.name,organizerName)) : [];
      if(organizerName && matches.length!==1)throw new Error("Organisator nicht eindeutig erkannt; leer lassen oder exakten Namen wählen.");
      const organizer=matches[0];
      if(organizer && organizer.id!==context.actor_id && (!organizer.unit_ids.length ||
        (fn ? !organizer.function_ids.includes(fn.id) : unit ? !organizer.unit_ids.includes(unit.id) : false)))
        throw new Error("Organisator nicht für diesen Terminbereich berechtigt.");
      const type=Object.entries(EVENT_TYPES).find(([key,name])=>equal(key,eventType ?? "") || equal(name,eventType ?? ""))?.[0];
      event=plannedEventSchema.parse({
        title,description,location,event_type:type,scope_kind:fn ? "function" : organization ? "organization" : "unit",
        unit_id:fn || organization ? null : unit?.id,function_id:fn?.id ?? null,organizer_id:matches[0]?.id ?? context.actor_id,
        ...localInterval(localDate(date ?? ""),start ?? "",end ?? ""),
      });
      if(Date.parse(event.starts_at)<=Date.parse(context.server_now))throw new Error("Nur zukünftige Termine importieren.");
      const now=new Date(context.server_now),year=now.getUTCFullYear()+5,month=now.getUTCMonth();
      const lastDay=new Date(Date.UTC(year,month+1,0)).getUTCDate();
      const horizon=Date.UTC(year,month,Math.min(now.getUTCDate(),lastDay),now.getUTCHours(),now.getUTCMinutes(),now.getUTCSeconds(),now.getUTCMilliseconds());
      if(Date.parse(event.starts_at)>horizon)throw new Error("Planungshorizont: höchstens fünf Jahre.");
      const key=eventKey(event);duplicate=keys.has(key);keys.add(key);
      if(duplicate)errors.push("Doppelte Zeile innerhalb dieser CSV.");
    }catch(error){
      errors.push(error instanceof z.ZodError ? error.issues.map(i=>`${i.path.join(".")}: ${i.message}`).join(" · ") :
        error instanceof Error ? error.message : "Ungültige CSV-Zeile.");
      event=null;
    }
    return {line:row.line,title:title ?? "",event,errors,duplicate};
  });
}
export function eventKey(e:PlannedEvent) {
  return [e.scope_kind,e.unit_id ?? "",e.function_id ?? "",Date.parse(e.starts_at),Date.parse(e.ends_at),
    e.title.trim().replace(/\s+/g," ").toLocaleLowerCase("de-DE")].join("|");
}
function csvCell(value:string) {
  const safe=/^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replaceAll('"','""')}"` : safe;
}
export function csvTemplate(context:PlanningContext) {
  const unit=context.units.find(u=>u.manageable);
  const fn=context.functions.find(f=>f.manageable);
  if(!unit && !fn && !context.organization)throw new Error("Keine Terminverwaltung für die Vorlage.");
  const date=addLocalDays(localInput(context.server_now).slice(0,10),7);
  const example=[date,"19:30","21:30","BEISPIEL - Übungsdienst","Fiktives Beispiel: vor Import prüfen und ändern",
    "BEISPIEL - Gerätehaus",unit?.name ?? (fn ? "" : "Alle Einheiten"),"regular",unit ? "" : fn?.name ?? "",""].map(csvCell).join(";");
  const comments=[
    "# Pflicht: Datum; Beginn; Ende; Titel; Ort; Terminart; Einheit ODER Sonderfunktion",
    "# Datum: TT.MM.JJJJ oder JJJJ-MM-TT. Zeit: HH:mm. UTF-8, Semikolon, Europe/Berlin.",
    "# Beschreibung/Organisator optional. Organisator leer: angemeldeter Benutzer.",
    "# Funktionsdienst: Einheit leer, Sonderfunktion setzen. Maximal 200 Termine/512 KiB. Kein Teilimport.",
    `# Terminarten: ${Object.entries(EVENT_TYPES).map(([key,name])=>`${key} (${name})`).join(", ")}`,
    `# Einheiten: ${context.units.map(u=>u.name).join(", ")}`,
    `# Sonderfunktionen: ${context.functions.map(f=>f.name).join(", ")}`,
    "# BEISPIEL-Zeilen sind fiktiv, keine übernommenen Mitgliederdaten.",
  ];
  return "\uFEFF"+[CSV_HEADERS.join(";"),example,...comments].join("\r\n")+"\r\n";
}
