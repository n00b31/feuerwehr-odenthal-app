import { documentSchema, eventSchema, roleSchema, type Attendance, type DemoState, type DocumentArea, type EventInput, type Repeat, type Response, type Role, type User } from "./model";
import { belongs, canManageAttendance, isGlobalAdmin, manages, responseBlock } from "./permissions";
import { hasManualAttendance, isPractice } from "./statistics";
import { recurrenceInstant } from "./time";

export type Command =
  | { type: "respond"; eventId: string; response: Response }
  | { type: "prepareAttendance"; eventId: string }
  | { type: "assignOrganizer"; eventId: string; userId: string | null }
  | { type: "attendance"; eventId: string; userId: string; value: Attendance; reason: string }
  | { type: "finalize"; eventId: string }
  | { type: "createEvent"; input: EventInput; repeat: Repeat; count: number }
  | { type: "editEvent"; eventId: string; input: EventInput }
  | { type: "cancelEvent"; eventId: string; reason: string }
  | { type: "addDocument"; input: Omit<DocumentArea, "id"> }
  | { type: "member"; userId: string; unitId: string; functionIds: string[] }
  | { type: "functionMember"; userId: string; functionId: string; assigned: boolean }
  | { type: "roles"; userId: string; roles: Role[] }
  | { type: "addUnit"; name: string }
  | { type: "addFunction"; name: string }
  | { type: "renameUnit"; unitId: string; name: string };

const requireRule: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};
function validateInput(input: EventInput, state: DemoState, actor: User) {
  eventSchema.pick({ title: true, description: true, type: true, startsAt: true, endsAt: true, location: true, scope: true, deadline: true }).parse(input);
  requireRule(Date.parse(input.endsAt) > Date.parse(input.startsAt), "Das Ende muss nach dem Beginn liegen.");
  requireRule(!input.deadline || Date.parse(input.deadline) <= Date.parse(input.startsAt), "Anmeldeschluss muss vor oder am Beginn liegen.");
  requireRule(input.scope.kind === "organization" || (input.scope.kind === "unit" ? state.units : state.functions).some((s) => input.scope.kind !== "organization" && s.id === input.scope.id), "Unbekannter Bereich.");
  requireRule(manages(actor, input.scope), "Keine Administrationsberechtigung für diesen Bereich.");
}

// Pure domain boundary. Production must execute this behind verified server identity.
export function execute(state: DemoState, actorId: string, command: Command, now = new Date()): DemoState {
  const actor = state.users.find((u) => u.id === actorId);
  requireRule(actor, "Demo-Profil nicht gefunden.");
  const next = structuredClone(state);
  const audit = (action: string, targetId: string, detail: string) => next.audit.unshift({
    id: crypto.randomUUID(), at: now.toISOString(), actorId, action, targetId, detail,
  });
  if ("eventId" in command) {
    const event = next.events.find((e) => e.id === command.eventId);
    requireRule(event, "Termin nicht gefunden.");
    if (command.type === "respond") {
      requireRule(!responseBlock(actor, event, now), responseBlock(actor, event, now) ?? "");
      event.responses[actor.id] = command.response;
      audit("Rückmeldung", event.id, `${actor.name}: ${command.response}`);
    } else {
      const attendanceAction = command.type === "prepareAttendance" || command.type === "attendance" || command.type === "finalize";
      requireRule(attendanceAction ? canManageAttendance(actor, event) : manages(actor, event.scope), "Keine Berechtigung für diesen Termin.");
      if (command.type === "assignOrganizer") {
        requireRule(command.userId === null || event.status !== "cancelled", "Für abgesagte Termine kann keine neue Delegation vergeben werden.");
        requireRule(command.userId === null || (next.users.some((person) => person.id === command.userId) && event.roster.some((person) => person.userId === command.userId)), "Organisatoren müssen zum gespeicherten Teilnehmerkreis dieses Termins gehören.");
        requireRule((event.delegatedOrganizerId ?? null) !== command.userId, "Diese Delegation ist bereits gespeichert.");
        const before = event.delegatedOrganizerId ?? "keine Delegation";
        if (command.userId === null) delete event.delegatedOrganizerId;
        else event.delegatedOrganizerId = command.userId;
        audit(command.userId === null ? "Delegation widerrufen" : "Organisator zugewiesen", event.id,
          `${before} → ${command.userId ?? "keine Delegation"}; nur diese Termininstanz, keine Rollenänderung.`);
      } else if (command.type === "prepareAttendance" || command.type === "attendance" || command.type === "finalize") {
        requireRule(event.status !== "cancelled", "Für abgesagte Termine ist keine Anwesenheitserfassung möglich.");
        requireRule(now.getTime() >= Date.parse(event.startsAt), "Anwesenheit kann erst ab Dienstbeginn erfasst werden.");
        if (command.type === "prepareAttendance") {
          requireRule(isPractice(event), "Die automatische Vorbelegung ist nur für reguläre Übungsdienste und Sonderübungen vorgesehen.");
          if (event.attendancePreparedAt || event.finalizedAt) return next;
          const prefilled: Record<string, Attendance> = {};
          for (const person of event.roster) {
            if (Object.hasOwn(event.attendance, person.userId)) continue;
            const response = event.responses[person.userId];
            prefilled[person.userId] = response === "yes" ? "present" : response === "no" ? "absent" : "unknown";
          }
          Object.assign(event.attendance, prefilled);
          event.attendancePreparedAt = now.toISOString();
          event.attendancePrefilledIds = Object.keys(prefilled);
          audit("Anwesenheit vorläufig vorbelegt", event.id,
            `Nicht bestätigt; vorhandene Ist-Werte unverändert. Vorbelegung: ${JSON.stringify(prefilled)}`);
        } else if (command.type === "attendance") {
          requireRule(event.roster.some((p) => p.userId === command.userId), "Person nicht in der Teilnehmerliste.");
          requireRule(!event.finalizedAt || command.reason.trim().length >= 5, "Nach Abschluss ist ein Korrekturgrund mit mindestens 5 Zeichen erforderlich.");
          const before = event.attendance[command.userId] ?? "unknown";
          event.attendance[command.userId] = command.value;
          event.attendancePrefilledIds = event.attendancePrefilledIds?.filter((id) => id !== command.userId);
          audit(event.finalizedAt ? "Anwesenheit korrigiert" : "Anwesenheit erfasst", event.id,
            `${command.userId}: ${before} → ${command.value}${command.reason ? `; Grund: ${command.reason}` : ""}`);
        } else {
          requireRule(!event.finalizedAt, "Anwesenheitsliste ist bereits abgeschlossen.");
          event.finalizedAt = now.toISOString();
          audit("Anwesenheit abgeschlossen", event.id, `${event.roster.length} Personen; nicht festgestellte Anwesenheit bleibt unbekannt.`);
        }
      } else if (command.type === "cancelEvent") {
        requireRule(command.reason.trim().length >= 5, "Bitte einen Absagegrund mit mindestens 5 Zeichen angeben.");
        requireRule(!hasManualAttendance(event) && !event.finalizedAt, "Termine mit erfasster Anwesenheit können nicht abgesagt werden.");
        requireRule(event.status !== "cancelled", "Termin ist bereits abgesagt.");
        event.status = "cancelled";
        audit("Termin abgesagt", event.id, command.reason);
      } else {
        validateInput(command.input, next, actor);
        requireRule(event.status !== "cancelled" && now.getTime() < Date.parse(event.startsAt), "Nur zukünftige, nicht abgesagte Termine können bearbeitet werden.");
        requireRule(Date.parse(command.input.startsAt) > now.getTime(), "Ein bearbeiteter Termin muss in der Zukunft beginnen.");
        requireRule(JSON.stringify(event.scope) === JSON.stringify(command.input.scope), "Der Bereich einer bestehenden Instanz kann nicht geändert werden.");
        const before = JSON.stringify({ title: event.title, startsAt: event.startsAt, endsAt: event.endsAt, location: event.location, description: event.description, deadline: event.deadline });
        Object.assign(event, command.input);
        audit("Termininstanz bearbeitet", event.id, `Vorher: ${before}; Nachher: ${JSON.stringify(command.input)}`);
      }
    }
  } else if (command.type === "createEvent") {
    validateInput(command.input, next, actor);
    requireRule(Date.parse(command.input.startsAt) > now.getTime(), "Neue Termine müssen in der Zukunft beginnen.");
    requireRule(Number.isInteger(command.count) && command.count >= 1 && command.count <= 52, "Eine Serie darf 1 bis 52 Instanzen enthalten.");
    const seriesId = command.repeat === "none" ? undefined : crypto.randomUUID();
    const count = command.repeat === "none" ? 1 : command.count;
    for (let i = 0; i < count; i++) {
      const shift = (instant: string) => command.repeat === "none" ? instant : recurrenceInstant(instant, i, command.repeat);
      const input = {
        ...command.input,
        startsAt: shift(command.input.startsAt), endsAt: shift(command.input.endsAt),
        deadline: command.input.deadline ? shift(command.input.deadline) : undefined,
      };
      validateInput(input, next, actor);
      const id = crypto.randomUUID();
      next.events.push({
        ...input, id, seriesId, organizerId: actor.id, status: "scheduled",
        recurrence: command.repeat === "none" ? undefined : { frequency: command.repeat, total: count, index: i + 1 },
        roster: next.users.filter((u) => belongs(u, input.scope)).map((u) => ({ userId: u.id, unitId: u.unitId })),
        responses: {}, attendance: {},
      });
      audit("Termin erstellt", id, `${input.title}${seriesId ? `; Serie ${seriesId}; Instanz ${i + 1}` : ""}`);
    }
  } else if (command.type === "addDocument") {
    const doc = documentSchema.parse({ ...command.input, id: crypto.randomUUID() });
    requireRule(manages(actor, doc.scope), "Keine Berechtigung für diesen Dokumentbereich.");
    requireRule(doc.scope.kind === "organization" || (doc.scope.kind === "unit" ? next.units : next.functions).some((s) => doc.scope.kind !== "organization" && s.id === doc.scope.id), "Unbekannter Bereich.");
    const url = new URL(doc.url);
    requireRule(url.protocol === "https:" && (url.hostname.endsWith(".sharepoint.com") || url.hostname === "example.invalid"), "Nur HTTPS-SharePoint-Links oder example.invalid-Demo-Platzhalter sind erlaubt.");
    next.documents.push(doc);
    audit("Dokumentbereich hinzugefügt", doc.id, doc.name);
  } else if (command.type === "member") {
    const member = next.users.find((u) => u.id === command.userId);
    requireRule(member, "Mitglied nicht gefunden.");
    requireRule(manages(actor, { kind: "unit", id: member.unitId }) && manages(actor, { kind: "unit", id: command.unitId }), "Für einen Einheitswechsel sind Rechte in beiden Einheiten erforderlich.");
    requireRule(next.units.some((u) => u.id === command.unitId), "Unbekannte Einheit.");
    requireRule(command.functionIds.every((id) => next.functions.some((f) => f.id === id)), "Unbekannte Funktion.");
    const changedFunctions = new Set([...member.functionIds, ...command.functionIds].filter((id) => member.functionIds.includes(id) !== command.functionIds.includes(id)));
    requireRule([...changedFunctions].every((id) => manages(actor, { kind: "function", id })), "Funktionszuordnungen erfordern Rechte in den betroffenen Funktionen.");
    const before = `${member.unitId}; Funktionen: ${member.functionIds.join(", ")}`;
    if (member.unitId !== command.unitId) {
      const active = member.memberships.find((m) => !m.until);
      if (active) active.until = now.toISOString();
      member.memberships.push({ unitId: command.unitId, from: now.toISOString() });
      member.unitId = command.unitId;
    }
    member.functionIds = [...new Set(command.functionIds)];
    audit("Mitglied zugeordnet", member.id, `${before} → ${member.unitId}; Funktionen: ${member.functionIds.join(", ")}. Historische Teilnehmerlisten unverändert.`);
  } else if (command.type === "functionMember") {
    requireRule(manages(actor, { kind: "function", id: command.functionId }), "Keine Berechtigung für diese Funktion.");
    requireRule(next.functions.some((f) => f.id === command.functionId), "Unbekannte Funktion.");
    const member = next.users.find((u) => u.id === command.userId);
    requireRule(member, "Mitglied nicht gefunden.");
    member.functionIds = command.assigned
      ? [...new Set([...member.functionIds, command.functionId])]
      : member.functionIds.filter((id) => id !== command.functionId);
    audit("Funktionszuordnung geändert", member.id, `${command.functionId}: ${command.assigned ? "zugeordnet" : "entfernt"}. Historische Teilnehmerlisten unverändert.`);
  } else if (command.type === "roles") {
    requireRule(isGlobalAdmin(actor), "Nur die Organisationsadministration darf Rollen vergeben.");
    const member = next.users.find((u) => u.id === command.userId);
    requireRule(member, "Mitglied nicht gefunden.");
    requireRule(command.roles.length > 0, "Mindestens eine Rolle ist erforderlich.");
    for (const role of command.roles) {
      roleSchema.parse(role);
      if (role.role === "UNIT_ADMIN") requireRule(next.units.some((u) => u.id === role.scopeId), "Unbekannte Einheit.");
      if (role.role === "FUNCTION_ADMIN") requireRule(next.functions.some((f) => f.id === role.scopeId), "Unbekannte Funktion.");
    }
    requireRule(actor.id !== member.id || command.roles.some((r) => r.role === "GLOBAL_ADMIN"), "Die eigene globale Administrationsrolle kann in der Demo nicht entfernt werden.");
    const before = JSON.stringify(member.roles);
    member.roles = command.roles;
    audit("Rollen geändert", member.id, `${before} → ${JSON.stringify(command.roles)}`);
  } else {
    requireRule(isGlobalAdmin(actor), "Nur die Organisationsadministration darf globale Einstellungen ändern.");
    const name = command.name.trim();
    requireRule(name.length >= 2 && name.length <= 80, "Name muss 2 bis 80 Zeichen lang sein.");
    if (command.type === "renameUnit") {
      const unit = next.units.find((u) => u.id === command.unitId);
      requireRule(unit, "Einheit nicht gefunden.");
      requireRule(!next.units.some((u) => u.id !== unit.id && u.name.toLowerCase() === name.toLowerCase()), "Dieser Name ist bereits vorhanden.");
      audit("Einheit umbenannt", unit.id, `${unit.name} → ${name}`);
      unit.name = name;
    } else {
      const collection = command.type === "addUnit" ? next.units : next.functions;
      requireRule(!collection.some((s) => s.name.toLowerCase() === name.toLowerCase()), "Dieser Name ist bereits vorhanden.");
      const id = crypto.randomUUID();
      collection.push({ id, name });
      audit(command.type === "addUnit" ? "Einheit angelegt" : "Funktion angelegt", id, name);
    }
  }
  return next;
}
