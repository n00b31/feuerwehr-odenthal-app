# DEV 0.7 – Organisatorische Benachrichtigungen

**Keine Alarmierung:** Diese Funktion ersetzt weder aPager noch die offizielle
Feuerwehralarmierung. Zustellung ist browser-, geräte- und netzabhängig.
Die unabhängige Demo wird nicht verändert.

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
   `pg_cron` und `pg_net`; der normale PostgreSQL-CI-Test installiert keine
   Supabase-spezifischen Erweiterungen. Genau ein Job
   `ff-notifications-dev` läuft minütlich. Ein vorhandener gleichnamiger Job
   führt zum Abbruch, nicht zu Überschreiben oder Verdoppelung.
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

Referenzen:
[Supabase Cron](https://supabase.com/docs/guides/functions/schedule-functions),
[Web Push auf iOS](https://webkit.org/blog/13966/web-push-for-web-apps-on-ios-and-ipados/),
[Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API).
