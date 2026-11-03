import { CalendarDays, Dumbbell, GraduationCap, Handshake, LifeBuoy, Wrench } from "lucide-react";
import type { Event } from "@/domain/model";
import { dateLabel } from "@/domain/time";
import { EVENT_TYPES, RESPONSE_LABELS } from "@/config/app";

const typeIcons = { regular: CalendarDays, special: Wrench, breathing: LifeBuoy, training: GraduationCap, community: Handshake, other: Dumbbell };
export function EventType({ type }: { type: Event["type"] }) {
  const Icon = typeIcons[type];
  return <span className="event-type"><Icon size={15} aria-hidden="true" />{EVENT_TYPES[type]}</span>;
}
export function DateTile({ at }: { at: string }) {
  return <span className="date-tile" aria-hidden="true"><strong>{dateLabel(at, { day: "2-digit", weekday: undefined, month: undefined })}</strong><span>{dateLabel(at, { month: "short", day: undefined, weekday: undefined })}</span></span>;
}
export function ResponseBadge({ event, userId, now }: { event: Event; userId: string; now: Date }) {
  const response = event.responses[userId];
  const cancelled = event.status === "cancelled";
  const started = Date.parse(event.startsAt) <= now.getTime();
  const expired = !!event.deadline && Date.parse(event.deadline) <= now.getTime();
  const invited = event.roster.some((person) => person.userId === userId);
  const tone = cancelled || response === "no" ? "danger" : response === "yes" ? "success" : response === "maybe" || (!started && !expired && invited) ? "warning" : "";
  return <span className={`badge ${tone}`}>{cancelled ? "Termin abgesagt" : response ? RESPONSE_LABELS[response] : !invited ? "Nicht eingeladen" : started || expired ? "Rückmeldung gesperrt" : "Rückmeldung offen"}</span>;
}
