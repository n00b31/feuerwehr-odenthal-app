import type { DemoState, DocumentArea, Event, Scope, User } from "./model";

export const isGlobalAdmin = (user: User) => user.roles.some((r) => r.role === "GLOBAL_ADMIN");
export const isAdmin = (user: User) => user.roles.some((r) => r.role !== "MEMBER");

export function manages(user: User, scope: Scope) {
  return isGlobalAdmin(user) || user.roles.some((r) =>
    (scope.kind === "unit" && r.role === "UNIT_ADMIN" && r.scopeId === scope.id) ||
    (scope.kind === "function" && r.role === "FUNCTION_ADMIN" && r.scopeId === scope.id));
}
export function belongs(user: User, scope: Scope) {
  return scope.kind === "organization" || (scope.kind === "unit" ? user.unitId === scope.id : user.functionIds.includes(scope.id));
}
export function isDelegatedOrganizer(user: User, event: Event) {
  return event.delegatedOrganizerId === user.id && event.roster.some((person) => person.userId === user.id);
}
export function canManageAttendance(user: User, event: Event) {
  return manages(user, event.scope) || isDelegatedOrganizer(user, event);
}
export function seesEvent(user: User, event: Event) {
  return belongs(user, event.scope) || manages(user, event.scope) || event.roster.some((p) => p.userId === user.id);
}
export function seesDocument(user: User, doc: DocumentArea) {
  return doc.visibility === "admins" ? manages(user, doc.scope) : belongs(user, doc.scope) || manages(user, doc.scope);
}
export function responseBlock(user: User, event: Event, now: Date): string | null {
  if (event.status === "cancelled") return "Dieser Termin wurde abgesagt.";
  if (!event.roster.some((p) => p.userId === user.id)) return "Du bist nicht in der Teilnehmerliste dieses Termins.";
  if (now.getTime() >= Date.parse(event.startsAt)) return "Seit Dienstbeginn sind Rückmeldungen gesperrt.";
  if (event.deadline && now.getTime() >= Date.parse(event.deadline)) return "Der Anmeldeschluss ist erreicht.";
  return null;
}
export function scopeLabel(state: DemoState, scope: Scope) {
  if (scope.kind === "organization") return "Alle Einheiten";
  return (scope.kind === "unit" ? state.units : state.functions).find((s) => s.id === scope.id)?.name ?? "Unbekannter Bereich";
}
export function manageableScopes(state: DemoState, user: User): Scope[] {
  return [
    { kind: "organization" } as const,
    ...state.units.map((u) => ({ kind: "unit" as const, id: u.id })),
    ...state.functions.map((f) => ({ kind: "function" as const, id: f.id })),
  ].filter((s) => manages(user, s));
}
