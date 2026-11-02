import type { DemoState, Event } from "./model";
import { berlinParts } from "./time";

export const isPractice = (event: Event) => event.type === "regular" || event.type === "special";
export function yearEvents(events: Event[], year: number, now: Date) {
  return events.filter((e) => e.status !== "cancelled" && berlinParts(e.startsAt).year === year && Date.parse(e.startsAt) <= now.getTime());
}
export function personalStatistics(state: DemoState, userId: string, year: number, now: Date) {
  const eligible = yearEvents(state.events, year, now).filter((e) => e.roster.some((p) => p.userId === userId));
  const practices = eligible.filter(isPractice);
  const visited = eligible.filter((e) => e.attendance[userId] === "present");
  const attendedPractices = practices.filter((e) => e.attendance[userId] === "present").length;
  return {
    practiceCount: practices.length, attendedPractices,
    attendanceCount: visited.length,
    rate: practices.length ? Math.round(attendedPractices / practices.length * 100) : 0,
    hours: visited.reduce((sum, e) => sum + (Date.parse(e.endsAt) - Date.parse(e.startsAt)) / 3_600_000, 0),
    visited: visited.sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
  };
}
export function eventCounts(event: Event) {
  return {
    yes: Object.values(event.responses).filter((r) => r === "yes").length,
    present: Object.values(event.attendance).filter((r) => r === "present").length,
    absent: Object.values(event.attendance).filter((r) => r === "absent").length,
    unknown: event.roster.filter((p) => !event.attendance[p.userId] || event.attendance[p.userId] === "unknown").length,
  };
}
