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
| Autorisierte Supabase-Verbindung | Keine verfügbare Supabase-Integration, CLI oder Management-Token-Umgebungsvariable. Connector-Katalog lieferte eine unpassende Vercel-Integration; nicht angeboten oder verbunden. |
| Projektstatus/Datenbank/Auth/API | **Nicht remote geprüft.** Project Ref, URL, Schlüssel, tatsächliche PostgreSQL-Version, Tabellenbestand, Hook, Verifizierung, Redirects, Mail-Empfänger/Limits und Security Advisor sind weiterhin offen. |
| GitHub-Konfiguration | Bei Bestandsaufnahme keine Repository-Variablen vorhanden. Keine Schlüssel/Secrets oder Dashboard-Einstellungen gesetzt. |
| In diesem Auftrag geändert | Nur dieses Repository/Feature-Branch: SDK, statischer PKCE-Callback, Login/Signup/Pending/Freigabe, RLS-Leseadapter, Migration 005, Preflight, Tests, Actions und Dokumentation. |
| Im Supabase-Projekt geändert | **Nichts.** Keine Migration, kein Testkonto, keine Mail, kein Bootstrap, keine Planänderung. |
| Unabhängige Demo | `n00b31/feuerwehr-odenthal-demo` bleibt unverändert. Kein Codeimport, Build-Download, Datenzugriff oder Deployment aus diesem Repository dorthin. |

Die öffentliche DEV-URL wird erst nach einem bewusst freigegebenen Main-Merge neu veröffentlicht.
Ein Feature-Branch/PR veröffentlicht weder Pages noch Datenbankänderungen.

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

Alle Werte in dieser Tabelle sind **erforderliche Sollwerte**, nicht remote bestätigter Ist-Zustand.

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

### Integrierter E-Mail-Versand

Standard-Supabase-Mail ist keine produktive Versandlösung. Laut Supabase-Dokumentation werden
ohne eigenes SMTP nur Adressen aus dem Supabase-Organisationsteam angeschrieben; das dokumentierte
Standardlimit liegt bei **2 Nachrichten/Stunde** und kann sich ändern. Die tatsächlichen Limits
des bestehenden Projekts wurden nicht geprüft.

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

**Jetzt im DEV-UI angebunden:** Auth, Pending-/Sperrstatus, Global-Admin-Freigabe mit Einheit,
sichtbare Termine, Dokumentbereiche, eigene bestätigte Teilnahmen/Stunden und Profil.
Anwesenheit zählt nur mit Listenbestätigung; unbekannt ist nicht abwesend.

**Noch nicht im DEV-UI angebunden:** vollständige Termin-/Serienverwaltung, Rückmeldungsschaltflächen,
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

| Prüfung | Automatisiert | Reale DEV-Abnahme noch erforderlich |
|---|---|---|
| Registrierung | Exakte Domain/Passwort/Name; SDK-Signup-Payload ohne Rollen. | Autorisierte Testadresse, Auth-Hook und echte Mailzustellung. |
| E-Mail | Synthetischer PKCE-Codeaustausch, Callback statisch erreichbar, URL bereinigt, kein fremdes `next`, Fehler/Wiederholung. | Echter Bestätigungslink im selben Browser, abgelaufener/zweiter Link, anderer Browser. |
| Pending | Kein geschützter Request vor Freigabe, auch direkte Unterseiten bleiben gesperrt. SQL prüft fehlende Verifizierung und Metadaten-Eskalation. | Echte User-Tokens gegen REST: keine fremden oder geschützten Zeilen. |
| Freigabe | Global-Admin wählt Einheit, unbestätigt/ohne Auswahl gesperrt; RPC-Argumente geprüft. SQL schützt Rechte und letzten Admin. | Bootstrap und Freigabe durch zwei getrennte echte Testkonten/Browser. |
| Erneute Anmeldung | Vollständiger Browserablauf Signup → Bestätigung → Pending → Admin → Freigabe → Logout → Mitgliedlogin → RLS-Datenansicht. | Derselbe Ablauf mit echtem Auth-/Mail-/PostgREST-Gateway. |
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

## 9. Noch offen / nächste Entwicklungsschritte

- Autorisierte Verbindung und echte Projektkonfiguration, kontrollierte Migration, Mail-/API-Abnahme.
- Vollständige Backend-CRUD-/Serien-/Mitgliedschafts-RPCs und dazugehörige UI-Adapter.
- Vollständige DEV-Anwesenheits-/Delegations- und Antwort-Oberfläche mit vorhandenen RPCs.
- Passwort-Reset, Admin-MFA, SMTP, Recovery/Backups, Datenschutz/Retention und unabhängige Audit-Aufbewahrung.
- Rechtliche Revisionssicherheit wird nicht allein durch SQL-Trigger/RLS garantiert: DB-Owner können
  administrative Schutzmechanismen ändern. Betriebs- und Aufbewahrungskonzept fehlen.
- Kein automatischer Merge, keine produktive Freischaltung und kein Eingriff in das unabhängige Demo-Repository.

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
