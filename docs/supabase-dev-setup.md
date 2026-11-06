# Supabase DEV – Verbindung, Authentifizierung und Freigabe

Stand: 03.11.2026. Nur das **bereits angelegte DEV-Projekt** verwenden.
Keine produktiven Daten, kein neues Projekt, keine kostenpflichtigen Dienste.

## 1. Bestandsaufnahme und tatsächlich ausgeführte Änderungen

| Prüfpunkt | Ergebnis |
|---|---|
| Ausgangsbasis | Vorbereitung aus PR #3, Commit `c024592c514859b8a010230b9c2e14b5a64d1e51`, auf separatem Branch `feature/supabase-auth-dev` erweitert. PR #3 bei Prüfung offen, grüne Prüfungen; kein automatischer Merge. |
| Migrationen/Fremdschlüssel | Vier transaktionale Grundlagenmigrationen geprüft: 15 Tabellen, UUID-FKs, Bereichs-/Zeit-Constraints, Indizes, historische Mitgliedschaften/Roster, getrennte Antworten/Anwesenheit/Bestätigung. Ergänzung 005 liefert den aktuellen eigenen Zugriffsstatus. |
| RLS und Grants | Alle Anwendungstabellen mit RLS, kein anonymer Datenzugriff, kein direktes Client-DML/TRUNCATE/TRIGGER. Schreiben nur über eingeschränkte RPCs. `confirmed_attendance` verwendet `security_invoker`. Kein Ersatz durch breite Schreib-Policies. |
| Serverfunktionen | `SECURITY DEFINER` mit leerem `search_path`, explizit entzogenen PUBLIC-Rechten, aktuellen DB-Rollen statt User-Metadaten. Freigabe verlangt verifizierte Feuerwehr-E-Mail plus Einheit. Bootstrap nicht vom Browser aufrufbar. |
| Autorisierte Supabase-Verbindung | Am 03.11.2026 über das projektgebundene Supabase-MCP bestätigt: `orxinqhhbtjpkzwlfaxq`, URL `https://orxinqhhbtjpkzwlfaxq.supabase.co`. |
| Projektstatus/Datenbank/Auth/API | MCP meldet `ACTIVE_HEALTHY`, PostgreSQL **17.11**. Vor Anwendung keine App-Tabellen, Migrationen oder Auth-Benutzer. Öffentliche Auth-Settings bestätigen E-Mail-Anmeldung, erlaubte Registrierung und verpflichtende Verifizierung; Anonymous/Telefon/OAuth aus. Ausführung des aktivierten Domain-Hooks durch die echte Auth-API am 03.11.2026 nachgewiesen, siehe Abnahme unten. Redirects, SMTP-/Team-Empfänger und weitere Auth-Sicherheitswerte bleiben unabhängig im Dashboard zu prüfen. |
| GitHub-Konfiguration | `SUPABASE_DEV_URL` und `SUPABASE_DEV_PUBLISHABLE_KEY` sind vorhanden; beide Werte wurden mit der bestätigten Projekt-URL und dem aktiven modernen Publishable Key desselben Projekts verglichen und stimmen überein. Keine Schlüsselwerte im Bericht, keine Secrets geändert. |
| In diesem Auftrag geändert | Nur dieses Repository/Feature-Branch: SDK, statischer PKCE-Callback, Login/Signup/Pending/Freigabe, RLS-Leseadapter, Migration 005, Preflight, Tests, Actions und Dokumentation. |
| Im Supabase-Projekt geändert | Fehlende Migrationen **001–005** unverändert angewendet und nachgeprüft, einschließlich fünf Einheiten/drei Sonderfunktionen. Später zwei echte Testregistrierungen durch den Benutzer, ausdrücklich autorisierter erster GLOBAL_ADMIN-Bootstrap über MCP und zweite MEMBER-Freigabe durch den Benutzer über die DEV-Administration. Keine Planänderungen, simulierte Mailverifizierung oder destruktive Bereinigung. |
| Unabhängige Demo | `n00b31/feuerwehr-odenthal-demo` bleibt unverändert. Kein Codeimport, Build-Download, Datenzugriff oder Deployment aus diesem Repository dorthin. |

Die Auth-DEV-Oberfläche wurde nach dem bewussten Benutzermerge von PR #4 veröffentlicht.
Ein Feature-Branch/PR allein löst weder Pages-Veröffentlichung noch Datenbankänderungen aus.
Die unten protokollierte manuelle MCP-Anwendung wurde separat ausdrücklich freigegeben.

### Aktivierungsnachweis vom 03.11.2026

Auf ausdrücklichen Einrichtungsauftrag wurden die geprüften Migrationen aus Commit
`1b473f0b3531a8d32a4b4ab703d5f076fcebc02f` über MCP einzeln angewendet.
Keine bestehende Migration musste wiederholt werden. Die von MCP vergebenen Historienversionen
unterscheiden sich von den Dateipräfixen:

| Quelldatei | Remote-Version / Name | SQL-SHA256 |
|---|---|---|
| `20261103000100_foundation.sql` | `20261103132058` / `ff_001_foundation` | `f4fcbc2527be0b206ba56c1045df68841a4e4fbeb30ba88d65169f0e71633c23` |
| `20261103000200_identity_and_rls.sql` | `20261103132117` / `ff_002_identity_and_rls` | `fcd715cf8d4f3eea212b907545e214c5b7ce64689f3813641d069cc431e5d64e` |
| `20261103000300_privileged_commands.sql` | `20261103132146` / `ff_003_privileged_commands` | `c713f78075a98060d72ee2a36fed3f01c9b9331405d8f9183841116c5f144dab` |
| `20261103000400_reference_data.sql` | `20261103132152` / `ff_004_reference_data` | `dd7e6bd929c91267e29b068292d1ffc1ccd4cd860c549ea4a88ab250832b5dc9` |
| `20261103000500_client_access_status.sql` | `20261103132159` / `ff_005_client_access_status` | `15f1992e5379bfbb4ae37c1cf543af281f27c6f853ff1eb15f70a30c8a2e30f7` |

Prüfsummen wurden über UTF-8-SQL nach CRLF→LF und Entfernen abschließender Whitespace-Zeichen
gebildet; alle fünf gespeicherten SQL-Inhalte stimmen so mit den lokalen Quelldateien überein.
Vor einem späteren CLI-`db push` diese Zuordnung kontrolliert berücksichtigen: **kein blindes
Wiederanwenden, Umbenennen bereits versionierter Dateien oder automatisches `migration repair`.**

Remote bestätigt: 15 Tabellen mit jeweils SELECT-RLS-Policy, 33 Fremdschlüssel, 31 gültige Indizes,
keine unvalidierten Constraints, kein anonymer Tabellenzugriff und keine direkten Client-Schreibrechte.
`confirmed_attendance` ist `security_invoker`; alle App-Definer-Funktionen haben einen leeren
`search_path`. Auth-Insert/Pending-Trigger und unveränderbare Audit-/Bestätigungs-Trigger existieren.
Bootstrap und Audit-Schreibhelper sind nicht durch Browserrollen aufrufbar. Der Auth-Service besitzt
das Ausführungsrecht auf den Domain-Hook. Dieser Grant allein war beim Migrationslauf noch kein
Aktivierungsnachweis; der nachfolgende Auth-API-Test hat die Ausführung inzwischen bestätigt.

Remote ausgeführt: sieben reine Domain-/Provider-Hook-Fälle als Operator, anonyme
Tabellen-/RPC-Sperren, alle fünf Rollenprädikate für eine nicht identifizierte Sitzung,
RLS-Lesezugriffe ohne Freischaltung sowie 14 abgewiesene privilegierte/Spaltenoperationen.
Die Prüftransaktion wurde zurückgerollt; keine Auth-Benutzer oder Fach-Testdaten angelegt.
Ein Versuch, `supabase_auth_admin` zu übernehmen, wurde vom gehosteten Betreiberrollenmodell
verweigert; der Hook wurde stattdessen als Operator geprüft und sein Auth-EXECUTE-Grant separat
bestätigt. Event-RPCs verwenden `SELECT FOR UPDATE`, weshalb die reine Lese-Transaktion hierfür
nicht genügte; diese negativen Aufrufe liefen ohne Datenänderungen in der zurückgerollten Transaktion.

Die erfolgreichen [PostgreSQL-17-Rollentests derselben Migrationen](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/41637953750)
decken aktive MEMBER/UNIT_ADMIN/FUNCTION_ADMIN/FIRE_CHIEF/GLOBAL_ADMIN, fremde Bereiche,
Delegation nur dieser Termininstanz, Widerruf, Verifizierung und Freigabe ab.
**Das ersetzt keinen Rollen-/JWT-/PostgREST-Test mit real verifizierten Testkonten im DEV-Projekt.**
Die CI-Fixture wurde nicht im gehosteten Projekt ausgeführt.

Der Security Advisor meldet zehn Warnungen
[`authenticated_security_definer_function_executable`](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
für die absichtlich freigegebenen, intern berechtigungsgeprüften RPCs. Das ist eine zu
reviewende Vertrauensgrenze, kein Anlass, deren Prüfungen oder RLS abzuschalten.
In diesem Lauf wurden keine weiteren Security-Advisor-Meldungen zurückgegeben; das ist kein
Nachweis einer vollständig sicheren Auth-/Betriebskonfiguration.

### Erfolgreiche negative Auth-API-Abnahme am 03.11.2026

Nach bestätigter Dashboard-Aktivierung durch den Benutzer wurden **genau zwei** Requests an
`POST https://orxinqhhbtjpkzwlfaxq.supabase.co/auth/v1/signup` gesendet. Verwendet wurden der
aktive Publishable Key und je ein zufälliges, nicht ausgegebenes oder gespeichertes Testpasswort.
Beide Adressen liegen unter der reservierten Beispieldomain `example.com`:

| Fall | Synthetische Adresse | UTC / Supabase Request-ID | Ergebnis |
|---|---|---|---|
| Fremddomain | `auth-hook-negative-20261103@outside.example.com` | `14:39:37.534Z` / `01a1a1d9-f123-7346-9303-c3d066581d7f` | HTTP **403**, konkrete Hook-Meldung |
| Ähnlich benannte Domain | `auth-hook-negative-20261103@feuerwehr-odenthal.de.example.com` | `14:39:37.816Z` / `01a1a1d9-f30f-7472-a138-748d3852765c` | HTTP **403**, konkrete Hook-Meldung |

Die Meldung lautete in beiden Antworten exakt:
`Registrierung nur mit Feuerwehr-E-Mail und E-Mail-Anmeldung erlaubt.`
Das API-Feld `code` war jeweils `unknown`; es wurde ausdrücklich nicht als Beweis verwendet.
HTTP-Status und funktionsspezifische Meldung stimmen mit dem installierten Hook überein und
unterscheiden sich von `Feuerwehr email required` des separaten DB-Triggers sowie von einem
generischen Datenbank-, Mail- oder Rate-Limit-Fehler. Damit ist der negative Pfad
**Auth-API → konfigurierter Domain-Hook → Ablehnung** nachgewiesen.

MCP-Snapshots vor (`14:38:57.101972Z`) und nach (`14:39:44.542902Z`) den Requests:
`auth.users`, `auth.identities` und `public.profiles` jeweils **0 → 0**. Die deterministischen
SHA256-Gesamtprüfsummen aller Zeilen dieser Tabellen sind vor/nach identisch. Zusätzlich wurden
die beiden Testadressen und sämtliche Konten außerhalb der erlaubten Domain abgefragt: jeweils
**0** Treffer. Es gab bereits vorher keine Benutzerkonten; daher wurden weder neue unerlaubte
Konten angelegt noch vorhandene Konten verändert. Keine Bereinigung/Löschung ausgeführt.

Keine positive Registrierung, keine Bestätigungs-/Resend-Anfrage und keine Mail versandt;
der Hook bricht vor Kontoanlage und Mailversand ab. Kein HTTP 429, kein Retry und kein
wiederholtes Ausreizen des Limits. Diese negative Abnahme bestätigt **nicht** die positive
Mailzustellung, den PKCE-Rückweg oder die Administratorfreigabe eines echten Testkontos.

### Weitere Aktivierungsgrenzen

Nachmeldung des Benutzers vom 03.11.2026: E-Mail/Registrierung, Site URL, Redirect URL und die
beiden GitHub-Variablen sind eingerichtet; Before User Created wurde anschließend aktiviert.
Die Hook-Ausführung und beide Variablenwerte wurden unabhängig bestätigt. Die folgenden Dashboard-Prüflücken beziehen
sich auf die unabhängige Prüfung durch den Agenten, nicht auf eine Behauptung, dass der Benutzer
diese Einstellungen noch nicht gesetzt hätte.

- MCP bietet keine Auth-Konfigurations- oder Organisationsteam-Management-Funktion. Der zusätzlich
  geöffnete Dashboard-Browser wurde zur Anmeldung umgeleitet. Daher Site URL, Redirect-Allowlist,
  Mailvorlagen, Passwort-/Sessionregeln, SMTP-Modus und autorisierte Empfänger
  **nicht gelesen oder geändert**; siehe Abschnitt 4.
- Ein aktiver moderner Publishable Key wurde bestätigt und nicht in Git eingetragen.
  Die beiden vom Benutzer angelegten GitHub-Variablen stimmen mit dem vorhandenen Projekt und
  seinem aktiven Publishable Key überein. Mit dem öffentlichen Projekt-Key liefern anonyme REST-Zugriffe auf `units` und
  `ff_my_access()` jeweils **HTTP 401**. `Accept-Profile: ff_private` liefert **HTTP 406 / PGRST106**;
  die API nennt ausschließlich `public` und `graphql_public` als exponierte Schemas.
  `ff_private` ist somit nicht exponiert; ob die zusätzliche GraphQL-Fläche benötigt wird,
  bleibt im Dashboard zu entscheiden.
- Vor der positiven Abnahme gab es **0 Auth-Benutzer, 0 Profile und 0 globale Administratoren**. Keinen Admin aus
  einer geratenen Adresse erzeugen und keine Verifizierung simulieren. Zuerst eine tatsächlich
  autorisierte Feuerwehr-Testadresse registrieren und verifizieren; erst dann die geprüfte UUID
  und fachlich bestätigte Einheit für den Operator-Bootstrap aus Abschnitt 5 verwenden.
- Die implementierte Callback-Route ist exakt
  `https://n00b31.github.io/feuerwehr-odenthal-app/auth/callback/`.
  Vor Veröffentlichung von PR #4 lieferte sie **HTTP 404**. Nach dem Benutzermerge und
  erfolgreichem Main-Deployment liefert sie **HTTP 200**, ebenso alle elf eingebundenen
  JS-/CSS-Dateien. Der positive E-Mail-Ablauf wurde erst danach gestartet. Kein Ersatz-Callback.
- Während Migration und Hook-Abnahme wurden weder Main noch die unabhängige Demo durch den
  Agenten geändert. Anschließend hat der Benutzer PR #3 und PR #4 selbst gemergt; Main steht auf
  `eab9a90d6ccfa63bf023ab7ee42df064a70cb2cb`. Die unabhängige Demo bleibt auf
  `4f6ffab14ddfba290248e3d6151c67f683a163e3`.

## 2. Bestehendes Projekt autorisiert prüfen

1. Supabase-Dashboard öffnen, das **vorhandene** DEV-Projekt auswählen. Project Ref, Organisation,
   Region, Status und Plan festhalten; kein „New project“ und kein Upgrade.
2. Optional projektgebundenes OAuth-MCP verwenden: `.mcp.json.example` ist inaktiv. Die URL
   `https://mcp.supabase.com/mcp?read_only=true&project_ref=…` ausschließlich mit dem tatsächlichen
   Ref ergänzen und als git-ignorierte `.mcp.json` lokal speichern.
3. In der Copilot-App **Settings → Projekt → Repository customizations → MCP servers → supabase → Sign in**,
   falls der Server und diese Aktion angeboten werden. Mit dem berechtigten Supabase-Konto anmelden.
   Wenn nicht verfügbar, den manuellen Dashboard-Weg verwenden. Keine Zugangsdaten im Chat übermitteln.
4. Projektidentität und PostgreSQL-Version zuerst prüfen. Im SQL Editor den vollständigen Inhalt von
   `supabase/preflight.sql` ausführen. Er verwendet eine **Read-only-Transaktion** und listet
   Auth-Benutzeranzahl, Tabellen/Spalten, Constraints/FKs, RLS/Policies, Grants und Serverfunktionen auf.
   Keine Ergebnisse mit personenbezogenen Inhalten öffentlich an einen PR hängen.
5. Zusätzlich Dashboard-Einstellungen gemäß Abschnitt 4 prüfen: diese werden durch SQL/MCP nicht
   notwendigerweise vollständig sichtbar. Ein Public Key bestätigt keine Management-Autorisierung.

## 3. Migrationen kontrolliert anwenden

| Datei in `supabase/migrations` | Zweck |
|---|---|
| `20261103000100_foundation.sql` | Schema `ff_private`, Enums, 15 Tabellen/FKs/Constraints, RLS sofort an, Client-Schreibrechte entzogen. Bricht bei vorhandenen Auth-Benutzern ab. |
| `20261103000200_identity_and_rls.sql` | Domain-Hook, Pending-Profil-Trigger, live geprüfte Identität/Rollen, SELECT-Policies und bestätigte Statistikview. |
| `20261103000300_privileged_commands.sql` | Freigabe, Rollen/Status, Delegation, Antworten, Anwesenheit/Bestätigung/Korrektur, atomarer Audit und einmaliger Operator-Bootstrap. |
| `20261103000400_reference_data.sql` | Fünf konfigurierbare Einheiten, Pilot Scheuren, drei Sonderfunktionen; keine Personen, Auth-Konten oder Termine. |
| `20261103000500_client_access_status.sql` | `ff_my_access()`: eigene Identität, wirksamer Zugriffsstatus und nur bei Freigabe Einheit/Rollen. Dieselbe aktuelle DB-Regel wie RLS, nicht nur `profiles.status`. |

**Beim dokumentierten Projekt sind 001–005 bereits angewendet; nicht erneut ausführen.**
Die folgenden allgemeinen Hinweise gelten für einen nachweislich noch nicht migrierten Zustand.

**Bei tatsächlich leerem Projekt:** Preflight reviewen, dann Dateien 001–005 einzeln, vollständig und
in Reihenfolge im Dashboard-SQL-Editor ausführen. Jede Datei besitzt `BEGIN`/`COMMIT`; bei Fehler
abbrechen, Ursache prüfen, keine Folgedateien blind ausführen.

**Bei bereits angewandter Vorbereitung:** Ausführungsnachweis und Tabellen/Policies/Funktionen
mit 001–004 abgleichen und nur die nachweislich fehlende Migration 005 anwenden.
Bei unbekannten Namenskollisionen, vorhandenen Benutzern oder abweichendem Layout stoppen:
gezielte Folge-/Backfill-Migration planen, niemals vorhandene Daten überschreiben.

Datum, tatsächlichen Project Ref, Dateinamen, Git-Commit und Dateiprüfsummen im privaten
DEV-Änderungsnachweis festhalten. Falls SQL Editor statt CLI verwendet wird, vor einem späteren
`supabase db push` die tatsächliche Migrationshistorie kontrolliert abgleichen.
Keine blinde Wiederanwendung oder `migration repair`.

**Verboten am vorhandenen Projekt:** `db reset`, `DROP`, `TRUNCATE`, Auth-Fixture oder Testdatensuite.
`supabase/tests/*.sql` ist ausschließlich für die wegwerfbare CI-Datenbank **`ff_dev_ci`** vorgesehen.
Keine Remote-Migration aus Pull Requests oder Pages-Workflows.

Nach Anwendung: alle 15 Tabellen auf RLS prüfen, FK-/Spaltenlayout und Grants erneut inventarisieren,
`ff_private` darf nicht als Data-API-Schema exponiert sein. Security Advisor prüfen.

## 4. Manuelle Supabase-Dashboard-Einstellungen

Die Tabelle enthält **erforderliche Sollwerte**. Remote bestätigte Teilwerte und verbleibende
Prüflücken stehen in Abschnitt 1. Der Hook ist über negative Auth-API-Tests bestätigt;
die Dashboard-URL-Werte sind vom Benutzer eingerichtet, aber noch nicht unabhängig ausgelesen.

| Bereich | Einstellung / Prüfung |
|---|---|
| Projekt | Bestehendes DEV-Projekt aktiv; PostgreSQL mindestens 15 (`security_invoker`), CI verwendet 17. Free-Plan/Pausierung prüfen, nichts kostenpflichtig aktivieren. |
| Auth → Providers | E-Mail/Passwort aktiv, Registrierung für die Testphase zulassen. Anonymous, Telefon und nicht benötigte OAuth-Provider aus. |
| E-Mail-Verifizierung | **Confirm email an**, keine automatische Verifizierung; Secure email change an. Passwortminimum mindestens 12 Zeichen passend zum Registrierungsformular. Verfügbare weitere Schutzoptionen ohne kostenpflichtige Aktivierung prüfen. |
| Auth → Hooks | Before User Created auf `ff_private.before_user_created`, URI `pg-functions://postgres/ff_private/before_user_created`. Nur exakte Domain `feuerwehr-odenthal.de`, case-insensitiv, Provider `email`. Die Auth-Insert-Schranke blockiert fremde Domains zusätzlich, ersetzt aber nicht die Hook-Konfiguration. |
| Auth → URL Configuration → Site URL | Exakt `https://n00b31.github.io/feuerwehr-odenthal-app/` |
| Redirect URLs | Exakt `https://n00b31.github.io/feuerwehr-odenthal-app/auth/callback/`. Keine Wildcard für `github.io` und keine Demo-URL freischalten. Lokale URLs nur bei tatsächlichem Testbedarf ausdrücklich ergänzen. |
| E-Mail-Vorlage „Confirm signup“ | Standardlink mit `{{ .ConfirmationURL }}` beibehalten. Nicht den serverseitigen Next.js-SSR-Beispielendpoint `/auth/confirm` übernehmen: Pages hat keinen solchen Server. Der SDK-Redirect führt zum implementierten statischen Callback. |
| SMTP | Zunächst integrierter DEV-Versand; berechtigte Testempfänger und aktuelle Limits im Dashboard prüfen. Keine echten Mitgliedereinladungen. |
| Data API | Nur bewusst benötigte Schemas exponieren, für diesen Adapter `public`. `ff_private`, `auth` und technische Schemas nicht exponieren. Nicht benötigte GraphQL-/Realtime-Flächen prüfen, nicht automatisch aktivieren. |
| Schlüssel | Bestehende Project URL und **Publishable Key** (`sb_publishable_…`) verwenden. Kein Secret-/`service_role`-/Management-Key, DB-Passwort oder alter JWT-Key im Browser. Keine Schlüsselrotation ohne Anlass. |
| Sicherheit | RLS, Funktions-/Tabellengrants, OTP-/Token-/Sessionlaufzeiten, Rate Limits und Security Advisor prüfen. Admin-MFA, Recovery/Backups und eigenes SMTP vor echter Nutzung ergänzen. |

### Before User Created exakt aktivieren

Im vorhandenen Projekt unter
[Authentication → Hooks](https://supabase.com/dashboard/project/orxinqhhbtjpkzwlfaxq/auth/hooks)
den Hook **Before User Created** hinzufügen bzw. bearbeiten:

1. Als Implementierung **Postgres Function**, nicht HTTP/Edge Function, auswählen.
2. Schema **`ff_private`**, Funktion **`before_user_created`** auswählen.
   Die vorhandene Signatur lautet `ff_private.before_user_created(event jsonb) returns jsonb`.
3. Speichern und prüfen, dass der Hook als aktiviert angezeigt wird.
   Die resultierende URI lautet `pg-functions://postgres/ff_private/before_user_created`.
   Kein HTTP-Secret, keine neue Funktion und keine Data-API-Exposition von `ff_private` nötig.

Migration 002, Zeilen 95–123, enthält Funktion und Rechte. Am bestehenden Projekt erneut bestätigt:
`supabase_auth_admin` besitzt `USAGE` auf `ff_private` und `EXECUTE` auf genau
`ff_private.before_user_created(jsonb)`. `PUBLIC`, `anon` und `authenticated` haben kein
EXECUTE-Recht auf diesen Hook. Die Funktion ist absichtlich **SECURITY INVOKER**, liest keine
Tabellen und benötigt deshalb weder zusätzliche Tabellenrechte noch neue RLS-Policies.
Keine pauschalen Rechte auf alle privaten Funktionen vergeben; die vorhandenen Grants müssen
nicht erneut ausgeführt werden.

Erneute Live-SQL-Prüfung: **8/8** Fälle bestanden (exakte Domain/Großschreibung erlaubt;
Fremddomain, ähnlich benannte Domain, Subdomain, anonyme Identität, anderer Provider und fehlende
Identität abgewiesen). Zusätzlich wurden drei tatsächlich versuchte `auth.users`-Inserts mit
verbotenen Domains durch den bereits aktiven Pending-Profil-Trigger mit SQLSTATE `42501` und
`Feuerwehr email required` abgewiesen. Die Transaktion wurde zurückgerollt; keine Konten
angelegt oder E-Mails versandt. Damit ist die serverseitige DB-Schranke nachgewiesen.

**Abnahmegrenze:** Ein direkter Funktionsaufruf oder der separate Insert-Trigger allein beweist
nicht, dass GoTrue den Dashboard-Hook aufruft. Inzwischen ist dieser negative Pfad durch
die zwei tatsächlichen Auth-API-Requests aus Abschnitt 1 nachgewiesen. Allgemeines Prüfkriterium:
Eine abgewiesene Registrierung über die Auth-API muss mit dem Hook-Fehler
`Registrierung nur mit Feuerwehr-E-Mail und E-Mail-Anmeldung erlaubt.` und ohne neuen
Auth-Benutzer geprüft werden. Ein generischer Datenbankfehler, Mail-Empfängerfehler oder
Rate-Limit genügt dafür nicht. Einen positiven Registrierungstest ausschließlich mit einer
autorisierten Feuerwehr-Testadresse durchführen; keine E-Mail-Verifizierung simulieren.
Der Domain-Hook-Prüfblocker ist damit behoben. Das ist keine Merge-/Deployment-Freigabe;
es wurde nichts automatisch gemergt oder veröffentlicht.

### Integrierter E-Mail-Versand

Standard-Supabase-Mail ist keine produktive Versandlösung. Laut Supabase-Dokumentation werden
ohne eigenes SMTP nur Adressen aus dem Supabase-Organisationsteam angeschrieben; das dokumentierte
Standardlimit wurde zuvor mit **2 Nachrichten/Stunde** dokumentiert und kann sich ändern.
Die am 03.11.2026 erneut gelesene Supabase-Dokumentation bestätigt autorisierte Teamadressen und
sehr niedrige variable Limits, liefert den Zahlenwert jedoch als dynamischen Platzhalter.
Die tatsächlichen Limits und autorisierten Empfänger des bestehenden Projekts wurden nicht geprüft;
ohne diese Bestätigung keine Testmails versenden.

Benötigt werden zwei ausdrücklich autorisierte DEV-Testadressen (erster Administrator und Mitglied),
die gleichzeitig unter `@feuerwehr-odenthal.de` erreichbar sind. Keine beliebigen synthetischen
250 Adressen anschreiben. Normalen Mitgliedern nicht nur für Testmails Supabase-Control-Plane-Rechte
geben. Gibt es keine geeigneten Testempfänger, bleibt der reale Mailtest blockiert; Domainprüfung
und Confirm email nicht abschalten.

Die Oberfläche zeigt Empfänger-/Rate-Limit-/Verifizierungsfehler und sendet nicht automatisch erneut.
„Bestätigung erneut senden“ ist eine bewusste Benutzeraktion. Bei verzögerten Mails zuerst prüfen,
statt mehrfach zu klicken.

Später SMTP ausschließlich im Supabase-Dashboard umstellen: Anbieter/Absender, SPF/DKIM/DMARC und
SMTP-Zugangsdaten dort konfigurieren. Die App verwendet weiterhin dieselben Auth-Methoden und
benötigt für den Transportwechsel keine Codeänderung. Keine persönlichen M365-Lizenzen nötig;
eine funktionierende Mailbox/Weiterleitung bleibt Voraussetzung. SharePoint-Gastzugriff separat klären.

## 5. Authentifizierung, Freigabe und erster Administrator

1. Testkonto mit Anzeigename, Feuerwehr-E-Mail und Passwort registrieren.
   Die App übermittelt nur `display_name` als User-Metadatum, keine Rolle/Freigabe/Einheit.
2. Der serverseitige Hook prüft Domain/Provider. Auth-Insert erzeugt das Profil immer als `pending`.
3. Bestätigungsmail **im selben Browser** öffnen, in dem registriert wurde. Der SDK verwendet
   PKCE mit lokal gespeichertem Verifier. Der statische `/auth/callback/` tauscht den Code beim
   Supabase-Auth-Server, entfernt Query/Fragment und wertet kein fremdes `next`-Ziel aus.
4. Danach erscheint **„Wartet auf Freigabe“**. Es werden nur Auth-Identität und `ff_my_access()`
   abgefragt; keine Termine, Dokumente, Einheitenlisten, Rollenlisten oder Statistiken geladen.
5. Global-Administrator wählt unter Administration für die verifizierte Registrierung bewusst
   eine Einheit. `ff_approve_member(target_user, target_unit)` prüft alles erneut, vergibt `MEMBER`
   und protokolliert die Freigabe atomar. Unbestätigte Registrierung ist nicht freigebbar.
6. Mitglied meldet sich erneut an oder prüft den Freigabestatus. Erst jetzt werden RLS-geschützte
   DEV-Daten geladen. Eine leere Datenbank bleibt sichtbar leer, ohne Demo-Fallback.

Die Browseroberfläche ist keine Sicherheitsgrenze. RLS/RPCs prüfen den aktuellen Account,
Verifizierung, Domain, zur Freigabe gehörende E-Mail, aktuelle Einheitszuordnung, Rollen und
terminbezogene Delegationen unabhängig von der Oberfläche. Alte JWT-Rollen/User-Metadaten
erteilen keine Rechte. Sperrung, E-Mail-Wechsel oder entfallene Einheit entziehen den Zugriff.

### Einmaliger Bootstrap

Der erste Administrator registriert und verifiziert sein Testkonto zunächst selbst und wartet ebenfalls.
Ein berechtigter **Datenbankoperator** prüft im Dashboard Auth-UUID, verifizierte Adresse und
gewünschte Einheit. Dann im SQL Editor (Platzhalter durch die geprüfte UUID ersetzen):

```sql
select ff_private.bootstrap_global_admin(
  'REPLACE_WITH_VERIFIED_AUTH_UUID'::uuid,
  (select id from public.units where code = 'scheuren')
);
```

Diese Funktion ist für Browserrollen nicht ausführbar und verweigert Wiederholung, sobald jemals
eine globale Rolle angelegt wurde. Keine automatische Demo-Admin-Übernahme.
Rollen-/Status-RPCs schützen den letzten aktiven Global-Admin; ein gelöschter/extern gesperrter
letzter Administrator benötigt einen dokumentierten Operator-Recovery-Prozess.

### Sitzungen und Grenzen

Offizielles `@supabase/supabase-js` verwaltet Passwortlogin, PKCE, Refresh und lokalen Logout.
`getUser()` prüft die gespeicherte Identität beim Auth-Server; anschließend entscheidet
`ff_my_access()` mit derselben live geprüften DB-Bedingung wie RLS.

Der SDK-Speicherschlüssel ist nach **Projekt und App-Unterpfad** getrennt. Keine lokale Demo-Person
oder Browserrolle wird ins Backend übernommen. Auth-/Datenfehler schließen den Bereich.
Bei Fokus, Sichtbarkeit, Online/Offline, Auth-Ereignis, manueller Aktualisierung und alle 60 Sekunden
wird der Status erneut geprüft; angezeigte Daten werden währenddessen entfernt.
Bereits an einen berechtigten Browser gelieferte Daten lassen sich nicht rückwirkend „zurückholen“.
RLS prüft jeden neuen Request unabhängig von diesen UI-Aktualisierungen.

Die Sitzung liegt im Browser-LocalStorage, nicht in HttpOnly-Cookies: Pages ist eine öffentliche
statische Client-App. XSS-/Endgeräteschutz und vorsichtige Drittanbieter-Skripte bleiben wichtig.
„Abmelden / Sitzung entfernen“ entfernt diese Browser-Sitzung, nicht alle anderen Geräte und
nicht rückwirkend jeden schon ausgestellten Access Token. Keine Tokens/Passwörter in Logs,
PR-Kommentaren, Artefakten oder Screenshots echter Accounts speichern.
Der Service Worker cached keine Supabase-Requests oder geschützten Ansichten; DEV verspricht keinen
Offline-Zugriff. Code/HTML statischer Seiten ist öffentlich, geschützte Inhalte kommen erst über RLS.

Fremder Browser, abgelaufener/verwendeter Code oder fehlender Verifier erzeugt eine sichtbare
Fehlermeldung. Nach erfolgreicher E-Mail-Verifizierung erneut anmelden; sonst eine neue Bestätigung
anfordern. Passwort-Reset, E-Mail-Wechsel-UI und MFA sind in dieser Integrationsstufe noch nicht enthalten.

## 6. Rollen und angebundener Funktionsumfang

| Rolle/Berechtigung | Serverseitiger Umfang |
|---|---|
| Nicht freigegeben | Nur eigener minimaler Status, keine Feuerwehrinhalte. |
| MEMBER | Sichtbare Termine/Dokumentbereiche und eigene bestätigte Anwesenheiten; Rückmeldungs-RPC bis Beginn/Frist. |
| UNIT_ADMIN | Eigene Einheit; vorbereitete Termin-/Anwesenheits-/Delegations-RPCs, keine globale Registrierungsfreigabe. |
| FUNCTION_ADMIN | Zugeordnete Funktion, auch Mitglieder anderer Einheiten; keine pauschalen Einheitsrechte. |
| FIRE_CHIEF | Organisationsweit **lesend**, keine allgemeinen Schreib-/Freigaberechte. Vor produktivem Betrieb fachlich bestätigen. |
| GLOBAL_ADMIN | Registrierungen prüfen/freigeben, Rollen-/Status-RPCs und alle vorbereiteten Bereichsaktionen. |
| Termin-Delegation | Teilnehmer/Anwesenheit genau dieser Instanz, keine globalen Rollen oder Unterdelegation. Widerruf wird serverseitig live geprüft. |

**Stand DEV 0.2 (DEV 0.3 siehe Abschnitt 11):** Auth, Pending-/Sperrstatus, Global-Admin-Freigabe mit Einheit,
sichtbare Termine, Dokumentbereiche, eigene bestätigte Teilnahmen/Stunden und Profil.
Anwesenheit zählt nur mit Listenbestätigung; unbekannt ist nicht abwesend.

**In DEV 0.2 noch nicht im DEV-UI angebunden:** vollständige Termin-/Serienverwaltung, Rückmeldungsschaltflächen,
Anwesenheits-/Delegationsbearbeitung, Rollen-/Mitgliedschafts-/Dokument-CRUD und komplette Statistikexports.
Teilweise existieren dafür bereits geprüfte RPCs, für CRUD/Serien fehlen noch Serverkommandos.
Keine breiten DML-Grants oder lokale Demo-Schreiboperationen als Ersatz verwenden.
Die vollständigen bisherigen Demo-Funktionen bleiben im eigenständigen Demo-Repository erhalten;
dieses Repository kann sie für Regressionen ausdrücklich im Modus `demo` prüfen.

## 7. GitHub Actions / statisches GitHub Pages

Im **ursprünglichen** Repository Settings → Secrets and variables → Actions → **Variables** setzen,
erst nachdem das vorhandene Projekt eindeutig geprüft wurde:

| Variable | Wert |
|---|---|
| `SUPABASE_DEV_URL` | Tatsächliche HTTPS-Projekt-URL aus Supabase. |
| `SUPABASE_DEV_PUBLISHABLE_KEY` | Tatsächlicher öffentlicher `sb_publishable_…`-Key desselben Projekts. |

Keine Werte in Git eintragen und keine geheimen Schlüssel an den Build geben. Beide Variablen
leer: DEV zeigt ausschließlich einen gesperrten Einrichtungshinweis. Nur eine Variable oder
Secret-/JWT-Key/falsche URL: Build scheitert ausdrücklich.
`NEXT_PUBLIC_APP_MODE` ist standardmäßig `supabase-dev`; `demo` ist ein expliziter lokaler/CI-Modus,
kein Login-Fallback und keine veröffentlichte DEV-Ausweichlösung.

`pages.yml` führt getrennt aus:

1. Demo-Regression mit 250 fiktiven Personen, Fachtests, TypeScript, ESLint, Icons und bestehenden Browsertests.
2. Separater DEV-Testbuild mit **erkennbar synthetischen** Konfigurationswerten und vollständig
   abgefangenen Auth-/REST-Endpunkten. Keine Mail, kein Zugriff auf ein Supabase-Projekt.
   Dieses Testbuild wird niemals als Pages-Artefakt hochgeladen.
3. Frischer DEV-Export mit den tatsächlichen öffentlichen Repository-Variablen oder gesperrter
   Einrichtung ohne Konfiguration. Prüfung gegen synthetische Test-Keys/Endpunkte und Secret-Key-Präfix.
   Bei leerer Konfiguration zusätzlicher HTTP-/Browsercheck mehrerer statischer Routen.
4. Nur erfolgreicher **Main**-Lauf veröffentlicht diesen letzten DEV-Export. PRs/manuelle
   Feature-Branch-Läufe liefern Vorschauartefakte, kein Deployment.

`supabase-dev-check.yml` wendet alle Migrationen in einer wegwerfbaren PostgreSQL-17-Datenbank an
und prüft RLS/RPCs/Freigabe/Delegation/Anwesenheit. **Keine Verbindung zum gehosteten Projekt.**
Der SDK-Lockfile wurde einmalig in GitHub Actions erzeugt; keine lokale Paketinstallation nötig.
Weitere Builds/Tests ebenfalls ausschließlich in Actions möglich, keine Codespaces vorausgesetzt.
Das Node-24-CI erfüllt die SDK-Anforderung Node >=22.

Nach Variablenänderung ist ein neuer Build erforderlich; ein bereits veröffentlichter statischer
Export liest keine Runtime-Environment-Werte. Pages-Quelle bleibt GitHub Actions.
Keine Redirect-Wildcard, kein Next.js-Server, keine Server Actions oder API-Routen erforderlich.
Ein SMTP-Wechsel benötigt nur Supabase-Konfiguration.

## 8. Automatisierter und realer Abnahmetest

| Prüfung | Automatisiert | Reale DEV-Abnahme / verbleibende Prüfungen |
|---|---|---|
| Registrierung | Exakte Domain/Passwort/Name; SDK-Signup-Payload ohne Rollen. | Auth-Hook negativ sowie zwei autorisierte Testregistrierungen mit echter Mailzustellung abgenommen. |
| E-Mail | Synthetischer PKCE-Codeaustausch, Callback statisch erreichbar, URL bereinigt, kein fremdes `next`, Fehler/Wiederholung. | Echter Bestätigungslink im selben Browser kooperativ abgenommen; abgelaufener/zweiter Link und anderer Browser noch offen. |
| Pending | Kein geschützter Request vor Freigabe, auch direkte Unterseiten bleiben gesperrt. SQL prüft fehlende Verifizierung und Metadaten-Eskalation. | Echte User-Tokens gegen REST: keine fremden oder geschützten Zeilen. |
| Freigabe | Global-Admin wählt Einheit, unbestätigt/ohne Auswahl gesperrt; RPC-Argumente geprüft. SQL schützt Rechte und letzten Admin. | Bootstrap und anschließende UI-Freigabe mit zwei getrennten echten Testkonten/Browserprofilen abgenommen; MCP bestätigt Audit, Rollen und Einheit. |
| Erneute Anmeldung | Vollständiger Browserablauf Signup → Bestätigung → Pending → Admin → Freigabe → Logout → Mitgliedlogin → RLS-Datenansicht. | Derselbe positive Ablauf mit echtem Gateway kooperativ abgenommen; unabhängige negative JWT-/REST-Prüfungen bleiben offen. |
| Entzug/Fehler | Sperrung, fehlende Einheit, fehlende Migration, URL-/Mailfehler schließen Zugriff; SQL prüft E-Mailwechsel, Ban, Widerruf mit gleicher Identität. | Token-Refresh, abgelaufene/widerrufene Sitzung, konkurrierende Aktionen und echte Netzwerkfehler. |
| UI/Build | Statischer Export, Demo-Regression, mobile DEV-Ansicht, Hell/Dunkel und Axe. | Physisches iPhone/Android/Safari, kein Hardware-Nachweis durch Chromium-Emulation. |

### Manueller End-to-End-Abnahmelauf (nur Testdaten)

1. Privaten Testnachweis anlegen: Zeitpunkt, Project Ref, eingesetzter Git-Commit; niemals Passwörter/Tokens.
2. Preflight, Migrationen und Dashboard-Einstellungen aus 2–4 kontrolliert abschließen.
3. Mit autorisiertem Admin-Testkonto registrieren, echte E-Mail bestätigen und Operator-Bootstrap ausführen.
4. Zweites autorisiertes Mitglied-Testkonto registrieren, E-Mail bestätigen. Erwartung: „Wartet auf Freigabe“.
5. Direkte Termin-/Dokument-/Admin-URLs und REST mit dessen eigenem Token prüfen:
   keine geschützten Daten, keine Selbstfreigabe, keine Möglichkeit fremde Rollen zu setzen.
6. Im separaten Admin-Browser Registrierung prüfen, bewusst Scheuren auswählen, freigeben.
   Audit-Eintrag, `MEMBER` und Mitgliedschaft im Dashboard kontrollieren.
7. Mitglied abmelden, erneut anmelden. Erwartung: eigener Name/Einheit, nur RLS-sichtbare DEV-Inhalte,
   kein lokaler Profilwechsel. Leere Listen sind zulässig; keine echten Personen/Termine importieren.
8. Mit separatem synthetischem, nicht letztem Admin-/Mitgliedskonto Sperrung und fehlende Zuordnung
   kontrolliert prüfen. Neue Requests sofort verweigert; UI spätestens bei Aktualisierung/Fokus gesperrt.
9. Rate-Limit-/Empfängerfehler nur bewusst und unter Berücksichtigung des Mailkontingents testen.
   Keine automatische Mailserie, keine Lockerung von RLS/Domain/Verifizierung.
10. Ergebnis und offene Punkte privat dokumentieren. Nicht behaupten, Fixture-Tests hätten diesen
    realen Abnahmelauf ersetzt. Keine Testkonten oder Daten destruktiv automatisiert bereinigen.

### Erfolgreiche kooperative reale Abnahme am 03.11.2026

Nach dem Benutzermerge von PR #4 wurde dessen tatsächlicher
[Main-Lauf 41660067350](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/41660067350)
abgewartet: `build`, `auth`, `dev-export` und `deploy` erfolgreich, Deployment-Commit
`eab9a90d6ccfa63bf023ab7ee42df064a70cb2cb`.
Der [Main-Datenbanklauf 41660067340](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/41660067340)
ist ebenfalls erfolgreich. Die öffentliche Startseite und der exakte Callback liefern HTTP 200;
alle elf im Callback eingebundenen JS-/CSS-Dateien ebenfalls.
Der Browser zeigt die echte Supabase-DEV-Anmeldung ohne Demo-Profilwechsel.
Eine zunächst noch alte Browseransicht wurde durch frische Navigation auf den neuen
veröffentlichten Stand ersetzt; nicht als Auth-Fehler oder bewiesener Service-Worker-Fehler gewertet.

| Schritt | Tatsächlicher Nachweis |
|---|---|
| Erste Registrierung / Mail / Callback | Benutzer registrierte eine autorisierte Feuerwehr-Testadresse, öffnete die Bestätigung im selben Browserprofil und meldete die Pending-Anzeige. MCP bestätigte echte E-Mail-Verifizierung, erfolgte Anmeldung, `pending`, null Rollen und null Einheiten. |
| Erster Administrator | Zielkonto und Einheit Scheuren vorab ausdrücklich vom Benutzer bestätigt. Einmaliger Aufruf des vorhandenen privaten Bootstrap-RPCs durch MCP; keine Direktänderung an Auth-Verifizierungsfeldern. MCP bestätigt `approved`, passende verifizierte E-Mail, MEMBER und GLOBAL_ADMIN, Scheuren sowie genau einen `dev_bootstrap`-Auditeintrag. |
| Administrator-Neuanmeldung | Benutzer meldete sich ab/erneut an und bestätigte geschützte DEV-Inhalte und Administration. |
| Zweite Registrierung / Mail / Zugriffssperre | Zweite autorisierte Testadresse in getrenntem Browserprofil registriert und dort bestätigt. Benutzer meldete Pending ohne geschützte Inhalte; MCP bestätigte Verifizierung, Anmeldung, `pending`, null Rollen und null Einheiten. |
| Freigabe über tatsächliche Administration | Benutzer gab das zweite Konto in der DEV-Administration für Scheuren frei. MCP bestätigt `approved`, erstes Testkonto als `approved_by`, exakt MEMBER ohne Adminrolle, Scheuren und genau einen `member_approved`-Auditeintrag mit diesem Administrator als Akteur. Keine Freigabe des zweiten Kontos durch Operator-SQL. |
| MEMBER-Neuanmeldung | Benutzer bestätigte nach Ab-/Anmeldung geschützte DEV-Inhalte und keine verfügbaren Administrator-Freigabefunktionen. |
| Schlussbestand | MCP bestätigt zwei Auth-Konten, beide E-Mails verifiziert, keine fremden Domains und genau eine aktive GLOBAL_ADMIN-Zuweisung. Keine Testkonten gelöscht oder Verifizierungen simuliert. |

**Nachweisgrenze:** Mailbox, Passworteingabe und angemeldete private Browserprofile wurden vom
Benutzer bedient. Der Same-Browser-Mail-/Callback-Ablauf ist kooperativ abgenommen und durch
reale Auth-/Profil-/Audit-Zustände gestützt. Die Implementierung tauscht am tatsächlichen Callback
den Code mit `exchangeCodeForSession` aus und entfernt URL-Credentials.
Es wurde kein Token-/Verifier-/Netzwerkprotokoll aus den privaten Browsern aufgezeichnet;
das ist kein unabhängiger Mitschnitt des PKCE-Protokolls und kein vollständiger negativer
JWT-/PostgREST-Rollentest. Die weiteren vier Scoped-/Leitungsrollen und Delegationswiderrufe
bleiben für einen gesonderten realen API-Abnahmelauf offen. Keine Mailadressen, Konto-UUIDs,
Passwörter, Bestätigungslinks oder Sitzungstokens in diesem öffentlichen Bericht.
Keine zusätzlichen automatischen Mails/Resends und keine erneute Migration ausgelöst.

## 9. Merge- und Veröffentlichungsnachweis

Prüfstand 03.11.2026 nach erfolgreicher negativer Auth-API-Abnahme und anschließendem
**Merge von PR #3 durch den Benutzer um 14:54 UTC und #4 um 15:04 UTC**:

| Pull Request | GitHub-Zustand / Checks | Einordnung |
|---|---|---|
| [#3](https://github.com/n00b31/feuerwehr-odenthal-app/pull/3), Grundlage `c024592c514859b8a010230b9c2e14b5a64d1e51` | Vom Benutzer gemergt; Main-Merge-Commit `054bdc27c76e7068fd829915bba16e173767bc00`. | Main-Build/Deploy und Datenbankchecks erfolgreich. Dieser Zwischenstand zeigt weiterhin die lokale Demo-Oberfläche am ursprünglichen App-Pfad. |
| [#4](https://github.com/n00b31/feuerwehr-odenthal-app/pull/4), `1b473f0b3531a8d32a4b4ab703d5f076fcebc02f` | Vom Benutzer gemergt; Main-Merge-Commit `eab9a90d6ccfa63bf023ab7ee42df064a70cb2cb`, Main-Build/Deploy und DB erfolgreich. | Auth DEV veröffentlicht und kooperativer Zwei-Konten-Abnahmelauf erfolgreich. Ergänzender Dokumentationsnachweis separat im Entwicklungsbranch, noch nicht in Main. |

Der Main-Zwischenstand nach #3 wurde unabhängig von verzögerten PR-Basismetadaten geprüft:
Sein Quellbaum `f4f4e8e7485bc91bff9a7cfd9ce390ead965e9b4` ist exakt der Quellbaum von #3,
und dessen Head ist ein Elterncommit des Main-Merge-Commits sowie ein Vorfahr von #4.
Main enthält damit keine zusätzlichen Quelländerungen, die der geprüfte #4-Stand noch nicht abdeckt.
Ein Merge von Main in den lokalen Feature-Branch oder ein Rebase war hierfür nicht notwendig
und wurde nicht ausgeführt.

Der frühere [Pages-Lauf 41656066305](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/41656066305)
bleibt als fehlgeschlagener Nachweis erhalten: Axe meldete `color-contrast` an `.button` im
Änderungsprotokoll (`tests/demo.spec.ts:235`). Der Benutzer hat die Ursachenbehebung ausdrücklich
zurückgestellt und nach dem Merge von #3 einen neuen Test beauftragt. **Keine Regel, kein Test
und kein Workflow-Gate wurden deaktiviert.** Der Befund trat im folgenden neuen Lauf nicht auf;
seine Ursache wurde dadurch nicht behoben oder abschließend erklärt.

**Frische Prüfungen auf dem unveränderten #4-Head:**

- [Pages-Lauf 41658448448](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/41658448448):
  **59/59** Fach-/Konfigurationstests, TypeScript, ESLint, Icons, statische Builds,
  **19/19** Demo-Browsertests, **6/6** Auth-Browsertests sowie `dev-export` erfolgreich.
- Der frische DEV-Export enthält die bestätigte tatsächliche Project URL und den aktiven
  Publishable Key aus den Repository-Variablen. Export-Schutz gegen Secret-Key-Werte und
  synthetische CI-Konfiguration erfolgreich; `deploy` auf dem Feature-Branch erwartungsgemäß
  **übersprungen**. Kein Feature-Export veröffentlicht.
- [DB-Lauf 41658455056](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/41658455056):
  alle Migrationen und Rollen-/RLS-/RPC-Prüfungen in isoliertem PostgreSQL erfolgreich.
- Das heruntergeladene `supabase-dev-export`-Artefakt wurde zusätzlich unverändert geprüft:
  reale URL/aktiver Public Key eingebettet, Manifest `start_url`/`scope` exakt
  `/feuerwehr-odenthal-app/`, statische Callback-Datei vorhanden, Export-Schutz erneut bestanden.
  Ein kurzzeitig lokal gestarteter vorhandener Preview-Server liefert Start, Callback,
  Termine, Dokumente, Statistik, Profil, Administration und Manifest mit **HTTP 200**;
  alle **11** im Callback eingebundenen JS-/CSS-Dateien ebenfalls HTTP 200.
  Danach wurde der Preview-Server beendet. Kein echter Login oder neuer Mailtest durchgeführt.
- Der durch den Benutzermerge ausgelöste [Main-Lauf 41658265089](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/41658265089)
  hat Build/Deploy erfolgreich abgeschlossen. Diese Veröffentlichung stammt aus #3, nicht #4.

Die vorgeschlagene Reihenfolge **#3 → #4 → Main-Deployment → reale Auth-/Freigabe-Abnahme**
ist inzwischen durch Benutzermerges und den oben protokollierten Abnahmelauf erledigt.
Der Agent hat keinen Merge und keine zusätzliche Main-Veröffentlichung ausgelöst.
Migrationen 001–005 wurden nicht wiederholt; die unabhängige Demo bleibt unverändert.
Der ergänzende Dokumentationsnachweis wird auf ausdrücklichen Sicherungsauftrag in
`feature/supabase-auth-dev` versioniert; er ist noch nicht Bestandteil von Main.

### Sicherungsstand vor Terminverwaltung DEV 0.3

Am 03.11.2026 erneut geprüft:

- Aktueller Entwicklungsbranch `feature/supabase-auth-dev`; relevante Änderungen ausschließlich
  `README.md` und `docs/supabase-dev-setup.md`. Keine Funktion, Migration oder Build-Konfiguration
  geändert. Eine separate ungetrackte `.github/github-app.yml` ist nicht Bestandteil dieser Sicherung.
- Der Auth-Quellbaum des bisherigen Branch-Heads `1b473f0b3531a8d32a4b4ab703d5f076fcebc02f`
  stimmt exakt mit Main `eab9a90d6ccfa63bf023ab7ee42df064a70cb2cb` überein;
  dieser Head ist außerdem ein Vorfahr von Main. PR #3 und #4 sind gemergt, keine offenen PRs
  zum Prüfzeitpunkt. Keine Rebase-, Checkout- oder Merge-Operation erforderlich.
- Beide Main-Actions aus dem oben verlinkten Veröffentlichungsnachweis sind erfolgreich.
  Die aktive GitHub-Pages-Veröffentlichung zeigt exakt auf diesen Main-Commit;
  Startseite und `/auth/callback/` erneut HTTP 200.
- `v0.2-auth-dev` existiert zum Prüfzeitpunkt weder lokal noch auf GitHub und wird **noch nicht
  erstellt**, weil der ergänzte Abnahmenachweis nur im Entwicklungsbranch gesichert ist.
  Kein vorhandener Tag wird überschrieben.

**Noch erforderlich für den vollständigen Main-Snapshot:** Den Dokumentationscommit über einen
separaten Pull Request prüfen und bewusst manuell in Main integrieren. Danach den tatsächlichen
Main-Commit, erfolgreiche Actions und die weiterhin funktionierende DEV-Anwendung erneut prüfen.
Erst dann `v0.2-auth-dev` exakt auf den so bestätigten vollständigen Main-Commit setzen und pushen.
Keinen automatisch gewählten neueren Terminverwaltungsstand oder bloß den damaligen
Merge-Commit ohne ergänzten Nachweis als vollständige Sicherung markieren.

## 10. Noch offen / nächste Entwicklungsschritte

- Zurückgestellt: Ursache des früheren Kontrastbefunds klären; im neuen unveränderten Lauf
  bestanden alle Tests. Der konfigurierte DEV-Export ist inzwischen geprüft.
- Weitere Dashboard-Auth-/Mail-Konfiguration und organisatorische Empfängerliste prüfen.
  Zwei autorisierte Testadressen, erster verifizierter GLOBAL_ADMIN und reale MEMBER-Freigabe
  sind abgenommen; umfassende reale Rollen-/Delegations-/JWT-API-Abnahme bleibt offen.
- Vor künftigen CLI-Migrationen die abweichenden MCP-Historienversionen aus Abschnitt 1 abgleichen.
- Vollständige Backend-CRUD-/Serien-/Mitgliedschafts-RPCs und dazugehörige UI-Adapter.
- Vollständige DEV-Anwesenheits-/Delegations- und Antwort-Oberfläche mit vorhandenen RPCs.
- Passwort-Reset, Admin-MFA, SMTP, Recovery/Backups, Datenschutz/Retention und unabhängige Audit-Aufbewahrung.
- Rechtliche Revisionssicherheit wird nicht allein durch SQL-Trigger/RLS garantiert: DB-Owner können
  administrative Schutzmechanismen ändern. Betriebs- und Aufbewahrungskonzept fehlen.
- Kein automatischer Merge, keine produktive Freischaltung und kein Eingriff in das unabhängige Demo-Repository.

## 11. DEV 0.3 – zentrale Einzeltermine

Ausgangsbasis ist der vollständige DEV-0.2-Snapshot `v0.2-auth-dev`
(`d211d303bd411a6cff291008b84b560830f0bbe3`). Neue Arbeit ausschließlich auf
`feature/supabase-events-dev`. Beim read-only MCP-Preflight am 03.11.2026:
Migrationen 001–005 vorhanden, null Termine und null Teilnahmeantworten.
Keine erneute Auth-Einrichtung, kein neues Projekt und keine importierten Demo-Personen.

### Migration und Servergrenze

`20261103000600_single_events.sql` ist eine additive Migration:
`events.revision` schützt gegen verlorene Änderungen, neue RPCs verwenden die vorhandenen
Prädikate `is_active`, `manages_scope`, `can_view_event` und `can_lead_event`.
Bestehende RLS-Policies und direkte Client-Schreibverbote bleiben unverändert.
Eine private Validierung plus alle privilegierten RPCs besitzen leeren `search_path`;
nur die öffentlichen geprüften RPCs sind für `authenticated` ausführbar, niemals für `anon`.

- `ff_create_single_event(input)`: UNIT_ADMIN nur seine zugewiesene Einheit, GLOBAL_ADMIN
  alle Einheiten. Nur zukünftige Einzeltermine. Atomarer Snapshot aktuell freigegebener
  Mitglieder der gewählten Einheit mit damaligem Namen/Einheit und Audit.
- `ff_update_single_event(target_event, expected_revision, input)`: nur zuständige Administration,
  zukünftiger geplanter Einzeltermin, Revision muss passen. Bereits gespeicherter Bereich
  und Teilnehmerkreis bleiben unverändert, damit Antworten/Historie nicht überschrieben werden.
  Für eine andere Einheit einen neuen Termin anlegen. Eine Serieninstanz wird nicht verändert.
- `ff_cancel_single_event(target_event, expected_revision, reason)`: zuständige Administration,
  Pflichtgrund, Revision und Einzelterminstatus geprüft. Keine Löschung; Teilnehmer, Antworten
  und Audit bleiben erhalten. Erfasste tatsächliche Anwesenheit oder Bestätigung verhindern Absage.
- `ff_set_response(target_event, answer)` bleibt unverändert der eigene MEMBER-Pfad:
  aktuelle Freigabe, gespeicherter Teilnehmerkreis, geplanter Status und `clock_timestamp()`
  strikt vor Beginn sowie Anmeldeschluss. Genau eine aktuelle Antwort je Person/Termin.
- `ff_set_member_response(target_event, target_user, answer, reason)`: separate begründete
  Korrektur für zuständige Administration oder aktuell zugewiesene Leitung, auch nach Beginn.
  Nur freigegebene Personen im Teilnehmerkreis, keine Selbstdelegation und keine Rechte für andere
  Termininstanzen. Keine Änderung tatsächlicher Anwesenheit. Vorher/nachher, Akteur, Person, Grund
  und Termin werden atomar protokolliert.
- `ff_events_workspace()`: serverseitig sichtbare Termine, eigener Antwortstatus, Serverzeit und
  verwaltbare Einheiten. Voller Teilnehmerkreis mit Antworten nur für Leitung bzw. bestehende
  organisationsweite Leseaufsicht. MEMBER erhält keine fremden Antwortidentitäten.

**Anwendungsstatus am 03.11.2026:** Das bestehende Projekt wurde erneut geprüft: PostgreSQL 17.11,
001–005 unverändert vorhanden, null Termine und null Antworten. Nach erfolgreicher isolierter
SQL-CI und vollständigem Pages-Feature-Lauf wurden ausschließlich additive Änderungen angewendet.
Beim MCP-Aufruf wurde 006 versehentlich unvollständig übermittelt: die Absagefunktion war falsch,
zwei RPCs und die abschließenden Rechtebeschränkungen fehlten. Die unmittelbar anschließende
`20261103000700_complete_single_events.sql` korrigiert dies mit `CREATE OR REPLACE` und
expliziten Grants/Revokes, ohne Löschung, Kontenänderung oder Testdatenimport.
Die unvollständige Historie wird nicht verschwiegen, überschrieben oder als identisch mit der
vollständigen Quelldatei 006 bezeichnet.

| Lokale Quelle / Zweck | Tatsächliche MCP-Historie |
|---|---|
| 006 / erste, unvollständige MCP-Übermittlung | `20261103163850`, `ff_006_single_events` |
| 007 / vollständig übermittelte Reparatur | `20261103163942`, `ff_007_complete_single_events` |

007: SHA-256 `0e11c1550ea764d4964b2a2789e8deb7c9306840f29b2e7b66ed2ad27f87ed20`
(UTF-8, LF, abschließenden Whitespace entfernen).
Alle sechs resultierenden Funktionskörper wurden unabhängig aus `pg_proc.prosrc` mit den
vollständigen, geprüften Quellen 006 verglichen; alle normalisierten MD5-Werte stimmen überein
(reiner Inhaltsvergleich, kein Sicherheits-Hash). Fünf öffentliche RPCs sind `SECURITY DEFINER`
mit leerem `search_path`, nur für `authenticated` ausführbar. Der private Validator ist weder
für `anon` noch `authenticated` ausführbar. Ein zurückgerollter SQL-Diagnoselauf unter
`authenticated` ohne freigegebene Identität bestätigt für alle fünf RPCs SQLSTATE 42501.
Das ist ein tatsächlicher Datenbanktest, aber kein echter JWT-/Browser-Zwei-Konten-Abnahmelauf.
Schlussbestand: null Termine, null Antworten, zwei bestehende Konten und null neue Termin-Audits.

Für eine neue isolierte Datenbank alle Quelldateien 001–007 in Reihenfolge anwenden.
Im bestehenden Projekt **nicht** 001–006 wiederholen oder MCP-Historien blind auf Dateiversionen
umstellen. Der Endzustand ist abgeglichen; die Reparatur wird zusätzlich in SQL-CI geprüft.
Keine Fixture oder Testdatensuite im DEV-Projekt ausführen.

### Oberfläche und Betrieb

Static Export bleibt unverändert; keine Server Actions, API-Routen oder zusätzlichen Server.
Browser nutzt SDK und Publishable Key, keine Service Role. Termine/Antworten haben keinen
lokalen Datenbestand oder Offline-Schreibpfad. Erneute Anmeldung/Neuladen lädt zentrale Antworten.
Offene Terminansicht aktualisiert spätestens alle 30 Sekunden, außerdem über den vorhandenen
Freigabezyklus sowie manuell; keine Supabase-Realtime-Aktivierung erforderlich.
Während einer offenen Bearbeitung bleibt der Formularentwurf über die Sitzungskontrolle erhalten.
Bei Sperrung, Logout oder Auth-Fehler wird er verworfen.

Alle Formulardaten werden als Berliner Lokalzeit eingegeben und mit dem vorhandenen DST-Helper
in Instants umgesetzt. Die UI schätzt die Serverzeit mit monoton verstrichener Zeit; maßgeblich
bleibt ausschließlich die Server-RPC. Veraltete Revision erzeugt einen sichtbaren Konflikt,
kein stilles Überschreiben. Ein erfolgreicher Write mit fehlgeschlagenem anschließenden Read
wird ausdrücklich getrennt gemeldet; keine erfundene Teilnehmerübersicht.
Light/Dark, Branding und mobile Bottom-Navigation verwenden die bestehenden Theme-Tokens.

### Tests und tatsächliche Abnahme

- Lokal mit vorhandenen Paketen: 65/65 Fach-/Konfigurationstests bestanden, einschließlich
  sechs neuen Terminpayload-/Berliner-Zeit-/Antwortzählungs-/Fehlerfällen.
  Lokaler Typecheck ist wegen fehlendem `@supabase/supabase-js` im vorhandenen `node_modules`
  blockiert; keine lokale Installation. Vollständige Typen/Build/Lint in GitHub Actions bestanden.
- `supabase/tests/events.sql`: ausschließlich `ff_dev_ci`, transaktional zurückgerollte
  Auth-/Rollenfixtures. Erstellen, gemeinsamer gespeicherter Termin, eigene Antwortänderung,
  Admin-Übersicht, fremde Einheiten, direkte DML-Sperre, serverseitige Beginnsgrenze,
  UNIT_ADMIN/GLOBAL_ADMIN, zeitlich unbeschränkte begründete Leitungskorrektur, Delegationswiderruf,
  Stale-Revision, Absage mit erhaltenen Antworten und reine Leseaufsicht.
- `tests/supabase-events.spec.ts`: zwei getrennte Browserprofile mit abgefangenen Protokollendpunkten
  und gemeinsamer synthetischer Datenquelle; Erstellen/Sichtbarkeit/Zusage/Änderung/Reload,
  Teilnehmerzahlen, Bearbeiten/Absage, gesperrte API-Requests ab Beginn/fremde Einheit,
  Fehler/konkurrierende Revision, Light/Dark/Axe und mobile Navigation.
  Das ist **kein** Test gegen das echte Supabase-Projekt; SQL-CI prüft die tatsächliche RPC-/RLS-Logik.
- Bestehende 19 Demo-Browser- und sechs Auth-Szenarien laufen zusätzlich unverändert weiter,
  nur der neue gelesene Termin-RPC-Vertrag wird in den Auth-Fixtures ergänzt.
- [Pages-Feature-Lauf 41675538534](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/41675538534):
  65/65 Fachtests, TypeScript, ESLint, Icons, 19/19 Demo- und 9/9 Auth-/Termin-Browsertests,
  statische Builds und tatsächlich konfigurierter DEV-Export erfolgreich; kein Deployment.
  Die vorherigen fehlgeschlagenen Läufe bleiben nachvollziehbar: Zwischenfarben während
  Theme-Übergängen werden vor Axe abgewartet, der echte aktive Dark-Navigationskontrast wurde
  mit dem vorhandenen Text-Token und roter Markierung korrigiert. Keine Axe-Regel deaktiviert.
  Die Datenisolationsprüfung kontrolliert exakt Demo-Datenbestand und Demo-Profil; die gemeinsam
  genutzte reine Theme-Einstellung ist kein paralleler Terminbestand.
- [SQL-Lauf 41676834098](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/41676834098):
  001–007 und beide vollständigen RLS-/RPC-Testdateien in tatsächlichem PostgreSQL 17 erfolgreich,
  einschließlich Reparaturmigration. Der frühere erfolgreiche 006-Lauf bleibt als zusätzlicher
  Nachweis erhalten.
- Das unveränderte, konfigurierte Pages-Artefakt wurde heruntergeladen und kurzzeitig lokal
  geprüft: Start, Termine, Callback, Dokumente, Statistik, Profil, Administration und Manifest
  jeweils HTTP 200, alle elf eingebundenen Callback-Assets ebenfalls HTTP 200.
  Browser-Canvas `odenthal-events-dev03-preview` zeigte an der direkten Terminroute die echte
  DEV-Anmeldung, keine Demo und keine geschützten Termindaten ohne Anmeldung. Keine Passwörter,
  Mailversandschritte oder echten Kontoanmeldungen durch den Agenten.

**Echte DEV-0.3-Abnahme noch offen:** Nach Migration und bewusster Frontend-Veröffentlichung
mit den vorhandenen zwei Konten in getrennten Browserprofilen einen ausdrücklich synthetischen
Einzeltermin für Scheuren erstellen. Mitglied liest denselben Termin, sagt zu; Admin aktualisiert
und sieht Zusage. Mitglied ändert auf Vielleicht/Absage, lädt neu; Admin prüft denselben zentralen
Stand und Teilnehmerzahlen. Vor Freigabe/aus fremder Einheit bleiben Zugriffe gesperrt.
Den Beginn des ausdrücklich gewählten Testtermins tatsächlich abwarten: MEMBER-Änderung
über Server abweisen, Leitungskorrektur nur mit Grund. Anschließend Testtermin begründet absagen;
keine Löschung, keine Mailserie und keine künstliche Verifizierung bestehender Konten.
Benutzer bedient Passwörter/Sitzungen selbst; keine Tokens oder persönlichen Accountdaten
in Chat, Screenshots, Logs oder öffentliche Dokumentation aufnehmen.

## 12. DEV 0.3.1 – Mitgliederverwaltung und Layout

Basis: Benutzermerge von [PR #6](https://github.com/n00b31/feuerwehr-odenthal-app/pull/6),
Main `42719c3d95e894ea866d869b9dde1e13a44ea33a`, beide Main-CIs erfolgreich.
Änderungen ausschließlich in `feature/dev-031-fixes`; Demo-Repository unverändert.

### Ursachenanalyse

- Die gemeldete fehlgeschlagene Terminerstellung ließ sich nicht als Serverfehler reproduzieren.
  Im tatsächlich vorhandenen DEV-Projekt sind 001–007 vorhanden, ein freigegebener GLOBAL_ADMIN
  und zwei Konten eingerichtet. Eine SQL-Reproduktion mit der bestehenden Administratoridentität
  und ausdrücklich synthetischem Payload führte `ff_create_single_event` erfolgreich aus.
  Eine absichtliche abschließende Exception rollte den gesamten Diagnoseaufruf zurück.
  Das ist tatsächliche Serverausführung, **kein** echter JWT-/PostgREST-/Browser-Login.
  Der Benutzer meldete anschließend „jetzt geht es“. Es liegen weder ursprünglicher Fehlertext
  noch ein fehlgeschlagener Request als Beweis vor. Keine erfundene Ursachenbehauptung über RLS,
  Cache oder Migrationen und keine spekulative Änderung an funktionierenden Termin-RPCs.
- Mitgliederverwaltung fehlte tatsächlich: bisher gab es nur Pending-Freigabe und keine
  Oberfläche für vorhandene Profile. Rollen-/Deaktivierungs-RPCs existierten bereits,
  Einheits-/Funktionsänderung und sichere Reaktivierung noch nicht.
- DEV besaß einen eigenen vereinfachten Navigationsbaum statt der vorhandenen Sidebar.
  Die gemeinsame `navigation.tsx` enthält jetzt ausschließlich Darstellung, Branding und Links.
  Die Demo-Identität verbleibt in ihrem eigenen Shell-Wrapper; DEV nutzt ausschließlich Auth-Zustand.

### Berechtigungen und Migration 008

`20261103000800_member_management.sql` ist additiv. Vorhandene Auth-, Event-, Rollen- und
Statusfunktionen bleiben unverändert. Keine direkten Client-DML-Grants und keine Lockerung
der bisherigen RLS. Neue öffentliche RPCs: nur `authenticated`, `SECURITY DEFINER`,
leerer `search_path`; private Helfer nicht direkt browseraufrufbar.

- `ff_members_workspace`: GLOBAL_ADMIN sieht alle Profile einschließlich Pending/Sperrstatus,
  aktuelle Einheiten, Mitgliedschaftshistorie, Rollen und Sonderfunktionen.
  UNIT_ADMIN sieht nur aktuell eigene Mitglieder sowie ehemalige eigene Mitglieder ohne
  andere aktuelle Einheit. Fremde Einheitswechsel sind nicht sichtbar; fremde Rollen/Funktionen
  werden nicht ausgegeben. MEMBER/FUNCTION_ADMIN/FIRE_CHIEF ohne zusätzliche zuständige
  Adminrolle können dieses Verwaltungs-RPC nicht verwenden.
- `ff_set_unit_membership`: globale Administration kann die aktuelle Einheit atomar wechseln
  oder eine Mitgliedschaft mit Grund beenden; genau eine offene Einheitsmitgliedschaft.
  UNIT_ADMIN kann bestehende einfache Mitgliedschaften nur in der eigenen verwalteten Einheit
  beenden/wiederherstellen, keine fremden Personen aufnehmen oder nach außerhalb verschieben.
  Zielkonten mit aktiven Admin-/Aufsichtsrollen sind für UNIT_ADMIN schreibgeschützt.
  Wiederherstellung erfordert zuvor freigegebenes Profil und unverändert verifizierte E-Mail;
  kein Pending-/Domain-/Verifizierung-Bypass.
- `ff_set_function_membership`: ausschließlich GLOBAL_ADMIN; Mehrfachzuordnung,
  Beendigung statt Löschung und nachvollziehbare Historie.
- Rollen über vorhandenes `ff_set_role`: ausschließlich GLOBAL_ADMIN; MEMBER bleibt Basis
  der Freigabe, scoped UNIT_ADMIN/FUNCTION_ADMIN benötigen ihren passenden Bereich.
  Einheitswechsel entzieht bewusst nicht eigenständige scoped Adminrollen; gesondert prüfen.
- Deaktivieren über vorhandenes `ff_set_account_status`; Reaktivieren ausschließlich über
  `ff_reactivate_member` mit Pflichtgrund, zuvor gesperrtem freigegebenem Profil, weiterhin
  verifizierter unveränderter Feuerwehr-E-Mail und aktueller Einheit. Keine Auth-Metadaten ändern,
  keine Verifizierung simulieren und keinen neuen Rollenbestand automatisch erzeugen.
- Alle tatsächlichen Änderungen werden im bestehenden Audit protokolliert. Gemeinsame
  `ff.role_changes`-Transaktionssperre schützt auch beim Einheitsentzug den letzten aktiven
  GLOBAL_ADMIN; ursprüngliche Rollen-/Deaktivierungssperren bleiben erhalten.
  Ohne aktuelle Einheit ist kein geschützter Zugriff erlaubt. Historische Event-Roster,
  Teilnahme-/Anwesenheitsdaten und Audit-Snapshots werden nicht verändert.

**Anwendungsstatus am 03.11.2026:** Nach vollständig erfolgreicher PostgreSQL-/Pages-CI
ausschließlich die fehlende 008 im bestehenden Projekt angewendet:
`20261103175317`, `ff_008_member_management`.
Quell-SHA-256 `922d1f38814ac2eb5257758f5375deeaf0e48ef5b399c06fe0f959d3a82b7e1e`
(UTF-8, LF, abschließenden Whitespace entfernen).
Alle sechs tatsächlichen Funktionskörper stimmen nach normalisiertem Inhaltsvergleich mit
den geprüften Quellen überein. Vier öffentliche RPCs sind nur für `authenticated` ausführbar,
zwei private Helfer weder für `anon` noch `authenticated`, alle mit leerem `search_path`.
Keine alten Migrationen wiederholt oder Testfixtures im DEV-Projekt ausgeführt.
Keine Mail-/Auth-Konfiguration, realen Mitgliedschaften oder Kontostatus verändert.

### UI und Prüfungen

Desktop: linke Sidebar mit Original-Logo, vertikalen Icons/Links und aktivem Menüpunkt,
Hauptinhalt ohne künstliche 1180px-Begrenzung. Bis 960px mobile Bottom-Navigation mit
Safe-Area-Padding und mindestens 56px hohen Zielen, inklusive Administration nur für
GLOBAL_ADMIN/UNIT_ADMIN. Light/Dark verwendet vorhandene Theme-Tokens.
Kein Rollenwechsel, kein Demo-Provider und keine lokalen DEV-Mitgliederdaten im Layout.
Die neue Mitgliederansicht lädt über ihr eigenes geprüftes RPC; fehlende 008 öffnet nichts
und verhindert nicht die bestehende Auth-/Terminansicht. Änderungen an der eigenen Identität
lösen sofortige erneute Freigabeprüfung aus; alle anderen Aktionen laden die zentrale Liste erneut.
Gespeicherte Änderung und anschließender Ladefehler werden ausdrücklich getrennt gemeldet.

- Lokal 70/70 Fachtests und gezieltes ESLint bestanden. Lokale Typprüfung durch weiterhin
  fehlendes Supabase-SDK in `node_modules` blockiert; vollständige Typprüfung in Actions erforderlich.
- Browser: bestehender gemeinsamer Termin-/Antwort-/Reload-Ablauf plus Mitgliedschaftswechsel,
  Rollenvergabe/-entzug, Sonderfunktion, Deaktivierung/Reaktivierung, verbotene Member-Requests
  und Sidebar/Bottom-Navigation bei 320/390/960/1366px. Explizit abgefangene synthetische
  Endpunkte, keine Mail oder gehostete Mutation.
- PostgreSQL: echte Migrationen/RPCs/RLS in ausschließlich wegwerfbarer `ff_dev_ci`;
  scoped Sichtbarkeit, Historien, Rechteentzug, Pending-/E-Mail-/Null-Bypass, Deaktivierung,
  Reaktivierung und alle drei Entzugspfade des letzten GLOBAL_ADMIN.
- Die zurückgerollte DEV-Termin-Diagnose und die Benutzerbestätigung sind tatsächliche
  Beobachtungen; daraus wird keine vollständige echte Zwei-Konten-API-Abnahme abgeleitet.
  Mitgliederänderungen gegen reale Konten sind noch nicht abgenommen und werden nicht ohne
  bewusste Auswahl als gehostete Testfixtures ausgeführt.

**Ausgeführte Nachweise:**

- [PostgreSQL-CI 41684810841](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/41684810841):
  001–008 und sämtliche drei SQL-Testdateien erfolgreich.
- [Pages-CI 41687595719](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/41687595719):
  70/70 Fachtests, Typen, ESLint, 19/19 Demo- und 11/11 Auth-/Termin-/Mitglieder-Szenarien,
  konfigurierte Static Exports erfolgreich. Kein Deployment. Vorherige rote Läufe bleiben
  nachvollziehbar: exakte `getByLabel`-Auswahl bei verschachtelten Select-Optionen durch die
  tatsächlich bestätigte Combobox-Rolle ersetzt; Mitglied war nach Rollenentzug noch auf der
  gesperrten Adminroute; Berechtigungshinweis vom zusätzlichen Next-Routenansager abgegrenzt.
  Keine Sicherheitsassertion oder Axe-Regel entfernt.
- Tatsächlicher DEV-Diagnoselauf mit vorhandenen Identitäten: GLOBAL_ADMIN liest zwei Profile,
  MEMBER-Verwaltungs-RPC wird mit 42501 abgewiesen, Entzug der letzten GLOBAL_ADMIN-Einheit
  ebenfalls. Ausschließlich temporäre SQL-Identitätskonfiguration, kein echter JWT-Netzwerktest
  und keine gespeicherte Mitgliederänderung.
- Während der Benutzerabnahme entstand im DEV ein gespeicherter Termin mit `event_created`-Audit
  und eine zentrale Antwort von der anderen MEMBER-Identität. MCP bestätigt diesen Bestand
  ohne Namen/Tokens im öffentlichen Nachweis. Das stützt die Benutzerbestätigung der funktionierenden
  Erstellung/Antwort; kein unabhängiger Mitschnitt aller Browser-/Edit-/Absageschritte.
  Der Agent hat diese Daten nicht erzeugt oder verändert.

Nach manueller Veröffentlichung mit vorhandenen privaten Testkonten: gemeinsamer synthetischer
Termin, Antwortänderung und Reload; MEMBER darf keinen Termin anlegen. Danach gezielt am
MEMBER-Testkonto Einheit/Funktion bzw. scoped Rolle ändern und über erneute Requests prüfen,
ohne den einzigen GLOBAL_ADMIN zu verändern. Deaktivierung sperrt neue Zugriffe, Reaktivierung
öffnet nur bei gültiger Einheit/Verifizierung. Desktop/Mobil/Hell/Dunkel prüfen. Keine Tokens,
Passwörter oder personenbezogenen Kontodaten in öffentliche Nachweise aufnehmen.

## 13. DEV 0.3.2 – manuelle synthetische Testkonten

### Architekturentscheidung und aktueller Status

Ausgangsbasis: Benutzermerge von [PR #7](https://github.com/n00b31/feuerwehr-odenthal-app/pull/7),
Main `c573562e0d75bb658417e9671d953ec0d55d136f`, Migrationen 001–008 vorhanden.
Read-only-Preflight im bestehenden Projekt am 04.11.2026: zwei Auth-Konten,
keine Kollision mit den ursprünglich angefragten `example.com`-Adressen oder den
anschließend bestätigten sechs Feuerwehr-Testadressen,
Einheiten Scheuren und Odenthal vorhanden.

Die ursprünglich gewünschten `@example.com`-Konten würden trotz Auth Admin API am
Profil-Trigger und später an Freigabe, aktiver Identität sowie Anmeldevalidierung scheitern.
Der Benutzer entschied ausdrücklich: **Feuerwehr-Testadressen statt Domainausnahme**.
Die bestehende Domainpflicht bleibt unverändert. Kein Hook, keine RLS-Policy und kein
Anmelde-/Registrierungsschutz werden für Testadressen gelockert.

| Fiktiver Name | Bestätigte Testadresse | Rollen nach Seed | Einheit |
|---|---|---|---|
| Max Mustermann | max.test@feuerwehr-odenthal.de | MEMBER + UNIT_ADMIN | Scheuren |
| Anna Becker | anna.test@feuerwehr-odenthal.de | MEMBER + UNIT_ADMIN | Scheuren |
| Thomas Weber | thomas.test@feuerwehr-odenthal.de | MEMBER | Scheuren |
| Lisa Müller | lisa.test@feuerwehr-odenthal.de | MEMBER | Scheuren |
| Peter Schneider | peter.test@feuerwehr-odenthal.de | MEMBER + UNIT_ADMIN | Odenthal |
| Sarah Fischer | sarah.test@feuerwehr-odenthal.de | MEMBER | Odenthal |

Alle erhalten ein freigegebenes aktives Profil und genau eine aktuelle Einheitsmitgliedschaft.
Keine Sonderfunktionen oder GLOBAL_ADMIN-Rechte werden zusätzlich erzeugt.
**Das ist der Sollbestand, kein Nachweis bereits angelegter Konten.** Der Agent führt den
Seed nicht vorab aus. Tatsächliche Anlage/Bestand dokumentiert erst der bewusst manuell
ausgelöste Workflow. Vorhandene Mailadressen gehören niemals automatisch dem Seed:
Kollisionen werden nicht übernommen, überschrieben, bestätigt oder gelöscht.

### Servergrenze und Migration 009

`20261103000900_dev_test_members.sql` ergänzt ausschließlich:

- Privates festes Manifest und private Operatorprüfung.
- `ff_dev_seed_report(approver_id)`: read-only Soll-/Ist-Vergleich, einschließlich verifizierter
  Identität, Profil, genauer Rollen, Einheit und Seed-Herkunft; meldet `missing`, `ready` oder
  `conflict`. Ein Fingerprint überwacht bestehende GLOBAL_ADMIN-Zuweisungen/Profile/
  Mitgliedschaften sowie Termine und Antworten während des Laufs.
- `ff_dev_seed_member(target_user, approver_id, run_id)`: atomare Initialisierung ausschließlich
  einer höchstens zehn Minuten alten, bestätigten, ungesperrten Auth-Identität aus genau diesem
  Seed-Lauf. Serverseitig gesetzte `app_metadata.ff_dev_seed` müssen Version `032`, die feste
  Projekt-ID und Run-UUID exakt enthalten. Profil muss Pending sein und zum Manifest passen;
  keinerlei bisherige Rollen, Mitgliedschaften, Funktionen oder personenbezogenes Audit.
  Bereits eingerichtete Konten, alte Teilversuche und gewöhnliche Registrierungen werden abgewiesen.

Beide RPCs sind `SECURITY DEFINER` mit leerem `search_path`, ausschließlich für `service_role`
ausführbar, niemals für `anon` oder `authenticated`. Zusätzlich prüft der Funktionskörper
die Service-Rolle ohne Mitglieds-`sub` und einen explizit konfigurierten, tatsächlich aktiven
GLOBAL_ADMIN als Freigabeverantwortlichen. Keine JWT-Identität wird umgeschrieben oder
ein bestehender Administrator angemeldet. Der vertrauenswürdige Operator besitzt einen
privilegierten Schlüssel; das ist **keine** neue Mitglieder-/Browserberechtigung.

`approved_by` und `granted_by` referenzieren den bewusst konfigurierten Freigabeverantwortlichen.
Auditaktion `dev_test_member_seeded` verwendet den bestehenden Audit-Helfer, Akteur `NULL`
mit dem sichtbaren Snapshot „Vertrauenswürdige DEV-Einrichtung“, Zielperson, Statuswechsel,
Einheit, Zusatzrolle, Freigabeverantwortlichen und Run-UUID. Kein fingierter Browserlogin.
Der bestehende gemeinsame Rollen-Lock wird genutzt; kein GLOBAL_ADMIN wird verändert.
Die Migration legt selbst **keine** Auth-Konten an und ändert keinen bestehenden Datenbestand.
Nur die fehlende 009 im bestehenden DEV-Projekt anwenden; alte Migrationen nicht wiederholen.

**Bereits angewendet am 04.11.2026:** Nach erfolgreicher
[PostgreSQL-CI 41794499202](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/41794499202)
ausschließlich 009 im bestätigten Projekt installiert:
`20261104074950`, `ff_009_dev_test_members`.
Quell-SHA-256 `6ad5d84e48b80cac1db3176f014216a9458bdb40b77a9be0d306c832036cf79f`
(UTF-8, LF, abschließenden Whitespace entfernen).
Alle vier gehosteten Funktionskörper stimmen normalisiert exakt mit der Quelle überein;
Grants und leere Suchpfade unabhängig geprüft. Bestand danach unverändert:
zwei Auth-Konten/zwei Profile, ein Termin/eine Antwort, null Seed-Auditeinträge.
Der tatsächliche gehostete read-only Report meldet alle sechs Sollkonten als `missing`.
Dieser Diagnoseaufruf verwendete temporäre SQL-Request-Claims für den Operator-Kontext,
keinen Secret Key, Auth-Admin-API-Aufruf, Mitgliederlogin oder Seed-Schreibaufruf.
**009 nicht erneut anwenden.**

### Einmalige geschützte GitHub-Konfiguration

GitHub-Environment **`supabase-dev-seed`** anlegen und möglichst Required Reviewers sowie
Deployment-Branch-Regel nur `main` aktivieren. Zugriff auf diese Secrets ist hoch privilegiert.
Keine Schlüssel in PR-Kommentare, Chat, Workflow-Inputs, CLI-Argumente oder Dateien eintragen.

| Wert | Ablage |
|---|---|
| `SUPABASE_DEV_URL` | Vorhandene Repository-/Environment-Variable; exakt `https://orxinqhhbtjpkzwlfaxq.supabase.co` |
| `SUPABASE_DEV_PUBLISHABLE_KEY` | Vorhandene öffentliche Variable dieses Projekts; nur für anschließende echte Benutzer-RLS-Requests |
| `SUPABASE_DEV_SEED_APPROVER_ID` | Environment-Variable: UUID des bewusst freigebenden vorhandenen aktiven GLOBAL_ADMIN; privat aus dem Supabase-Dashboard übernehmen |
| `SUPABASE_DEV_SERVICE_ROLE_KEY` | Environment-**Secret**: serverseitiger Secret Key oder Legacy-Service-Role-Key ausschließlich dieses DEV-Projekts |
| `SUPABASE_DEV_TEST_PASSWORD` | Environment-**Secret**: gemeinsames selbst gewähltes Testpasswort; 12–128 Zeichen, zusätzlich tatsächliche Supabase-Passwortregeln |

Das Passwort hat **keinen** Default und wird nicht veröffentlicht. Bei strengeren
projektseitigen Regeln weist Auth die Anlage ausdrücklich ab; diese Regeln nicht abschalten.
Nur ein Publishable Key genügt nicht für die Auth Admin API. Der privilegierte Schlüssel
wird ausschließlich im manuellen Node-Schritt verwendet, nie als `NEXT_PUBLIC_*`, nie im
statischen Build, Browser, Artefakt oder Demo-Repository.

### Workflow nach bewusstem Merge starten

1. Prüfen, dass 009 im bestehenden Projekt installiert und die PR-Prüfungen erfolgreich sind.
   Das Seed-Skript migriert keine Datenbank und führt kein SQL über die Auth Admin API aus.
2. Nach manuellem Merge auf GitHub unter **Actions → Manually seed isolated Supabase DEV test users
   → Run workflow** den Branch **main** auswählen.
3. Zuerst `mode = check`, Projektbestätigung exakt `orxinqhhbtjpkzwlfaxq`.
   Dieser Lauf liest ausschließlich; er erzeugt auch keine Login-Sitzungen.
4. Bei freigegebenem Preflight erneut manuell starten, `mode = seed`, gleiche Projektbestätigung.
   Geschütztes Environment bewusst freigeben. Erwartung beim ersten vollständigen Lauf:
   sechs `Auth created`-/Validierungszeilen und `6 created; 0 existing and unchanged`.
5. Ein späterer Seed-Lauf muss `0 created; 6 existing and unchanged` melden.
   Bestehende Konten werden dabei **auch nicht angemeldet**, Passwörter werden nicht zurückgesetzt.
   Ein geändertes Passwort-Secret rotiert daher keine bestehenden Konten.

Kein `push`, `pull_request`, Zeitplan oder Merge löst den Seed aus. GitHub-Läufe nur aus diesem
Repository/Main; feste Environment-/Projektbestätigung, exakt gepinnter HTTPS-API-Host,
keine URL-Credentials/Queries/Pfade und keine HTTP-Weiterleitungen. Vor jedem Schreibschritt
werden die lokale Zielkonfiguration und serverseitig die Freigabe-/Neukonto-Invarianten geprüft.
Der Report-Projektwert ist eine feste **Policy-Bindung**, kein unabhängiger Management-API-Nachweis:
das tatsächliche Netzwerkziel wird durch den fest gepinnten Supabase-Projekthost bestimmt.
Reruns sind serialisiert; bei konkurrierender Kontoanlage wird abgebrochen, nicht übernommen.

`scripts/seed-dev-users.mjs` benutzt ausschließlich die offizielle SDK-Methode
`auth.admin.createUser({ email_confirm: true, ... })`. Der bestehende Auth-Trigger erzeugt
das Pending-Profil; das Seed-RPC initialisiert das zugehörige neue Profil, Mitgliedschaft,
MEMBER und gegebenenfalls scoped UNIT_ADMIN in einer Transaktion.
Keine SQL-Inserts nach `auth.users`, kein `signUp`, Invite, OTP, Reset oder Mail-Resend.
Die bestätigte E-Mail ist eine bewusste privilegierte DEV-Anlage, **kein** Nachweis eines
durchlaufenen Postfach-/Verifizierungsprozesses. Normale Registrierung bleibt unverändert.

Zwischen Anlagen/Neulogins liegt eine kurze Pause. Bei Rate Limit oder anderem Fehler:
sofortiger Abbruch, keine automatische Wiederholung und keine Ausgabe roher SDK-Fehler,
Requests, Passwörter, Keys oder Tokens. Auth-Anlage und anschließendes Fach-RPC sind
**keine verteilte Transaktion**: Schlägt die Initialisierung fehl oder ist der Ausgang unklar,
kann genau dieses neue Konto Pending bzw. bereits eingerichtet zurückbleiben. Keine automatische
Löschung, Passwortänderung oder Übernahme beim nächsten Lauf. `check` meldet Konflikte;
vor Fortsetzung privat prüfen und nötigenfalls ausschließlich dieses neue synthetische Konto
über die normale GLOBAL_ADMIN-Verwaltung korrekt freigeben/zuordnen. Keine fremden Bestandskonten reparieren.

### Lokaler, wiederholbarer Aufruf

Node 24 und gelockte Abhängigkeiten installieren. Dieselben nicht-geheimen Ziel-/Approver-Variablen
wie oben lokal setzen, zusätzlich `SUPABASE_DEV_SEED_ENVIRONMENT=isolated-dev` und
`SUPABASE_DEV_SEED_CONFIRM_PROJECT=orxinqhhbtjpkzwlfaxq`.
Secrets nur im aktuellen Prozess aus geschützter Eingabe übernehmen, zum Beispiel PowerShell:

```powershell
$key = Read-Host "DEV server secret key" -AsSecureString
$env:SUPABASE_DEV_SERVICE_ROLE_KEY = [Net.NetworkCredential]::new("", $key).Password
try {
  node scripts\seed-dev-users.mjs --check
  if ($LASTEXITCODE -ne 0) { throw "Preflight fehlgeschlagen" }
  $password = Read-Host "Gemeinsames DEV-Testpasswort" -AsSecureString
  $env:SUPABASE_DEV_TEST_PASSWORD = [Net.NetworkCredential]::new("", $password).Password
  node scripts\seed-dev-users.mjs --apply
  if ($LASTEXITCODE -ne 0) { throw "Seed unvollständig; privat prüfen" }
} finally {
  Remove-Item Env:\SUPABASE_DEV_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:\SUPABASE_DEV_TEST_PASSWORD -ErrorAction SilentlyContinue
  if ($key) { $key.Dispose() }
  if ($password) { $password.Dispose() }
}
```

Keine PowerShell-Transkription/Debug-HTTP-Protokollierung verwenden. Passwort nicht als
Befehlstext oder Default in `.env`, Repository oder Workflow-Input speichern.

### Anmeldung, Prüfung und sichere Außerbetriebnahme

Nach bestätigtem erfolgreichem Seed in der bestehenden DEV-Anwendung mit der jeweiligen
Feuerwehr-Testadresse aus der Tabelle und dem privat konfigurierten gemeinsamen Passwort
anmelden. Keine Bestätigungsmail oder zusätzliche Pending-Freigabe erforderlich.
Diese synthetischen Konten sind für die isolierte DEV-Umgebung bestimmt, niemals Produktion.

Neu angelegte Konten werden im Seed einmal mit **Publishable Key + eigenem echtem Benutzer-JWT**
angemeldet. Geprüft werden `ff_my_access`, tatsächliches Profil-SELECT unter RLS,
eigene/fremde Einheiten unter den sechs Testpersonen, MEMBER-Ablehnung bzw. scoped
UNIT_ADMIN-Zugriff auf `ff_members_workspace` sowie `ff_events_workspace` und verwaltbare
Einheiten. Danach lokale Abmeldung nur dieser neuen Sitzung. Keine Authentifizierung als
vorhandener GLOBAL_ADMIN und keine Mutation echter Bestandsmitglieder zu Testzwecken.
Vorhandene Personen erscheinen in der Administration weiterhin nur nach den bestehenden Regeln.

Bestehende historische Termin-Roster werden **nicht nachträglich erweitert**. Für eine
gemeinsame Teilnahmeabstimmung mit den neuen Konten einen neuen synthetischen Termin in
Scheuren anlegen; dessen Snapshot enthält dann die aktuellen freigegebenen Scheurener Mitglieder.

Automatisierung: `npm test` enthält zusätzliche vollständig simulierte Admin-API-/Fehler-/
Idempotenztests. `supabase/tests/dev-seed.sql` testet die echten Migrationen/RLS/RPCs,
Unit-Admin-Mitgliedschaftsänderungen, globale Sichtbarkeit und alle drei Schutzpfade des
letzten aktiven GLOBAL_ADMIN in PostgreSQL 17, ausschließlich in wegwerfbarer `ff_dev_ci`.
Dortige direkte Auth-Fixture-Inserts sind **kein** gehosteter Seed und verweigern andere
Datenbanknamen. Bestehende Termin-/Antwort-/Beginnsperren- und Browserregressionen bleiben erhalten.
Diese Prüfungen ersetzen nicht den späteren tatsächlich ausgeführten manuellen DEV-Workflow.

Lokal: 70 bestehende Fachtests plus zehn neue Seed-Tests, Typprüfung, vollständiges ESLint
und statischer Next.js-Export bestanden. Fehlendes SDK durch Wiederherstellung der gelockten
Abhängigkeiten behoben, ohne Lockfile-Änderung; eine gesperrte alte SWC-Binärdatei wurde nicht
gewaltsam entfernt und kein fremder Prozess beendet.
Die erste PR-Browser-CI meldete einen mehrdeutigen Testselektor: Erfolgsstatus der Erstellung
und laufender Ladehinweis waren gleichzeitig vorhanden. Der Selektor prüft jetzt gezielt den
Status mit der konkreten Erfolgsmeldung statt jedes beliebige `role=status`-Element.
Keine App-Funktion, Sicherheitsassertion, Axe-Regel oder Workflow-Schranke gelockert.

Zum sicheren Entfernen aus dem aktiven Betrieb: GLOBAL_ADMIN deaktiviert jedes ausdrücklich
identifizierte synthetische Konto über die normale Mitgliederverwaltung mit Grund, entzieht
zusätzliche UNIT_ADMIN-/Funktionsrollen und beendet die Einheit; Historie/Audit bleiben erhalten.
Vorher anhand UUID, Seed-Markierung und Zuordnungen prüfen, nicht allein anhand der E-Mail löschen.
Falls ein Konto inzwischen GLOBAL_ADMIN wurde, gelten unverändert die letzten-Admin-Schutzregeln.
Der Seed enthält absichtlich **keinen Löschmodus** und reaktiviert deaktivierte Testpersonen nicht.
Physische Auth-/Profil-Löschung ist wegen Referenzen/append-only Audit kein sicherer pauschaler
Cleanup: erst Aufbewahrung/Referenzen und Backup prüfen, gesonderten kontrollierten
Operatorvorgang planen. Niemals SQL-DML in `auth.users`, breite Löschlisten oder Bestandskonten
als vermeintliche Fixtures entfernen. Anschließend Seed-Secret/Passwort entfernen, sofern
keine weiteren Testläufe benötigt werden; ein erneuter Seed behebt keine manuell geänderten Konten.

## 14. DEV 0.3.2.1 – verständliche Rollenanzeige

Reine DEV-Oberflächenänderung auf Basis des Benutzermerges von PR #8.
`DEV_ROLE_LABELS` bildet technische Werte nur zur Darstellung ab:
GLOBAL_ADMIN → Globaler Administrator, UNIT_ADMIN → Einheitsführer,
MEMBER → Mitglied. Dieselbe Zuordnung gilt für Mitgliederverwaltung, Rollenauswahl,
Entfernen-Aktionen und DEV-Seitenkopf. Die bisherigen Demo-Bezeichnungen bleiben getrennt.

Zugewiesene Rollen erscheinen als grüne Karten mit Häkchen und „Zugewiesen“.
Die Auswahl zeigt den aktuellen serverseitig geladenen Zuweisungsstatus **für genau den
gewählten Einheits-/Funktionsbereich**: grün „Bereits zugewiesen“, sonst neutral
„Nicht zugewiesen“ oder „Rollenbereich auswählen“. Keine optimistische Rollenänderung
durch bloßes Auswählen. Nur die tatsächliche Entfernen-Aktion ist rot markiert.
Mitglied bleibt ausdrücklich die nicht einzeln entziehbare Basisrolle.

Bestehende Änderungsgrund-, Lade-/Sperr- und serverseitige Sicherheitsprüfungen,
technische Optionswerte sowie RPC-Payloads bleiben unverändert. Keine Supabase-Migration,
RLS-/RPC- oder Bestandsdatenänderung; keine Änderungen am separaten Demo-Repository.

Lokal bestanden: 81 Unit-Tests, Typprüfung, ESLint, Static Export und alle zwölf
synthetischen Auth-/Termin-/Mitglieder-Browserfälle. Der zusätzliche UI-Fall prüft
Labels, grüne/rote tatsächliche Farbwerte, neutrale nicht zugewiesene Bereiche,
unverändert erforderlichen Änderungsgrund und schreibfreie Auswahl bei 390/1366px
in Light/Dark sowie vollständige Axe-Prüfung. Dies sind abgefangene Protokollfixtures,
keine Änderungen an vorhandenen Supabase-Mitgliedschaften.

## Quellen

- [Supabase Passwortauthentifizierung](https://supabase.com/docs/guides/auth/passwords)
- [PKCE und gleicher Browser](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [DEV-Mailversand und SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks)
- [Before User Created](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)
- [Projektgebundenes Read-only-MCP](https://supabase.com/docs/guides/ai-tools/mcp)
- [API Keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
