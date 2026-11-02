import type { DemoState, Event, Scope, User } from "../domain/model";
import { addLocalDays, berlinParts, fromBerlin } from "../domain/time";
import { belongs } from "../domain/permissions";

export function createSeed(now = new Date()): DemoState {
  const { date, year } = berlinParts(now);
  const units = ["Scheuren", "Odenthal", "Blecher", "Eikamp", "Voiswinkel"].map((name, i) => ({ id: `unit-${i}`, name }));
  const functions = [
    { id: "equipment", name: "Gerätewarte" },
    { id: "clothing", name: "Kleiderkammer" },
    { id: "breathing", name: "Atemschutz" },
  ];
  const firstNames = ["Anna", "Lukas", "Miriam", "Thomas", "Jana", "Felix", "Lea", "Jonas", "Nora", "David"];
  const lastNames = ["Berg", "Weber", "Keller", "Hoffmann", "Wagner", "Becker", "Schulz", "Fischer", "Schneider", "Braun"];
  const users: User[] = units.flatMap((unit, n) => Array.from({ length: 50 }, (_, i) => ({
    id: `person-${n}-${i}`,
    name: `${firstNames[i % 10]} ${lastNames[(Math.floor(i / 10) + n + i) % 10]}${i >= 10 ? ` ${Math.floor(i / 10) + 1}` : ""}`,
    email: `demo.${n}.${i}@feuerwehr-odenthal.de`,
    unitId: unit.id,
    functionIds: i % 4 === 0 ? ["breathing", "equipment"] : i % 5 === 0 ? ["clothing"] : i % 3 === 0 ? ["breathing"] : [],
    roles: i === 1 ? [{ role: "UNIT_ADMIN" as const, scopeId: unit.id }]
      : i === 2 && n === 0 ? [{ role: "FUNCTION_ADMIN" as const, scopeId: "breathing" }]
        : i === 3 && n === 0 ? [{ role: "GLOBAL_ADMIN" as const }] : [{ role: "MEMBER" as const }],
    memberships: [{ unitId: unit.id, from: `${year - 2}-01-01T00:00:00.000Z` }],
  })));
  users[0].name = "Anna Berg";
  users[1].name = "Lukas Weber";
  users[2].name = "Miriam Keller";
  users[2].functionIds = ["breathing"];
  users[3].name = "Thomas Hoffmann";
  const events: Event[] = [];
  function add(id: string, title: string, scope: Scope, startsAt: string, type: Event["type"] = "regular", historical = false) {
    const roster = users.filter((u) => belongs(u, scope)).map((u) => ({ userId: u.id, unitId: u.unitId }));
    events.push({
      id, title, type, scope, startsAt,
      endsAt: new Date(Date.parse(startsAt) + 2 * 3_600_000).toISOString(),
      description: type === "regular"
        ? "Gemeinsam üben, sicher handeln: praktische Ausbildung in kleinen Gruppen. Bitte vollständige persönliche Schutzausrüstung mitbringen."
        : "Gemeinsamer Ausbildungs- und Austauschdienst. Treffpunkt ist der angegebene Standort; weitere Informationen folgen vor Ort.",
      location: scope.kind === "unit" ? `Gerätehaus ${units.find((u) => u.id === scope.id)?.name}` : "Feuerwehrhaus Odenthal",
      organizerId: scope.kind === "unit" ? `person-${scope.id.split("-")[1]}-1` : "person-0-3",
      status: "scheduled", roster,
      responses: Object.fromEntries(roster.filter((_, i) => i % 3 !== 2).map((p, i) => [p.userId, i % 4 === 3 ? "maybe" : "yes"])),
      attendance: historical ? Object.fromEntries(roster.map((p, i) => [p.userId, (i + events.length) % 5 === 0 ? "absent" : "present"])) : {},
      finalizedAt: historical ? new Date(Date.parse(startsAt) + 3 * 3_600_000).toISOString() : undefined,
    });
  }
  const dayOfYear = Math.floor((Date.parse(`${date}T12:00Z`) - Date.parse(`${year}-01-01T12:00Z`)) / 86_400_000);
  const historyCount = Math.min(12, dayOfYear);
  for (const unit of units) {
    const scope = { kind: "unit", id: unit.id } as const;
    for (let i = 0; i < historyCount; i++) {
      const historicalDate = addLocalDays(`${year}-01-01`, Math.floor(i * dayOfYear / historyCount));
      add(`${unit.id}-past-${i}`, ["Technische Hilfeleistung", "Löschangriff & Wasserversorgung", "Funk und Einsatzkommunikation", "Erste Hilfe im Einsatz"][i % 4],
        scope, fromBerlin(`${historicalDate}T19:00`), i % 4 === 3 ? "training" : "regular", true);
    }
    add(`${unit.id}-live`, "Praxisdienst · Technische Hilfe", scope, new Date(now.getTime() - 30 * 60_000).toISOString(), "special");
    add(`${unit.id}-next`, "Löschangriff im Team", scope, fromBerlin(`${addLocalDays(date, 2)}T19:00`));
    add(`${unit.id}-future`, "Wasserförderung über lange Wege", scope, fromBerlin(`${addLocalDays(date, 9)}T19:00`));
    add(`${unit.id}-other`, "Fahrzeug- und Gerätekunde", scope, fromBerlin(`${addLocalDays(date, 16)}T18:30`), "other");
  }
  add("breathing-next", "Atemschutz · Belastungsübung", { kind: "function", id: "breathing" }, fromBerlin(`${addLocalDays(date, 5)}T18:00`), "breathing");
  add("equipment-next", "Geräteprüfung & Werkstatt", { kind: "function", id: "equipment" }, fromBerlin(`${addLocalDays(date, 7)}T18:00`), "other");
  add("community-next", "Zusammenhalt · Gemeinsamer Abend", { kind: "organization" }, fromBerlin(`${addLocalDays(date, 12)}T18:00`), "community");
  add("last-year", "Jahresabschlussübung", { kind: "unit", id: units[0].id }, fromBerlin(`${year - 1}-11-15T19:00`), "regular", true);
  // Leave Anna's future responses open to make the dashboard actionable.
  events.filter((e) => Date.parse(e.startsAt) > now.getTime()).forEach((e) => { delete e.responses[users[0].id]; });
  return {
    version: 1, seedDate: date, units, functions, users, events,
    documents: [
      { id: "doc-1", name: "Dienst- & Ausbildungsplan", description: "Jahresplanung, Ausbildungsinhalte und Dienstunterlagen der Einheit.", scope: { kind: "unit", id: units[0].id }, visibility: "members", url: "https://example.invalid/sharepoint/dienstplan" },
      { id: "doc-2", name: "Einsatzwissen", description: "Merkblätter, Standardabläufe und Wissen für den Einsatzalltag.", scope: { kind: "organization" }, visibility: "members", url: "https://example.invalid/sharepoint/einsatzwissen" },
      { id: "doc-3", name: "Atemschutz", description: "Ausbildungsunterlagen und Hinweise für Atemschutzgeräteträger.", scope: { kind: "function", id: "breathing" }, visibility: "members", url: "https://example.invalid/sharepoint/atemschutz" },
      { id: "doc-4", name: "Leitungsunterlagen", description: "Verwaltungsunterlagen für die Einheitsleitung.", scope: { kind: "unit", id: units[0].id }, visibility: "admins", url: "https://example.invalid/sharepoint/leitung" },
    ],
    audit: [{
      id: "seed", at: now.toISOString(), actorId: "person-0-3", action: "Demo initialisiert",
      targetId: "demo", detail: "250 fiktive Personen, fünf Einheiten. Vergangene Anwesenheiten sind ausschließlich synthetische Demodaten.",
    }],
  };
}
