export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const publicPath = (path: string) => `${BASE_PATH}${path}`;

export const APP = {
  name: "Feuerwehr Odenthal",
  timeZone: "Europe/Berlin",
  storageKey: `ff-odenthal-demo-v1${BASE_PATH ? `:${BASE_PATH}` : ""}`,
  schemaVersion: 1,
  emailDomain: "feuerwehr-odenthal.de",
} as const;

export const EVENT_TYPES = {
  regular: "Regulärer Übungsdienst",
  special: "Sonderübung",
  breathing: "Atemschutzstrecke",
  training: "Fortbildung",
  community: "Gemeinschaftsveranstaltung",
  other: "Sonstiger Termin",
} as const;

export const RESPONSE_LABELS = { yes: "Zugesagt", no: "Abgesagt", maybe: "Vielleicht" } as const;
export const ATTENDANCE_LABELS = { present: "Anwesend", absent: "Abwesend", unknown: "Nicht festgestellt" } as const;
export const REPEAT_LABELS = { none: "Einzeltermin", weekly: "Wöchentlich", biweekly: "Alle zwei Wochen", monthly: "Monatlich" } as const;
export const ROLE_LABELS = {
  GLOBAL_ADMIN: "Organisationsadministration",
  UNIT_ADMIN: "Einheitsadministration",
  FUNCTION_ADMIN: "Funktionsadministration",
  MEMBER: "Mitglied",
} as const;

export const DEV_ROLE_LABELS = {
  ...ROLE_LABELS,
  GLOBAL_ADMIN: "Globaler Administrator",
  UNIT_ADMIN: "Einheitsführer",
  FIRE_CHIEF: "Feuerwehrleitung",
} as const;
