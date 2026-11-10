# DEV 0.7 – Organisatorische Benachrichtigungen

**Keine Alarmierung:** Diese Funktion ersetzt weder aPager noch die offizielle
Feuerwehralarmierung. Zustellung ist browser-, geräte- und netzabhängig.
Die unabhängige Demo wird nicht verändert.

**Aktueller Abnahmestand:** PR #24 ist gemergt; iPhone-Aktivierung und
tatsächlicher Empfang sind durch den Projektverantwortlichen bestätigt.
Desktop-Push bleibt offen. Der nachfolgende DEV-0.7-Installationsbericht
ist historisch; die aktuelle Eingrenzung und der Hotfix stehen unter
[DEV 0.7.1](#dev-071--edge-registrierung-und-fehlerdiagnose).

## Analyse und Implementierungsplan

Der bestehende Service Worker `public/sw.js` wird erweitert, nicht ersetzt.
Seine Offline-Fallbacks, unterpfadbezogenen Caches und explizit bestätigten
PWA-Updates bleiben erhalten. GitHub Pages bleibt ein Static Export;
privilegierte Versandoperationen laufen ausschließlich serverseitig.

Es existiert bereits `public.vehicle_notifications`, mit eigenem Postfach,
RLS und Gelesen-Markierung im Fahrzeugmodul. Diese Tabelle wird **additiv
zum zentralen Empfängermodell erweitert**, nicht durch eine zweite Inbox
ersetzt. Alte Datensätze, IDs, Lesestatus und Fahrzeug-RPCs bleiben erhalten.
Das Fahrzeugmodul zeigt weiterhin seine bestehende gefilterte Ansicht.

Implementierungsreihenfolge:

1. Additives zentrales Modell, eigene Einstellungen und geschützte Geräte.
2. Transaktionale fachliche Outbox; Erstellung/Änderung/Absage und bestehende
   Fahrzeugbenachrichtigungen anbinden. Dynamische Mitgliedschaften und
   bestehende Berechtigungshelfer wiederverwenden.
3. Begrenzter, wiederholbarer Erinnerungsjob und geleaste Versandaufträge.
4. Geschützte Supabase Edge Function mit VAPID, begrenzten Wiederholungen,
   serverseitiger Empfängerprüfung und abgeschirmten Fehlerprotokollen.
5. Freiwillige Profil-Einrichtung, zentrale Inbox und sichere Direktnavigation.
6. Bestehenden Worker um Push/Click/Deduplizierung erweitern, ohne ein
   bereits geöffnetes Formular durch erzwungene Navigation zu verwerfen.
7. Isolierte PostgreSQL-, Transport-, Browser- und bestehende Regressionstests.
8. Erst danach kontrollierte DEV-Installation, Secret-Provisionierung,
   Edge-Deployment, Zustandsprüfung und PR ohne automatischen Merge.

## Sicherheitsentscheidungen

- Berechtigungsdialog ausschließlich durch direkten Klick, nie beim Laden.
  Feature Detection für Service Worker, Notification und PushManager.
  Fehlende Unterstützung sperrt die Inbox nicht.
- iPhone: Web Push setzt eine geeignete installierte Home-Screen-Web-App
  voraus. Eine Installationsanleitung wird angeboten; Browsernamen sind
  keine Berechtigungsprüfung.
- Öffentliche VAPID-Schlüssel dürfen zum Client. Private Schlüssel und
  Cron-Autorisierung ausschließlich in Supabase-Secrets beziehungsweise
  Vault; keine privaten Schlüssel in Migrationen oder statischem Export.
- Browser dürfen nur eigene Abonnements registrieren/deaktivieren.
  Endpoints und Subscription-Schlüssel erscheinen weder in Geräteübersichten
  noch in administrativen Versandprotokollen.
- Nur bekannte HTTPS-Push-Provider werden als Versandziele akzeptiert;
  keine frei wählbaren URLs, Weiterleitungen oder internen Netzwerkziele.
- Push-Payloads sind generisch: keine Namen, Termine, Einheiten, Zwecke,
  Ablehnungsgründe oder andere fachliche Inhalte auf dem Sperrbildschirm.
  Details werden erst nach Anmeldung und erneuter RLS-/RPC-Prüfung geladen.
- Fachliches Ereignis, Empfänger-Inbox und Versandkanal sind getrennt.
  E-Mail kann später als Kanal ergänzt werden, wird jetzt nicht versandt.
- Versandbestätigung bedeutet Annahme durch den Push-Dienst, nicht
  nachgewiesenen Empfang, Anzeige oder Kenntnisnahme auf einem Gerät.
- Absolut genau-einmalige HTTP-Zustellung ist bei Verbindungsabbrüchen
  nicht beweisbar. Stabile Auftrags-IDs/Topics, atomare Leases, begrenzte
  Wiederholungen und Worker-Deduplizierung verhindern doppelte Anzeigen.
  Diese Grenze wird nicht als Exactly-once-Garantie verkauft.
- Keine rückwirkenden Massenmitteilungen: fachliche Outbox ab Installation,
  zeitgesteuerte Erinnerungen erst ab Aktivierungszeitpunkt. Keine Test-Pushs
  ohne ausdrückliche Aktion des angemeldeten Empfängers.

## Reale Geräteabnahme

Noch nicht durchgeführt. Automatisierte oder emulierte Tests sind keine
reale iPhone-/Android-/Desktop-Abnahme. Die vom Auftrag beschriebenen
Aktivierungs-, Zustellungs-, Navigations-, Deaktivierungs- und Regressionstests
werden mit autorisierten vorhandenen DEV-Konten vorbereitet; tatsächliche
Ergebnisse sind separat zu dokumentieren.

## Implementierter Stand

Migration `20261109003600_notifications.sql` erweitert die vorhandene Inbox.
Die additive Migration `20261109003700_notification_safe_updates.sql`
ergänzt explizite Singleton-Prädikate für Bootstrap/Konfiguration: Hosted
PostgREST verwendet `safeupdate`, anders als normales PostgreSQL. Die
Schutzfunktion bleibt aktiviert; Migration 036 wird nicht nachträglich geändert.
Neue Tabellen: `notification_preferences`, `push_subscriptions` sowie die
privaten Konfigurations-, Ereignis-, Zustellungs- und Versuchstabellen.
Originale Fahrzeugnachrichten behalten IDs, Fremdschlüssel und Lesestatus.
Ein gerichteter Upgrade-Test vergleicht jeden ursprünglichen Spaltenwert,
einschließlich Auth-Konten und historischer Anwesenheiten.

Eine transaktionale Outbox erfasst neue Übungsdienste, materielle Änderungen,
Absagen und neue Registrierungen. Ein begrenzter Hintergrundlauf prüft
verifizierte Registrierungen und die aktuell gültigen Mitgliedschaften und
Berechtigungen. Fahrzeuganfragen verwenden weiterhin die bestehenden
Fahrzeugfunktionen: Anfragen an berechtigte Genehmiger, Genehmigung/Ablehnung
als Push nur an den Antragsteller, Stornierungen an berechtigte Betroffene.
Bestehende interne Bestätigungen bleiben In-App verfügbar.

Erinnerungen: 48 Stunden bei fehlender Rückmeldung, 24 Stunden vor
Übungsdiensten, freiwillig zusätzlich zwei Stunden sowie nach Dienstende
bei nicht abgeschlossenen oder noch nicht initialisierten Anwesenheitslisten.
Abgesagte, beantwortete, abgeschlossene, veraltete oder nicht mehr berechtigte
Vorgänge werden vor Materialisierung und Versand erneut geprüft.
Zeitabstände sind verstrichene Stunden; Anzeige in `Europe/Berlin`.
Epoch-basierte Schlüssel bleiben auch beim Zeitzonenwechsel idempotent.

Profil: zentrale Inbox, exakter berechtigter Ungelesen-Zähler, Einzel-/Alle-
Gelesen-Markierung, sechs Kategorien, freiwillige Push-Aktivierung und
mehrere eigene Geräte. Maximal zehn aktive Geräte; fremde Endpoints oder
Schlüssel sind auch für andere angemeldete Benutzer nicht lesbar.
Die Profilansicht aktualisiert bei Fokus, eigenen Änderungen und bei
sichtbarem Fenster einmal pro Minute; keine permanente globale Abfrage.
Ungespeicherte Einstellungen bleiben bei Hintergrundaktualisierungen erhalten.

Aktivierung erfordert einen bewussten Klick. Ablehnung wird nicht erneut
abgefragt. Beim Abmelden wird das aktuelle eigene Gerät zuerst serverseitig
deaktiviert und lokal abgemeldet; Fehler werden angezeigt, verhindern aber
nicht die eigentliche Abmeldung. Der DEV-Test betrifft ausschließlich das
ausgewählte eigene Gerät: einmal pro Minute, maximal dreimal pro Stunde.

`public/sw.js` bleibt der einzige Worker. Bestehende Update-Zustimmung,
Versionsprüfung, Cache-Grenzen und Offline-Fallback bleiben erhalten.
Push enthält ausschließlich Format und opake UUIDs. Deduplizierung:
stabiler Provider-Topic, Browser-Tag sowie bis zu 500 opake Zustellungs-IDs
für maximal 30 Tage in einer app-spezifischen IndexedDB.
Bei Speicherausfall wird ein sachlicher Fehlercode protokolliert; der
Browser-Tag bleibt aktiv, eine absolute Neustart-Deduplizierung ist dann
nicht beweisbar.

Ein vorhandenes App-Fenster wird fokussiert, nicht umgeladen. Erst ein
bewusster Klick öffnet den neu autorisierten Vorgang. Ein Kaltstart führt
über `profil/?notification=<UUID>`; Anmeldung und Freigabe bleiben zwingend.
Eine während der Abmeldung empfangene Nachricht wartet ebenfalls auf die
Anmeldung. Fachliche Daten werden niemals aus dem Push-Payload übernommen.

## Versand und Betrieb

`push-dispatch` ist eine separate fachliche Edge Function; die vorhandene
Passwortwiederherstellung wird nicht umgebaut oder mit Push gekoppelt.
Sie prüft Auth selbst: Testaktionen anhand des echten Supabase-Benutzers,
Wartungsaktionen anhand eines konstantzeitlich verglichenen Cron-Secrets.
`verify_jwt=false` ist deshalb keine öffentliche Versandfreigabe.
Zusätzlich sind alle Tick-/Claim-/Complete-/Bootstrap-RPCs ausschließlich
für `service_role` ausführbar.

VAPID und `aes128gcm` verwenden das fest gepinnte `web-push@3.6.7`.
Ein Transporttest verschlüsselt und entschlüsselt mit kurzlebigen
synthetischen Schlüsseln, ohne einen Push-Anbieter zu kontaktieren.
Beim echten Edge-Kaltstart wird ebenfalls nur lokal eine verschlüsselte
Probe erzeugt. Erst danach wird die serverseitige Bereitschaft bestätigt.

Grenzen: 50 tatsächliche Versandversuche pro Minute projektweit, zehn pro
Stunde pro Konto über Geräte und Wiederholungen hinweg, höchstens fünf
Versuche pro Auftrag. Atomare Leases, eigene Versuchstabelle und zwei echte
parallele Datenbankverbindungen prüfen gegen doppelte Claims.
Temporäre Netzwerk-/429-/5xx-Fehler werden verzögert wiederholt;
404/410 deaktiviert das Gerät. Andere Fehler enden kontrolliert.
Keine Providerantworten, Endpoints, Schlüssel oder Tokens im Audit/Fehlerlog.
Administrative Diagnosen sind global beziehungsweise einheitsbezogen
autorisiert; FIRE_CHIEF erhält keine technischen Administratorrechte.

Pro Tick werden höchstens 100 neue fällige Erinnerungen und 100 offene
Anwesenheitsereignisse vorgemerkt und 20 fachliche Ereignisse verarbeitet.
Pro Edge-Lauf höchstens fünf Batches zu zehn Aufträgen mit vier parallelen
Transporten und begrenzter Laufzeit. Größere Mengen bleiben in der Queue.

### Kontrollierte Einrichtung ausschließlich in Supabase DEV

1. Projekt-URL unabhängig als
   `https://orxinqhhbtjpkzwlfaxq.supabase.co` verifizieren. Migrationen,
   vorhandene Erweiterungen, Originaldaten und Berechtigungen inventarisieren.
2. Isolierte SQL-/RLS-/Upgrade-/Parallelitäts- und Transporttests abwarten.
   Migration 036 nur gegen den geprüften 035-Stand anwenden; Originalwerte,
   Auth, ursprüngliche Funktionen und Berechtigungen transaktional vergleichen.
   Anschließend die additive Safeupdate-Korrektur 037 mit unveränderten
   Daten und RPC-ACLs installieren.
3. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\configure-dev-push.ps1` mit autorisierter
   Supabase-CLI-Sitzung ausführen. Das Skript ist auf DEV festgelegt.
   Es legt `FF_VAPID_PUBLIC_KEY`, `FF_VAPID_PRIVATE_KEY` und
   `FF_PUSH_CRON_SECRET` an. Ein bereits vollständiger Satz wird nicht rotiert;
   ein Teilbestand führt zum Abbruch. Temporäre Secret-Dateien entstehen
   ausschließlich außerhalb des Repositorys mit benutzerspezifischer Windows-
   ACL und werden im `finally` entfernt. Keine Secret-Werte    in Ausgaben. Die Ausführungsrichtlinie gilt nur für diesen Prozess,
   keine gespeicherte Windows-Richtlinie wird geändert.
4. Ausschließlich `push-dispatch` mit der gepinnten Supabase CLI bereitstellen:
   `npx supabase@2.122.1 functions deploy push-dispatch --project-ref orxinqhhbtjpkzwlfaxq --no-verify-jwt --use-api`.
   Ein nicht autorisierter Probeaufruf darf keinen Versand auslösen.
   Den erfolgreichen Crypto-/Bootstrap-Status unabhängig aus der DB prüfen.
5. `supabase/operations/notification-scheduler.sql` als getrennte,
   registrierte Hosted-Operation anwenden. Sie benötigt Supabase Vault,
   `pg_cron` und `http`; der normale PostgreSQL-CI-Test installiert keine
   Supabase-spezifischen Erweiterungen. Genau ein Job
   `ff-notifications-dev` läuft minütlich. Ein vorhandener gleichnamiger Job
   führt zum Abbruch, nicht zu Überschreiben oder Verdoppelung.
   Die HTTP-Erweiterung liegt im nicht zugänglichen Schema
   `ff_push_transport`, nicht im öffentlichen API-Schema. Ausschließlich
   der private Cron-Job wartet auf die kurze HTTP-202-Annahme; eigentlicher
   Versand bleibt asynchron in der Edge Function. Die installierte
   HTTP-Erweiterung 1.6 verwendet ihr natives Fünf-Sekunden-Timeout.
6. Konfiguration, RPC-ACLs, genau einen Cron-Job, dessen Ausführungsstatus und
   die geschützte HTTP-Antwort kontrollieren, ohne Vault-Werte auszulesen.
   Keine Testgeräte oder echten Testmitteilungen ungefragt erzeugen.

Die Datenbank enthält nur den öffentlichen VAPID-Schlüssel. Der private
VAPID-Schlüssel bleibt in Edge-Secrets; Cron-Autorisierung zusätzlich in
Vault. Neue VAPID-Schlüssel verlangen eine explizite Rotationsentscheidung
und erneute Geräteanmeldung. Kein privater Schlüssel wird aus Supabase
zurückgelesen. Der Static-Export-Scanner weist serverseitige Push-
Konfiguration, private PEM-Schlüssel, Service-Role-JWTs, Secret-Key-Formate
und synthetische CI-Konfiguration zurück.

### Grenzen

Keine Alarmierung, garantierte Sofortzustellung oder Exactly-once-HTTP-
Garantie. Providerannahme ist keine Geräteanzeige. iPhone/iPad benötigt
eine unterstützte installierte Home-Screen-PWA; Android/Desktop benötigen
einen unterstützten Browser, sichere Verbindung und Systemfreigabe.
Nicht unterstützte oder blockierte Geräte behalten die In-App-Inbox.

Keine zusätzlichen kostenpflichtigen Versanddienste, kein E-Mail-Versand,
keine Ruhezeiten und kein allgemeiner Nachrichten-Editor. Die Kategorie
„Allgemeine Informationen“ und der E-Mail-Kanal sind nur vorbereitet.
Keine rückwirkende Massenbenachrichtigung alter Termine oder Registrierungen.
Profilliste und Admin-Diagnose zeigen höchstens 100 Einträge; der
Ungelesen-Zähler erfasst auch ältere berechtigte Nachrichten.
Aufbewahrung/Löschung von dauerhaften fachlichen und Versandprotokollen
ist vor einem produktiven Betrieb organisatorisch festzulegen; kein
ungefragtes Löschen bestehender Historie.

## Automatisierte Nachweise

| Anforderung aus B18 | Nachweis |
|---|---|
| 1–3 Aktivierung, Deaktivierung, Benutzeraktion | `supabase-notifications.spec.ts`: echte Klick-/User-Activation-Prüfung mit synthetischer Browser-Push-API |
| 4–6 mehrere Geräte, Isolation, ungültige Geräte | `notifications.sql`: eigener/zweiter/fremder Endpoint, RLS/Spaltengrants und 410 |
| 7 kein privater Schlüssel im Export | `release.test.mjs`, `check-dev-export.mjs`, getrennte Edge-Secrets |
| 8–12 Übungsdienst, Änderung, Absage, fehlende Antwort | `notifications.sql`: fachliche Outbox, Fälligkeit, beantwortete Personen, Wiederholung |
| 13–15 Fahrzeuganfrage, Genehmigung, Ablehnung | `vehicles.sql`: bestehende RPCs mit neuem Empfänger-/Ereignistyp |
| 16 verifizierte Registrierung | `notifications.sql`: zunächst unverifiziert, später verifiziert, nur GLOBAL_ADMIN |
| 17–18 Anwesenheit | `notifications.sql`: berechtigte Leiter/Delegierte, abgeschlossene Liste ausgeschlossen |
| 19 keine doppelten Cron-/Versandaufträge | `notifications.sql`, `notification-concurrency.sh`: Zeitzonenwechsel und echte konkurrierende Claims |
| 20–21 Fehler und Wiederholungen | SQL-/Handler-Tests: Lease, 429/5xx/410, Grenzen zählen tatsächliche Versuche |
| 22–24 Navigation, RLS und Fallback | Browser-/Worker-Tests: Kaltstart über Login, warmes Fenster mit Entwurf, Rechteentzug, nicht unterstütztes Push |
| 25–27 Darstellung und PWA-Updates | Light-/Dark-Axe-Prüfung, vorhandene UI-Regressionsfälle, acht Worker-Tests |
| 28–31 Fachmodule | vollständige bestehende DEV-/Demo-Browserfälle sowie SQL-/RLS-/Parallelitätstests |
| 32 Static Export | Next-Static-Export, Pages-Unterpfad, separater echter DEV-Export mit Scanner |

Alle Browser-Push-/API-Fälle sind abgefangene synthetische Protokolltests.
SQL-Fachtests laufen ausschließlich in `ff_dev_ci`, nicht auf Hosted DEV.
Die Transportprüfung versendet keine Nachricht. Diese Nachweise belegen
keine tatsächliche native Push-Anzeige.

## Manuelle DEV-Abnahme A–G

Status aller folgenden Zeilen: **offen**, erst nach manuellem Merge und
verifiziertem Pages-Deployment mit ausdrücklich autorisierten Konten.

| Test | Durchführung / zu protokollierender Nachweis |
|---|---|
| A Aktivierung | MEMBER: Profil öffnen; vor Klick kein Dialog; Aktivierung/Freigabe; eigenes aktives Gerät und unveränderte Auth-Freigabe |
| B eigener DEV-Test | Nur eigenes Gerät auswählen; einmal auslösen; tatsächliche Anzeige und bewusste Direktnavigation prüfen |
| C Übungsdienst | Berechtigten Dienst neu anlegen/ändern/absagen; richtige Empfänger, Kategorien und In-App-Nachricht prüfen |
| D Fahrzeug | MEMBER-Anfrage → zuständiger Verwalter; Genehmigung/Ablehnung → Antragsteller; Stornierung und Kalender prüfen |
| E Administration | Autorisierte verifizierte Testregistrierung → GLOBAL_ADMIN; Dienst nach Ende ohne Abschluss → berechtigter Leiter/Delegierter, danach abschließen |
| F Geräte | Je iPhone-Home-Screen-PWA, Android und Desktop: System-/Browserversion, Aktivierung, echte Anzeige, warmes/kaltes Öffnen und Deaktivierung festhalten |
| G Regression | Termine, Teilnahme, Anwesenheit, Dienstbuch, Fahrzeugverwaltung, Benutzerverwaltung, Dashboard und bestätigtes PWA-Update |

Je Fall Datum, DEV-Build-ID, Rolle, Gerät/Browser und tatsächliches Ergebnis
eintragen. Keine Passwörter, Subscription-Endpunkte, Schlüssel oder Tokens
in Abnahmeprotokolle übernehmen.

## Tatsächlich installierter DEV-Stand vom 09.11.2026

Nach den abgebrochenen MCP-Bestätigungen erfolgte die Installation mit
ausdrücklicher Freigabe über die angemeldete, auf DEV festgelegte Supabase
CLI. Alle Installationsschritte prüften Originaldaten, Auth und
Berechtigungen innerhalb ihrer Transaktion; Abweichungen hätten vollständig
zurückgerollt. Migration 036 entspricht der erfolgreich geprüften CI-Quelle.

| Registry-Eintrag | Version | SHA-256 der normalisierten Quelldatei |
|---|---|---|
| `ff_036_notifications` | `20261109214440` | `813636138aade746f61144a0736993c1afdf7efb1e4a1995934232e6a1399a41` |
| `ff_037_notification_safe_updates` | `20261109215249` | `6fa45d89125c1cb55b5922aae83fbd0d3e5b6ff99532f47e65b1f45f171afd92` |
| `ff_038_notification_scheduler` | `20261109220410` | `7e5562a24c874717ddedc08a12860bae72d72420f9e432ba418094c150fcb27e` |

038 ist bewusst die separate Datei
`supabase/operations/notification-scheduler.sql`, keine auf einfachem
PostgreSQL ausführbare Erweiterungsmigration.

Der tatsächliche Plattformtest zeigte, dass `pg_net`-Objekte dem
`supabase_admin` gehören und ihre Standardrechte vom normalen
Migrationsbenutzer nicht zuverlässig entzogen werden können. Eine
Credential-haltige HTTP-Queue wurde deshalb **nicht** installiert.
Fehlgeschlagene Isolationsprüfungen wurden transaktional zurückgerollt.
Stattdessen verwendet der Job die nicht öffentlich zugängliche
HTTP-Erweiterung ohne persistierte Request-Queue. `pg_net` ist nicht installiert.

Verifizierte Betriebsnachweise:

- `push-dispatch`, Version 2, aktiv; vorhandene `password-recovery`, Version 2,
  unverändert. Tatsächlicher Edge-Crypto-/Vault-Bootstrap erfolgreich.
- Nicht autorisierter Dispatcher-Aufruf: **HTTP 401**.
  Autorisierter privater Scheduler-Aufruf: **HTTP 202**.
- Genau ein aktiver minütlicher Job `ff-notifications-dev`, ID 1.
  Erste automatische Ausführung am 09.11.2026 um 22:05 UTC: **succeeded**.
- Keine Schema-Nutzung für `anon`/`authenticated` auf `ff_push_transport`,
  keine Browserausführung des Cron-Helfers oder der Service-Versand-RPCs.
  Subscription-Endpoints und Auth-Schlüssel nicht per Spaltengrant lesbar.
- 11 Auth-Konten, 61 Profile, 295 Termine und 53 ursprüngliche In-App-
  Nachrichten unverändert; **null Geräte, null Versandaufträge, null
  Versandversuche** bei der Betriebsprüfung.
- Drei serverseitige Push-Secrets eingerichtet; Wiederholung bestätigt
  Wiederverwendung ohne Rotation. Geschützte temporäre Dateien entfernt.
- **Keine echten Test-Pushs oder Testmails versandt.** Keine bestehenden
  Konten oder Passwörter geändert; unabhängiges Demo-Repository unverändert.

Automatisierter Stand: 183 Domain/Auth/Konfigurationstests, 24 Skripttests,
111 synthetische DEV-Browserfälle einschließlich zehn neuer
Benachrichtigungsfälle sowie die bestehenden 19 Demo-Browserfälle.
Isolierte PostgreSQL-/RLS-/Upgrade-/Parallelitäts- und tatsächliche
VAPID/aes128gcm-Transporttests erfolgreich. Ein anfänglicher Pages-Lauf
nahm die neuen DEV-Fälle versehentlich auch in den Demo-Runner auf;
die Runner-Auswahl wurde wie bei den bestehenden DEV-Suiten getrennt.
Typecheck erfolgreich; Lint ohne Fehler mit der bestehenden
`supabase-planning.tsx`-Warnung.

PR: [#24](https://github.com/n00b31/feuerwehr-odenthal-app/pull/24).
Kein automatischer Merge. Die öffentliche DEV-Oberfläche bleibt bis zum
manuellen Merge/Pages-Deployment auf DEV 0.6.4.1.

Referenzen:
[Supabase Cron](https://supabase.com/docs/guides/functions/schedule-functions),
[Web Push auf iOS](https://webkit.org/blog/13966/web-push-for-web-apps-on-ios-and-ipados/),
[Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API).

## DEV 0.7.1 – Edge-Registrierung und Fehlerdiagnose

### Bestätigte Abnahme und Fehlerstelle

PR #24 wurde am 09.11.2026 auf Main-Commit
`8d4167f26da39952d1f450e776842e1435062417` gemergt.
Der Projektverantwortliche bestätigt erfolgreiche Aktivierung und
tatsächlichen Push-Empfang auf der iPhone-PWA. **Das ist keine vollständige
DEV-0.7-Abnahme. Desktop bleibt offen; DEV 0.8 wird nicht begonnen.**

Die vom Projektverantwortlichen am 10.11.2026 übermittelte, schlüsselfreie
Diagnose aus seinem **normalen Edge-Fenster** zeigt:

| Schritt | Tatsächlicher Befund |
|---|---|
| `Notification.permission` | `granted` |
| `getRegistration()` | Registrierung vorhanden, aktiver Worker |
| `getSubscription()` | erfolgreich, kein bestehendes Abonnement |
| `subscribe()` | `AbortError`, Dienst-/Netzwerkhinweis; kein Berechtigungs- oder Schlüsselhinweis |

Damit scheitert der Browser **vor** einer neuen Subscription und vor
`ff_push_register`. Der Fehler dieses Versuchs entsteht nicht durch das
Speichern einer Subscription, die Supabase-Rollenprüfung oder RLS.
Eine erfolgreiche Website-Berechtigung ist nicht gleichbedeutend mit einer
erfolgreichen Anmeldung beim browserseitigen Push-Dienst.

Die Anwendung verschluckte bisher die konkrete Ausnahme und ersetzte sie
durch dieselbe Sammelmeldung wie eine fehlgeschlagene Backend-Berechtigung.
Das ist der nachgewiesene App-Fehler, der mit DEV 0.7.1 korrigiert wird.
**Der konkrete Netzwerk-, Dienst- oder Richtlinienauslöser auf dem
betroffenen Laptop ist mit diesem Trace noch nicht bewiesen.**
Es wird weder behauptet, dass ein Frontend-Patch Windows-/Proxy-Richtlinien
reparieren könne, noch wird eine erfolgreiche Desktop-Zustellung behauptet.

Ergänzende isolierte Untersuchung am 09.11.2026: Ein sichtbarer nativer
Edge 155.0.4283.60 konnte im temporären normalen, persistenten Profil mit
dem unveränderten öffentlichen DEV-VAPID-Schlüssel ein echtes
WNS-Abonnement erstellen. Es wurde sofort wieder abgemeldet; kein Backend-
Datensatz und keine Push-Nachricht wurden dafür erzeugt. Dagegen wies ein
isolierter InPrivate-Kontext trotz künstlich gewährter Notification-
Berechtigung `subscribe()` zurück. **InPrivate erklärt nicht den
gemeldeten Fehler**, da der Projektverantwortliche ein normales Fenster
bestätigt hat. Beide Untersuchungen sind keine End-to-End-Abnahme seines
normalen Edge-Profils. Der erfolgreiche normale Versuch widerlegt jedoch
eine pauschale Unverträglichkeit der bisherigen ArrayBuffer-Konvertierung
oder des unveränderten öffentlichen Schlüssels mit Edge.

Am 10.11.2026 gelang außerdem auf dem tatsächlichen öffentlichen
DEV-Ursprung ein nativer Versuch mit einem weiteren temporären normalen
Edge-Profil: WNS-Subscription erstellt und unmittelbar erfolgreich
abgemeldet, unveränderter öffentlicher DEV-Schlüssel. Supabase-Anfragen
waren in diesem Versuch blockiert; keine Backend-Registrierung und keine
Nachricht wurden erzeugt. Eine vorherige unbeschränkte Diagnose wurde
beendet, nachdem sie hängen blieb; nur der instrumentierte, zeitlich
begrenzte Wiederholungsversuch lieferte diesen Erfolgsnachweis.
Auch dieser kontrollierte Versuch ersetzt nicht das betroffene Profil:
Der Projektverantwortliche meldet weiterhin einen Fehler nach erteilter
Berechtigung, auch mit einem zusätzlichen normalen Profil.

### Korrektur ohne Datenbank- oder Versandänderung

- Eigene Fehlercodes für fehlende Unterstützung, blockierte/fehlende
  Berechtigung, nicht aktivierten Worker, Subscription-Abfrage,
  ungültigen öffentlichen Schlüssel, Dienst-/Erstellungsfehler,
  Backend-Registrierung und fehlgeschlagene lokale Bereinigung.
- `AbortError` bei weiterhin erteilter Berechtigung erhält
  `push_service_failed`, eine verständliche Erklärung und Hinweise auf
  Browser-Neustart beziehungsweise die Prüfung von Netzwerk, Proxy/VPN
  und Browser-/Windows-Richtlinien. Kein wiederholter Berechtigungsdialog
  und kein automatisches Wiederholen oder Abschalten von Sicherheitsregeln.
- Die Konsole erhält nur `FF_PUSH_DIAG`, den festen Diagnosecode und einen
  freigegebenen Exception-Namen. Kein rohes Error-Objekt, Meldungstext,
  Subscription-JSON, vollständiger Endpoint, Schlüssel oder Token.
- Fehler bei der lokalen Subscription-Abfrage lassen die zentral geladene
  Inbox verfügbar. Ein erfolgreicher Hintergrundabruf verwirft nicht die
  Diagnose einer fehlgeschlagenen Aktivierung.
- Die Anzeige unterscheidet „Nicht aktiviert · Browserberechtigung erteilt“
  von einer bestätigten aktiven Geräteregistrierung.
- Passende bestehende Subscriptions werden wiederverwendet. Ein anderer
  gespeicherter öffentlicher Schlüssel wird erkannt, ohne das bestehende
  Abonnement stillschweigend zu ersetzen. Auch ein eigenes inaktives
  Browser-Abonnement kann ausdrücklich entfernt werden; die historische
  Geräteregistrierung und andere Geräte bleiben erhalten.
- Bei einem Backend-Fehler wird ausschließlich ein gerade für diesen
  Versuch neu erstelltes Browser-Abonnement bereinigt, niemals ein vorher
  vorhandenes oder das eines anderen Geräts. Fehler bei der Bereinigung
  sind gesondert sichtbar.
- Während der Aktivierung werden Berechtigung, Worker-Prüfung,
  Abonnement-Abfrage/-Erstellung und Backend-Registrierung als zugänglicher
  Live-Status angezeigt. Die Berechtigungsanzeige erklärt auch die stille
  Edge-Anfrage über das Symbol in der Adressleiste.
- Native Wartezeiten werden begrenzt: Berechtigung 30 Sekunden,
  Worker-Abfrage 10 Sekunden, Abonnement-Abfrage 15 Sekunden und Erstellung
  30 Sekunden. Das sind einzelne Browser-Timer, kein universeller
  Backend- oder Gesamtzeitdeckel; ein suspendierter Browser kann Timer
  verzögert ausführen. Zeitüberschreitungen geben die Oberfläche wieder
  frei und erhalten sichere Diagnosecodes.
- Native Push-Aufrufe sind nicht abbrechbar. Ein nach Timeout verspätet
  erteiltes Recht oder erstelltes Abonnement startet keine versteckte
  Backend-Registrierung, auch nicht nach Abmeldung. Ein verspätetes
  lokales Abonnement wird nicht automatisch gelöscht, weil ein neuer
  bewusster Versuch es inzwischen verwenden könnte. Es kann beim nächsten
  ausdrücklichen Aktivieren wiederverwendet werden. Ohne bestätigte
  Backend-Registrierung behauptet die App keine Aktivierung.

Keine Migration, kein RLS-/Auth-Umbau, keine Änderung der Endpoint-Allowlist,
keine VAPID-Rotation, kein Edge-Deployment und keine Änderung bestehender
Gerätedatensätze im Hosted DEV. Der bestehende Worker und sein ausdrücklich
bestätigter Update-Ablauf bleiben unverändert.

### Regression und weiterhin notwendige Desktop-Abnahme

Die Notification-Suite deckt synthetische WNS-/Apple-Subscriptions,
wiederholte Aktivierung, Mehrgerätebetrieb, den gemeldeten AbortError,
Blockierung, Worker-/Abfrage-/Backend-Fehler, Bereinigung und veraltete
Schlüssel ab. Sämtliche Supabase- und Push-APIs sind in diesen Browserfällen
abgefangen. Ausführung im installierten Microsoft Edge erfolgt mit:

```powershell
$env:PLAYWRIGHT_CHANNEL='msedge'
$env:NEXT_PUBLIC_BASE_PATH='/feuerwehr-odenthal-app'
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3181'
npx.cmd playwright test --config playwright.auth.config.ts supabase-notifications.spec.ts
```

Diese Tests sind **synthetische Protokollregressionen in einem echten
Browserprozess**, keine echten Push-Zustelltests und keine iOS-Emulation.
Die Notification-Auswahl umfasst jetzt 32 Fälle, die komplette
DEV-Auswahl 133 Browserfälle. Zusätzlich abgedeckt sind exakte
Zeitgrenzen mit angehaltener Testuhr, sichtbarer Fortschritt, verspätete
Berechtigung, verspätete Subscription, bewusste Wiederverwendung und
Abmeldung während einer verspäteten Browserantwort. Die bereits
erfolgreichen 184 Domain/Auth/Konfigurations- und 24 Skripttests bleiben
erhalten.
Die bestehende CI prüft weiterhin Domain/Auth, Demo, komplette DEV-
Browserregression, Static Export, Secret-Scanner und PostgreSQL/RLS.

### Unterstützte Windows-Eingrenzung durch die Administration

Microsoft dokumentiert ausdrücklich Umgebungen, in denen der
Windows-WNS-Client keine Verbindung herstellen kann, der in Edge
integrierte Client dagegen schon:
[ForceBuiltInPushMessagingClient](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/forcebuiltinpushmessagingclient).
Diese Richtlinie ist unter Windows ab Edge 118 verfügbar. Ohne
Konfiguration oder bei `Disabled` verwendet Edge den Windows-Client;
`Enabled` verwendet den integrierten WNS-Client. Die Einstellung gilt
nicht je Profil und erfordert einen vollständigen Browser-Neustart.
Ein zusätzliches Profil allein testet diesen Unterschied daher nicht.

Dies ist eine konkrete unterstützte Eingrenzung, **kein Nachweis der
Ursache auf dem betroffenen Laptop und keine bereits angewandte Lösung**:

1. Zuständige Administration prüft unter `edge://policy` den effektiven
   Wert dieser einen Richtlinie und dokumentiert den Ausgangswert.
   Keine vollständigen Richtlinienexporte mit internen Daten veröffentlichen.
2. Nur mit ausdrücklicher Freigabe und über die zuständige
   Geräteverwaltung einen kontrollierten Vergleich mit `Enabled`
   durchführen. Keine eigenmächtige Registry-Änderung oder Umgehung
   verwalteter Netz-/Sicherheitsregeln. Ungespeicherte Eingaben sichern,
   Edge vollständig schließen und wieder öffnen.
3. Einmal bewusst aktivieren, Diagnosecode notieren. Nur bei bestätigter
   Geräte-Registrierung einmal den eigenen DEV-Test senden und echte
   Anzeige/Klickziel prüfen. Bestehende iPhone-Registrierung belassen.
4. Bei unverändertem Fehler den Ausgangszustand über dieselbe
   Verwaltung wiederherstellen und die Windows-/WNS-Netzwerkdiagnose
   durch die Administration fortsetzen.

Die Entwicklung hat weder diese Richtlinie noch Windows-Dienste,
Firewall, Proxy, vorhandene Profile oder laufende Benutzerbrowser verändert.

Nach manuellem Merge ist auf dem betroffenen Laptop weiterhin erforderlich:

1. Ungespeicherte Eingaben sichern und das angebotene PWA-Update bewusst
   bestätigen. Sichtbare Version und Build-ID festhalten.
2. Im normalen Edge-Fenster einmal aktivieren. Bei erneutem Fehler nur
   Diagnosecode und Exception-Namen notieren, keine Schlüssel/Endpoints.
3. Edge vollständig schließen und erneut öffnen. Bei weiter bestehendem
   Dienstfehler mit einem separaten normalen Edge-Profil eingrenzen.
   Unternehmensrichtlinien, Proxy/VPN und Push-Dienstzugriff bei Bedarf
   durch die zuständige Administration prüfen lassen, nicht umgehen.
4. Erst eine bestätigte eigene Geräte-Registrierung und ein bewusst
   ausgelöster eigener DEV-Test mit tatsächlicher Desktop-Anzeige und
   geprüftem Klickziel schließen die Desktop-Abnahme ab.
5. Vorhandenes iPhone parallel belassen und dessen Empfang erneut prüfen.

Bis dahin: **DEV 0.7 nicht vollständig abgenommen; Desktop-Dienstfehler
auf dem gemeldeten Laptop nicht als behoben nachgewiesen.**
