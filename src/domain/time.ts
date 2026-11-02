import { APP } from "../config/app";

export function berlinParts(date: Date | string) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: APP.timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(date));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}`, year: Number(get("year")) };
}

// Convert a wall-clock input to an instant, rejecting nonexistent DST times.
// Ambiguous autumn times deterministically use the earlier occurrence.
export function fromBerlin(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error("Ungültiges Datum oder Uhrzeit.");
  const guess = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(guess)) throw new Error("Ungültiges Datum.");
  const candidates = [1, 2].map((offset) => new Date(guess - offset * 3_600_000));
  const matches = candidates.filter((date) => `${berlinParts(date).date}T${berlinParts(date).time}` === local);
  if (!matches.length) throw new Error("Diese Uhrzeit existiert in Europe/Berlin nicht (Zeitumstellung).");
  return new Date(Math.min(...matches.map(Number))).toISOString();
}

export function localInput(instant: string) {
  const p = berlinParts(instant);
  return `${p.date}T${p.time}`;
}

export function dateLabel(instant: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: APP.timeZone, weekday: "short", day: "2-digit", month: "short", ...options,
  }).format(new Date(instant));
}
export function timeLabel(instant: string) {
  return new Intl.DateTimeFormat("de-DE", { timeZone: APP.timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(instant));
}
export function addLocalDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function recurrenceInstant(instant: string, index: number, repeat: "weekly" | "biweekly" | "monthly") {
  const p = berlinParts(instant);
  let date: string;
  if (repeat === "monthly") {
    const [year, month, day] = p.date.split("-").map(Number);
    const first = new Date(Date.UTC(year, month - 1 + index, 1));
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, lastDay))).toISOString().slice(0, 10);
  } else date = addLocalDays(p.date, index * (repeat === "weekly" ? 7 : 14));
  return fromBerlin(`${date}T${p.time}`);
}
