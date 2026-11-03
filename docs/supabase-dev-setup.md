# Supabase DEV – Bestandsaufnahme und Vorbereitung

Stand: 03.11.2026. Ziel ist das **bereits angelegte** Supabase-Projekt, kein neues Projekt.
Diese Vorbereitung schaltet die öffentliche Demo **nicht** auf echte Benutzer oder Daten um.

## 1. Konfigurationsbericht: tatsächlich geprüft

| Prüfpunkt | Feststellung | Konsequenz |
|---|---|---|
| Autorisierte Supabase-Integration | In dieser Sitzung keine Supabase-Tools verfügbar. Connector-Suche meldet „unavailable“. | Kein bestätigter Projektzugriff, keine Remote-Änderung. |
| Alternative Management-Verbindung | Keine Supabase-CLI und kein `SUPABASE_ACCESS_TOKEN` in der Sitzung vorhanden. Es wurden nur Vorhandenseinsprüfungen durchgeführt, keine Schlüssel ausgegeben. | Keine lokale Installation und kein Zugriff mit erfundenen Daten. |
| Projektidentität / Status / Region / Plan | **Nicht remote geprüft.** Project Ref und URL sind nicht bekannt. „Projekt leer“ ist die Angabe des Auftraggebers, keine eigene Messung. | Vor Anwendung der Migrationen bestehendes DEV-Projekt eindeutig zuordnen. |
| PostgreSQL / Tabellen / RLS / Grants | **Nicht remote geprüft.** | Datenbankversion, Erreichbarkeit, vorhandene Objekte und Berechtigungen inventarisieren. |
| Auth / E-Mail-Provider / Verifizierung / Redirects | **Nicht remote geprüft.** | Sollwerte in Abschnitt 3, nicht als bereits aktiviert verstehen. |
| SMTP / Empfänger / Versandlimits | **Nicht remote geprüft.** Offizielle Dokumentation zum Standardversand gelesen. | Keine Testmail versendet, keine Versandkontingente verbraucht. |
| API-Schlüssel / exponierte Schemas / Sicherheit | **Nicht remote geprüft.** | Keine Keys erzeugt, gelesen, rotiert oder im Repository hinterlegt. |
| Bestehende Anwendung | Next.js-Static-Export, Browser-Repository, lokale Rollen und lokale Audit-Einträge; kein Supabase-SDK und keine echte Anmeldung. | Demo bleibt strikt vom zukünftigen Backend getrennt. |

**Bereits im Repository vorbereitet:** vier transaktionale SQL-Migrationen, RLS und eingeschränkte RPCs,
isolierte PostgreSQL-Autorisierungstests, optionale öffentliche Build-Konfiguration, MCP-Beispiel und diese Anleitung.
**Im vorhandenen Supabase-Projekt durchgeführt: nichts.** Auch keine Ressourcen-, Plan-, SMTP- oder Auth-Änderung.

## 2. Bestehendes Projekt autorisiert verbinden

1. Im Supabase-Dashboard das vorhandene DEV-Projekt öffnen. Project Ref, Region, Status und Plan kontrollieren.
   Kein „New project“, kein kostenpflichtiges Upgrade.
2. Der offizielle gehostete MCP-Endpunkt ist `https://mcp.supabase.com/mcp`.
   `.mcp.json.example` ist **inaktiv** und enthält keine Zugangsdaten. Vor Aktivierung die URL um
   `&project_ref=` mit dem tatsächlichen Project Ref ergänzen. `read_only=true` zunächst beibehalten.
   Den Ref aus dem Dashboard verwenden, nicht den GitHub-Repositorynamen.
3. Die geprüfte Beispieldatei als `.mcp.json` kopieren. Diese lokale Datei ist git-ignoriert.
   In der Copilot-App unter **Settings → Projekt → Repository customizations → MCP servers**
   den Server `supabase` prüfen und, sofern angeboten, **Sign in** wählen.
   OAuth im Browser mit dem berechtigten Supabase-Konto und der passenden Organisation abschließen.
   Keine PATs, Datenbankpasswörter oder Secret Keys im Chat übermitteln.
4. Falls die App den Server nicht lädt oder keine Anmeldung anbietet: Dashboard für die manuelle
   Inventarisierung nutzen bzw. eine unterstützte OAuth-MCP-Verbindung einrichten. Eine Konfigurationsdatei
   allein bestätigt weder Authentifizierung noch Projektzugriff.
5. Zuerst lesend Projektidentität, PostgreSQL, Auth-Einstellungen, API-Schemas, Tabellen, Policies,
   Tabellen-/Funktions-Grants und Security Advisor prüfen. MCP stellt möglicherweise nicht jede
   Auth-Management-Einstellung bereit; verbleibende Punkte im Dashboard prüfen und belegen.
6. Erst nach dokumentierter Identitätsprüfung und Review darf ein berechtigter Operator die
   nicht-destruktiven Migrationen am **bestehenden DEV-Projekt** anwenden. Eine spätere Schreibverbindung
   bewusst projektgebunden freigeben, nicht stillschweigend den Read-only-Schutz entfernen.

Die Connector-Suche wurde nicht durch eine andere Katalogsuche umgangen. Das MCP-Beispiel folgt
der offiziellen Supabase-Dokumentation und wird hier nicht automatisch aktiviert.

## 3. Erforderliche Supabase-Einstellungen

Alle folgenden Punkte sind **Sollwerte / offene Dashboard-Aufgaben**, keine Behauptungen über den Ist-Zustand.

| Bereich | DEV-Sollwert und Prüfung |
|---|---|
| Projekt | Vorhandenes Projekt aktiv, Datenbank erreichbar; PostgreSQL mindestens 15 für `security_invoker`-Views. CI prüft PostgreSQL 17; tatsächliche Projektversion noch abgleichen. Free-Plan/Pausierung prüfen, nichts kostenpflichtig aktivieren. |
| Auth-Provider | E-Mail/Passwort aktiv. Anonyme Anmeldung, Telefon- und nicht benötigte OAuth-Provider aus. Nicht mit dem lokalen Demo-Profilwechsel verbinden. |
| E-Mail-Verifizierung | „Confirm email“ an; keine automatische Bestätigung. Secure email change an. Auch bei einer Fehlkonfiguration verhindert die Datenbank geschützten Zugriff ohne `email_confirmed_at`. |
| Domain | Before User Created Hook auf `ff_private.before_user_created` konfigurieren, URI `pg-functions://postgres/ff_private/before_user_created`. Nur exakte Domain `feuerwehr-odenthal.de`, case-insensitiv, Provider `email`, keine anonymen Konten. Hook ist laut Dokumentation im Free-Plan verfügbar; aktuellen Plan prüfen. |
| Zweite Domain-Schranke | Auth-Insert-Trigger blockiert fremde Domains auch bei deaktiviertem Hook. Der Hook liefert die verständliche Registrierungsablehnung; der Trigger ist die fehlerschließende Rückfallebene. |
| Site URL | Für die spätere Integration `https://n00b31.github.io/feuerwehr-odenthal-app/`. Noch kein Login-/Callback-UI vorhanden: jetzt keine funktionierende Anmeldung behaupten. |
| Redirect-Allowlist | Später exakt `https://n00b31.github.io/feuerwehr-odenthal-app/auth/callback/`; nur nach Implementierung dieser statischen Route hinzufügen. Für Passwort-Reset eine eigene tatsächlich implementierte Route. Keine `**`-Wildcard für `github.io`, keine beliebigen `next`-URLs. |
| Auth-Sicherheit | Passwortlänge, Rate Limits, OTP-/Token-Laufzeiten und verfügbare Passwortschutzoptionen prüfen. Für Admins MFA vor produktivem Betrieb planen. Keine kostenpflichtige Option ungefragt einschalten. |
| Data API | Nur bewusst benötigte Schemas exponieren. `ff_private`, `auth` und technische Schemas **nicht** exponieren. `public` ist für die vorbereiteten Tabellen/RPCs vorgesehen. Unbenutzte API-/GraphQL-/Realtime-Flächen prüfen, nicht pauschal neue Schemas veröffentlichen. |
| RLS / Grants | RLS auf allen 15 Anwendungstabellen. Kein `anon`-Zugriff. Authenticated erhält nur definierte SELECT-Spalten/Policies und ausgewählte RPCs, keine direkten DML-/TRUNCATE-/TRIGGER-Rechte. Bestehende Default-Grants und Security Advisor zusätzlich remote prüfen. |
| Schlüssel | Bestehende Project URL und **Publishable Key** verwenden. Kein Secret-/`service_role`-/Management-Key im Frontend. Keine Schlüsselrotation ohne Anlass. |
| Ressourcen | Keine Edge Functions, Storage-Buckets, Realtime-Abonnements oder bezahlten Dienste automatisch anlegen. SharePoint-Dateien bleiben außerhalb dieser Datenbank. |

## 4. Registrierung und Freigabe: serverseitige Grenze

1. Supabase Auth registriert die Feuerwehr-E-Mail. Hook und Datenbank prüfen die Domain,
   nicht nur ein Formular im Browser.
2. Der Auth-Insert-Trigger erzeugt ein Profil mit `status = pending`. Selbst übermittelte
   `role`, `status`, Einheit und Sonderfunktionen aus `user_metadata` werden ignoriert.
3. Supabase bestätigt die E-Mail. Das allein erteilt **keinen** Zugriff auf Feuerwehrinhalte.
4. Eine freigegebene `GLOBAL_ADMIN`-Person sieht die Registrierungen über `ff_pending_registrations()`.
   Unbestätigte E-Mails werden kenntlich gemacht; sie können nicht freigegeben werden.
5. `ff_approve_member(user, unit)` prüft Identität, Verifizierung und Domain nochmals,
   weist die Einheit zu und vergibt nur `MEMBER`. Rollen werden separat kontrolliert vergeben.
6. Erst danach erlauben RLS und RPCs geschützte Zugriffe. Vorher ist ausschließlich das eigene
   minimale Profil mit Freigabestatus lesbar, keine Einheiten, Termine, Dokumente, Rollen oder Statistiken.

Der Gatekeeper liest den aktuellen Datenbankzustand und `auth.users`; er vertraut nicht auf
benutzerveränderbare Metadaten oder veraltete Rollen-Claims im JWT. Ablehnung/Sperrung, Auth-Ban,
gelöschte Auth-Identität und fehlende Bestätigung sperren geschützte Zugriffe.
Eine andere E-Mail als `approved_email` verlangt erneute explizite Freigabe, auch innerhalb der
richtigen Domain. Das zukünftige UI muss diesen Zustand als „erneute Prüfung nötig“ anzeigen;
das gespeicherte Profilstatusfeld allein reicht dafür nicht.

### Erster Administrator

Es gibt keinen automatisch freigegebenen Demo-Admin, keine fest eingetragene E-Mail und keine
Anmeldung per Publishable Key als Administrator.
Nach echter Registrierung und E-Mail-Verifizierung wählt der berechtigte Datenbankoperator
die überprüfte Auth-UUID aus und ruft im SQL Editor einmalig
`ff_private.bootstrap_global_admin(benutzer_uuid, einheits_uuid)` auf.
Die Einheits-UUID stammt aus `units`, Pilot `code = 'scheuren'`.

Die Bootstrap-Funktion ist für `anon`/`authenticated` gesperrt und verweigert jeden weiteren
Aufruf, sobald jemals eine globale Rolle angelegt wurde. Normale RPCs verhindern den Entzug
des letzten aktiven Global-Admins. Eine außerhalb dieser RPCs gesperrte/gelöschte letzte
Admin-Identität erfordert einen gesonderten, dokumentierten Operator-Recovery-Prozess,
keine versteckte Selbstfreigabe. Nicht beliebige Feuerwehrmitglieder zu Supabase-Projektadmins machen.

## 5. E-Mail in DEV

Der integrierte Mailversand ist ausschließlich eine **nicht-produktive Testlösung**.
Laut offizieller Dokumentation dürfen ohne eigenes SMTP nur E-Mail-Adressen aus dem
Supabase-Organisationsteam angeschrieben werden; das dokumentierte Standardlimit beträgt
derzeit **2 Nachrichten pro Stunde**, kann sich aber ändern. Tatsächliche Projektlimits sind noch ungeprüft.

Die Testadresse muss gleichzeitig autorisierter Empfänger **und** eine verifizierbare
`@feuerwehr-odenthal.de`-Adresse sein. Falls keine geeignete Team-Testadresse existiert,
bleiben echte Versandtests offen. Die Domainregel und E-Mail-Verifizierung nicht lockern
und normalen Mitgliedern nicht nur wegen der Mailzustellung Control-Plane-Rechte geben.
Keine Masseneinladungen und keine Testmails an die 250 synthetischen Datensätze.

Fehler „Email address not authorized“ und Rate-Limit-Antworten später sichtbar behandeln;
keine automatischen Wiederholungsschleifen. Bestätigungs-, Wiederholungs- und Reset-Tests
wegen des gemeinsamen Kontingents einzeln planen.

Die spätere Umstellung erfolgt **nur im Supabase-Auth-SMTP-Dashboard**: freigegebener Anbieter,
Absender, SPF/DKIM/DMARC, SMTP-Zugangsdaten ausschließlich dort. Die Anwendung verwendet
weiter dieselben Supabase-Auth-Methoden; sie enthält keinen eigenen Mailer und braucht deshalb
für die SMTP-Umstellung keine Änderung. Kein SMTP-Dienst wurde eingerichtet.
Supabase Auth erfordert keine persönlichen Microsoft-365-Lizenzen; eine tatsächlich erreichbare
Feuerwehr-Mailbox/Weiterleitung bleibt erforderlich. SharePoint-Gastzugriff und Lizenzen separat klären.

## 6. PostgreSQL-Datenmodell und Migrationen

| Migration | Inhalt |
|---|---|
| `20261103000100_foundation.sql` | 15 Tabellen, Enums, FK-/Scope-/Zeit-Constraints, Indizes; RLS sofort an, Client-Grants entzogen. Bricht bei vorhandenen Auth-Benutzern ab: erst Bestandsaufnahme/Backfill-Plan statt Daten überschreiben. |
| `20261103000200_identity_and_rls.sql` | Domain-Hook, Pending-Profil-Trigger, live geprüfte Identität/Rollen, SELECT-Policies und `security_invoker`-Statistikview. |
| `20261103000300_privileged_commands.sql` | Beschränkte Freigabe-/Rollen-/Delegations-/Rückmeldungs-/Anwesenheits-RPCs, geschützter einmaliger Bootstrap, serverseitiges Audit und unveränderbare ursprüngliche Bestätigung. |
| `20261103000400_reference_data.sql` | Nur fünf Einheiten und drei konfigurierbare Sonderfunktionen. Keine Personen, Auth-Konten, Dokumentlinks, Termine oder produktiven Daten. |

Tabellen: `profiles`, `units`, `unit_memberships`, `special_functions`, `function_memberships`,
`role_assignments`, `event_series`, `events`, `event_roster`, `participation_responses`,
`actual_attendance`, `attendance_confirmations`, `event_delegations`, `document_areas`, `audit_entries`.

UUIDs ersetzen lokale Demo-IDs, ohne automatische Zuordnung oder Übernahme von Browserrollen.
Eine aktive Einheit je Person, historische Einheitsmitgliedschaften mit Zeiträumen; beliebig viele
Sonderfunktionen. Teilnehmerkreis mit damaliger Einheit und Namen bleibt pro Instanz gespeichert.
Rückmeldungen sind keine tatsächliche Anwesenheit.

Serien speichern Berliner lokale Startzeit, Zeitzone, Häufigkeit und Anzahl; Instanzen besitzen
eigene UTC-Zeitpunkte, Teilnehmer, Delegationen und Anwesenheiten. Die spätere Serien-RPC muss
DST-/Monatsendregeln wie die bestehende Fachschicht serverseitig durchsetzen, **kein** pauschales
Addieren von UTC-Wochen. Diese Erstellungs-RPC ist noch nicht implementiert.

### RLS-Vorschlag, bereits als SQL vorbereitet

| Rolle | Lesen | Schreiben über RPC |
|---|---|---|
| Ausgeloggt / nicht freigegeben | Keine geschützten Daten; angemeldete Person nur eigenes minimales Profil. | Keine Feuerwehraktionen. |
| `MEMBER` | Sichtbare Termine/Dokumentbereiche, eigene Rückmeldungen/Anwesenheiten und bestätigte Statistik. Andere Teilnehmerdaten nicht pauschal öffentlich. | Eigene Rückmeldung bis zum früheren Zeitpunkt aus Beginn und Anmeldeschluss. |
| `UNIT_ADMIN` | Eigene Einheit, dortige Teilnehmer-/Anwesenheitslisten, Personen und Audit zu diesen Terminen. | Anwesenheit/Bestätigung/Korrektur sowie Delegation im eigenen Terminbereich. Keine Rollen-/organisationsweite Registrierungsfreigabe. |
| `FUNCTION_ADMIN` | Zugeordnete Funktion, einschließlich zugehöriger Teilnehmer anderer Einheiten. | Dieselben Terminaktionen ausschließlich im Funktionsbereich. |
| `FIRE_CHIEF` | Organisationsweite **lesende** Übersicht freigegebener Mitglieder, Termine, Teilnehmer und bestätigter Anwesenheit. | Keine Freigaben, Rollenvergabe oder Anwesenheitsverwaltung allein durch diese Rolle. Konservative Ausgangsentscheidung, vor Produktion fachlich bestätigen. |
| `GLOBAL_ADMIN` | Organisationsweit; zusätzlich Registrierungsprüfung und administratives Audit. | Freigaben, Status und Rollen sowie alle vorbereiteten Termin-RPCs. |
| Termin-Delegation | Teilnehmer/Antworten/Anwesenheit/Audit genau der delegierten Instanz. | Vorbereiten, erfassen, bestätigen, begründet korrigieren; keine Unterdelegation oder globalen Rechte. |

Alle Tabellen-DML bleiben auch für Bereichsadmins gesperrt. Noch nicht vorhandene CRUD-RPCs
(z. B. Termin-/Serienerstellung, Mitgliedschaftswechsel, Funktionseinrichtung und Dokumentverwaltung)
werden **nicht** durch breite INSERT-/UPDATE-Policies ersetzt. Das ist eine fail-closed DEV-Grundlage,
keine bereits vollständig angebundene Mehrbenutzeranwendung.

### Anwesenheit, Nebenläufigkeit und Protokoll

Rückmeldung und Anwesenheitsaktionen sperren die Terminzeile transaktional. Beginn/Frist werden
mit der Datenbank-Wanduhr geprüft. Delegationsänderung und Anwesenheitsaktion nutzen dieselbe
Terminzeilensperre; nach abgeschlossenem Widerruf prüfen weitere Befehle die aktuelle Delegation.
Auch die aktuellen Account-/Rollenzustände werden bei jeder Aktion geprüft; bereits laufende
Transaktionen sind keine nachträglich abbrechbaren Browseraktionen.

Vorbelegung nur einmal für Übungen, `ON CONFLICT DO NOTHING` erhält manuelle Werte einschließlich
„nicht festgestellt“. `origin = prefill` ist bis zur separaten Listenbestätigung vorläufig.
Bestätigung erzeugt fehlende Werte als `unknown`, nie als `absent`. `confirmed_attendance` enthält
ausschließlich bestätigte, begonnene und nicht abgesagte Termine, Berliner Berichtsjahr sowie
Ausbildungsstunden nur für `present`. Für eine Quote zählt später nur die bestätigte Übungsbasis.

Korrekturen bestätigter Listen verlangen einen Grund von 5–2000 Zeichen. Audit und fachliche
Änderung werden atomar geschrieben: IDs, Akteur, Zeitpunkt, Alt-/Neuwert, Grund, damalige Namen
und Termindaten. Die ursprüngliche Bestätigung bleibt als Snapshot erhalten. Member können diesen
vollständigen Snapshot nicht über SELECT lesen. RLS, fehlende Schreibrechte und Trigger verhindern
gewöhnliches Überschreiben des Audits; ein Datenbankowner kann Schutzmechanismen administrativ
ändern. **Keine Behauptung rechtlicher Revisionssicherheit**: unabhängige Aufbewahrung, Export,
Lösch-/Aufbewahrungskonzept und Betriebsprozesse fehlen noch.

### Anwendung erst nach bestätigter Verbindung

Vorher Status, vorhandene Tabellen/Auth-Benutzer, Schema-Exposition und Grants prüfen.
Migrationen reviewen und in Dateireihenfolge anwenden, jeweils mit transaktionalem Fehlerabbruch.
Keine `db reset`-, `DROP`-, `TRUNCATE`- oder automatischen Reparaturbefehle am bestehenden Projekt.
Bei belegten Namen/vorhandenen Auth-Benutzern stoppen und gezielte Folge-/Backfill-Migration planen.
Kein `IF NOT EXISTS` zum stillen Übergehen eines unbekannten Tabellenlayouts.

Dateinamen sind die versionierten Quellen. Bei Anwendung über SQL Editor Ausführung und
Datei-Commit/Prüfsumme im DEV-Änderungsnachweis festhalten. Vor späterem CLI-`db push` muss die
Supabase-Migrationshistorie mit diesen tatsächlich angewandten Versionen kontrolliert abgeglichen
werden; keine blinde Wiederanwendung oder `migration repair` ohne diesen Nachweis.

Die Dateien in `supabase/tests` sind **ausschließlich für die wegwerfbare CI-Datenbank**,
nie für das vorhandene Supabase-Projekt. Sie erzwingen den Test-Datenbanknamen `ff_dev_ci`.

## 7. GitHub Actions / GitHub Pages

Unter Repository **Settings → Secrets and variables → Actions → Variables** nach bestätigter
Projektzuordnung zwei normale Repository-Variablen setzen:

| Repository-Variable | Next.js-Build-Variable | Inhalt |
|---|---|---|
| `SUPABASE_DEV_URL` | `NEXT_PUBLIC_SUPABASE_URL` | Tatsächliche HTTPS-Projekt-URL aus Supabase. |
| `SUPABASE_DEV_PUBLISHABLE_KEY` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Tatsächlicher `sb_publishable_…`-Key; ausdrücklich öffentlich. |

Beide dürfen leer bleiben. `npm run check:supabase-config` unterscheidet „nicht konfiguriert“
von gültiger Konfiguration und schlägt bei Teilkonfiguration, Secret-/JWT-Key oder falscher URL
ohne Ausgabe des Schlüssels fehl. Unterstützt sind zunächst gehostete `*.supabase.co`-Projekt-URLs,
keine Custom Domains oder lokale Supabase-Instanzen.

`src/config/supabase.ts` verwendet die von Next.js benötigten statischen `process.env.NEXT_PUBLIC_…`-
Zugriffe. Nach Variablenänderung ist ein neuer Build erforderlich; ein bereits veröffentlichter
statischer Export bekommt keine Runtime-Environment-Werte.

**Noch kein SDK, keine Netzwerkverbindung und keine Umschaltung des Demo-Providers.**
Vorhandene Variablen sind keine Berechtigung und aktivieren keine echte Anmeldung.
Der zukünftige Adapter darf niemals `demo-provider`-Personen oder Browserrollen als Backend-Identität verwenden.

`pages.yml` behält alle bisherigen Prüfungen und veröffentlicht nur nach erfolgreichem Main-Build.
Der neue Workflow `supabase-dev-check.yml` prüft die Migrationen auf einem temporären PostgreSQL-17-
Service ohne veröffentlichte Datenbankports, echte Supabase-Secrets oder Zugriff auf das DEV-Projekt.
Er simuliert nur die benötigte Auth-Tabellen-/UID-Schnittstelle, **nicht** GoTrue, E-Mail, JWT-Signaturprüfung
oder den echten PostgREST-Gateway. Die bewusst permissiven Alt-Grants im Fixture testen die expliziten Revokes.

Keine lokale npm-/CLI-Installation, keine Codespaces und kein neuer npm-Paketbedarf.
Builds/Browserchecks laufen in GitHub Actions. Es gibt absichtlich **keinen** automatisch auf das
gehostete Projekt angewandten Migrationsworkflow. Für spätere Remote-Automation ein geschütztes
GitHub-Environment `supabase-dev`, verpflichtende Reviewer und minimale Management-/DB-Secrets
vorsehen. Diese gehören niemals in den Pages-Job, Pull-Request-Jobs oder öffentliche Artefakte.

## 8. Testplan und Aussagegrenzen

| Test | Automatisiert in diesem Stand | Noch real zu prüfen |
|---|---|---|
| Konfiguration | Leer/gültig/teilweise; Secret-/JWT-Key und ungültige URL werden abgelehnt. Bestehende Fachtests, Typen, Lint, statischer Build und Browserdemo bleiben erhalten. | Tatsächliche URL-/Key-Zuordnung, keine Secrets in veröffentlichten Dateien. |
| Domain | Hook: exakte Domain/Großschreibung erlaubt, Fremd-/Subdomain/anderer Provider/anonym/fehlende Identität abgelehnt. Insert-Trigger als zweite Schranke. | Hook im realen Auth aktiv; direkter Signup per HTTP mit fremder Domain wird abgelehnt. |
| Registrierung | 250 synthetische Pending-Profile; Metadaten können Freigabe/Rollen nicht vergeben. | Auth-Registrierung mit autorisierter Testadresse, verständliche Rate-Limit-/Empfängerfehler. |
| Verifizierung/Freigabe | Pending nur eigenes Statusprofil; unbestätigt nicht freigebbar; verifiziert + GLOBAL_ADMIN + Einheit erforderlich. | Bestätigungslink gültig/abgelaufen/wiederverwendet; neues Gerät, erneuter Versand. |
| Anmeldung | Aktuelle DB-Identität, Freigabe, Domain und E-Mail an Freigabe gebunden. Sperrung/E-Mailwechsel entziehen geschützte Zugriffe. | E-Mail/Passwort, PKCE-Callback, falsches Passwort, Reset, Abmelden, Refresh/Expiry und widerrufene Sitzung im echten Gateway. |
| RLS/Privilegien | Alle Tabellen RLS, keine Client-DML-/TRUNCATE-Grants, keine anonyme RPC-Ausführung, private Bootstrap-/Auditfunktionen gesperrt, View `security_invoker`. | Wiederholung über REST mit Publishable Key plus echten User-Tokens; exponierte Schemas/GraphQL/Security Advisor. |
| Rollen/Delegation | Eigene/fremde Einheit, Funktion über Einheiten hinweg, Mehrfachfunktionen, FIRE_CHIEF read-only, exakte Instanz/Seriengeschwister, Widerruf mit gleicher Identität. | Zwei echte Browser/Accounts; konkurrierender Widerruf und Anwesenheit, Rollen-/Statusentzug bei offener Ansicht. |
| Anwesenheit | Alle Antwortzuordnungen, manueller Bestand, Idempotenz, unbekannt bleibt unbekannt, Entwurf zählt nicht, bestätigte Stunden/Berliner Jahr, begründete Korrektur und Audit. | Fachlicher Pilot in Scheuren mit synthetischen Testterminen, Reconnect und reale API-Fehler. |
| Historie/Datenschutz | Instanz-Roster und Bestätigungssnapshot bleiben getrennt von aktuellen Zuordnungen; gewöhnliche Mitglieder sehen keine fremden Anwesenheiten. | Spätere Mitgliedschaftswechsel-RPC, Zuständigkeiten/Retention, Auskunft/Löschung, Backups/Wiederherstellung. |

Lokale vorhandene Tools können `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint` und
`npm.cmd run check:supabase-config` ausführen. Die Datenbanktests laufen ausschließlich in Actions;
erfolgreiche PostgreSQL-Tests sind **kein** Nachweis einer geprüften oder geänderten Supabase-Konfiguration.

## 9. Offene Konfiguration und nächste Schritte

1. Autorisierte, projektgebundene Read-only-Verbindung herstellen; offene Ist-Werte aus Abschnitt 1 ersetzen.
2. DEV-Plan, E-Mail-Testempfänger, tatsächliche PostgreSQL-Version und fehlende Einstellungen bestätigen.
3. SQL und Rollenmatrix fachlich reviewen; insbesondere FIRE_CHIEF und zentrale Registrierungsfreigabe.
4. Migrationen kontrolliert im vorhandenen leeren DEV-Projekt anwenden; Hook im Dashboard aktivieren.
5. Ersten verifizierten Administrator durch berechtigten Operator bootstrappen; RLS über echte API testen.
6. Separaten, ausdrücklich aktivierten Supabase-Adapter, statische PKCE-Callback-/Login-/Pending-Seiten und
   echte Session-Verwaltung bauen. Auth-Daten nicht per Service Worker offline zwischenspeichern;
   bestehende Demo niemals als Fallback für eine fehlgeschlagene echte Anmeldung anzeigen.
7. Fehlende CRUD-/Serien-/Mitgliedschafts-RPCs, sichere Statistikauswertung, Negativtests und Mehrbrowser-
   Nebenläufigkeit ergänzen. Domain- und Berechtigungsregeln bleiben serverseitig maßgeblich.
8. Vor echten Mitgliedern eigener SMTP, Datenschutz-/Aufbewahrungskonzept, Recovery/Backups und
   Sicherheitsprüfung. Kein Main-Merge und keine produktive Umschaltung durch diesen Setup-Auftrag.

## Quellen

Offizielle Dokumentation, am 03.11.2026 für die Vorbereitung gelesen; Dashboard-Istwerte bleiben davon getrennt:

- [Supabase MCP und projektgebundener Read-only-Zugriff](https://supabase.com/docs/guides/ai-tools/mcp)
- [Auth Hooks: Rechte und Planverfügbarkeit](https://supabase.com/docs/guides/auth/auth-hooks)
- [Before User Created Hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)
- [Standardversand und eigenes SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Publishable und Secret Keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Redirect-Allowlist](https://supabase.com/docs/guides/auth/redirect-urls)
- [Row Level Security, Grants und Views](https://supabase.com/docs/guides/database/postgres/row-level-security)
