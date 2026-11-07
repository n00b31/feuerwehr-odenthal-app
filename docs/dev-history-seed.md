# DEV 0.4.1: nicht anmeldbare historische Testdaten

## Abgrenzung und Architektur

Ziel ist ausschließlich das bestehende isolierte Projekt
`orxinqhhbtjpkzwlfaxq`. Das separate Demo-Repository bleibt unverändert.
Die bisherige unabhängige Einheit „Odenthal“ wird unter Erhalt ihrer UUID,
Mitgliedschaften, Rollen und historischen Beziehungen in **Scherf** umbenannt.
Die Organisation heißt weiterhin **Feuerwehr Odenthal**. Es bleiben exakt fünf
Einheiten: Scheuren, Scherf, Blecher, Eikamp und Voiswinkel.
Historische Migrationen 004 und 009 bleiben unverändert; Migration 014 korrigiert
die aktuellen Stammdaten und das aktuelle Manifest der älteren sechs Auth-Testkonten.
Peter und Sarah behalten ihre bisherigen Konten und die unveränderte Einheits-ID.

Der ausdrücklich freigegebene DEV-Modellzusatz in Migration 015 trennt
Fachprofil und Auth-Identität: normale Profile behalten die verpflichtende,
identische Auth-Fremdschlüsselbindung in `auth_user_id`; ihre IDs ändern sich nicht.
Nur mit `DEV041-HISTORY-V1` markierte Profile dürfen ohne Auth-Bindung existieren.
Ihre Namen beginnen mit `DEV TEST |`, Metadatenadressen enden auf `example.invalid`.
Sie bekommen **keine Auth-Benutzer, Passwörter, Rollen, Einladungen oder Anmeldung**.
Ein passiver fachlicher Status `approved` ist keine Zugriffsfreigabe:
die bestehenden verifizierten Auth- und RLS-Prüfungen bleiben zwingend.

Historische Auswertungen nutzen dieselben Mitgliedschaften, Teilnehmerlisten,
tatsächlichen Anwesenheiten und bestätigten Abschlussstände wie bestehende Daten.
Die Kohorten sind zusätzlich nach Seed-Markierung isoliert: synthetische Termine
erzeugen keine künstlichen Fehlzeiten echter Mitglieder; bestehende Termine
erzeugen keine falschen fehlenden Teilnehmerlisten für synthetische Mitglieder.
GLOBAL_ADMIN und FIRE_CHIEF können im Bereich Statistik ein ausdrücklich
**nicht anmeldbares Testdienstbuch** lesen. Das eigene Profil, die Auth-Session
und das normale persönliche Dienstbuch werden dabei nicht gewechselt.
Die separate RPC `ff_dev_personal_report` akzeptiert ausschließlich markierte
synthetische Personen, niemals andere echte Benutzer.

## Reproduzierbarer Datensatz

Fester Seed: `4102025`; Version: `DEV041-HISTORY-V1`; deterministische UUIDs.
50 zusätzliche Mitglieder, zunächst zehn je Einheit, mit historischen Perioden.
Scherf 08 wechselt am 01.07.2026 nach Blecher; dadurch sind aktuell neun in Scherf
und elf in Blecher. Scheuren 09 tritt zum 01.07.2025 ein.
Voiswinkel 10 beginnt am 01.11.2026 und hat keine bestätigte Diensthistorie.
Je Einheit hat Person 01 hohe und Person 02 niedrige tatsächliche Teilnahme.
Mehrfachzuordnungen zu Gerätewarten, Atemschutz und Kleiderkammer sind enthalten.

Je Einheit und Jahr: 18 reguläre Dienste, drei Sonderübungen, zwei Fortbildungen,
zwei Gemeinschaftstermine. Dazu kommen je Jahr ein gemeinsamer Organisationstermin,
drei Funktionstermine, eine nicht abgeschlossene Liste und ein abgesagter Termin.
Insgesamt **262 Termine, 131 je Jahr, davon 258 abgeschlossen**.
2025 ist über Januar bis Dezember verteilt; 2026 bis Oktober, ergänzt um die
November-Prüffälle. Dauer, Uhrzeit, Monat, Einheit und Teilnahme unterscheiden sich.
Anmeldungen sind absichtlich nicht mit der tatsächlichen Anwesenheit gleichgesetzt.
Nur abgeschlossene bestätigte tatsächliche Anwesenheiten zählen in den Berichten.
Ohne Nenner bleibt die Quote „nicht berechenbar“, nicht erfundenes 0 %.

## Manuelle Ausführung

Migrationen 014–016 installieren nur Schema und geprüfte RPCs; **kein Seed läuft
beim Merge, beim Deployment oder beim Browserstart**.
Das lokale Skript verwendet eine kurzlebige echte GLOBAL_ADMIN-Session,
keinen Service-Role-Schlüssel. Laufzeitwerte gehören nur in den lokalen Prozess,
nicht in Dateien, Shell-Historie, Repository oder öffentliche CI-Ausgaben.

Erforderliche Umgebungsvariablen:

| Variable | Wert |
|---|---|
| `SUPABASE_DEV_PROJECT_REF` | `orxinqhhbtjpkzwlfaxq` |
| `SUPABASE_DEV_URL` | `https://orxinqhhbtjpkzwlfaxq.supabase.co` |
| `SUPABASE_DEV_ENVIRONMENT` | `isolated-dev` |
| `SUPABASE_DEV_PUBLISHABLE_KEY` | Öffentlicher Publishable-Key dieses DEV-Projekts |
| `SUPABASE_DEV_GLOBAL_ACCESS_TOKEN` | Kurzlebiges Laufzeit-Token eines freigegebenen GLOBAL_ADMIN |
| `SUPABASE_DEV_HISTORY_CONFIRM` | Nur für Schreiben: `SEED DEV041-HISTORY-V1` |

```powershell
node scripts\seed-dev-history.mjs check
node scripts\seed-dev-history.mjs seed
```

Das Skript validiert Projekt, Umgebung und Session-Metadaten vor Client-Erstellung,
verifiziert die Session mit Supabase Auth und prüft die Inventar-RPC vor Änderungen.
Serverseitig werden Projektissuer, aktiver GLOBAL_ADMIN und Bestätigung nochmals
geprüft. Netzwerkzugriffe sind auf den exakten DEV-Origin ohne Redirects beschränkt.
MEMBER, UNIT_ADMIN und FIRE_CHIEF dürfen nicht seeden.
Ein unveränderter Wiederholungslauf ist vollständig lesend und erzeugt keine
Duplikate. Änderungen oder Kollisionen führen zum atomaren Abbruch, nicht zum
Überschreiben oder „Reparieren“ bestehender Daten. Der Server vergleicht zusätzlich
Fingerprints der geschützten Auth- und Fachdatensätze vor und nach dem Seed.

## Sichere spätere Entfernung: vorbereitet, nicht ausführen

`ff_cleanup_dev_history` ist standardmäßig ein **Dry Run**. Voraussetzung:
aktiver GLOBAL_ADMIN, korrekter Projektissuer, unveränderter Seed-Fingerprint.
Zuerst mit `dry_run => true` die ausschließlich markierten Beziehungen prüfen.
Eine tatsächliche Entfernung benötigt zusätzlich `dry_run => false`,
`expected_fingerprint` aus dem aktuellen Inventar und exakt
`confirmation => 'REMOVE DEV041-HISTORY-V1'`.
Unmarkierte Profile, Auth-Konten, Rollen, Termine und Anwesenheiten sind niemals
Löschziele. Veränderungen oder externe Referenzen führen zum atomaren Abbruch.

Audit-Einträge werden nicht gelöscht oder umgeschrieben. Echte bestätigte
Anwesenheiten bleiben unveränderlich. Die ausschließlich für den kontrollierten
DEV-Batch benötigte Löschung markierter Bestätigungen ist nur innerhalb der
geprüften Bereinigungsroutine erlaubt; Updates bleiben immer untersagt.
Die Seed-Registrierung und das Batch-Audit bleiben erhalten. Nach Entfernung
verweigert dieselbe Version die automatische Neuanlage.

Die tatsächliche Bereinigung wird nur im isolierten CI-Rollback-Test ausgeführt,
**nicht im gehosteten DEV-Projekt**.

## Prüfnachweise

### Tatsächlicher gehosteter Stand am 07.11.2026

Die Scherf-Korrektur wurde im bestehenden DEV ausgeführt. Die Einheits-ID
`458dae15-ba37-43eb-9e75-b2296092aed7` bleibt erhalten.
Gehostete Migrationsversion: `20261107185038`. Exakt fünf Einheiten; die zwei
bisherigen Mitgliedschaften und eine scoped Rollenzuweisung an dieser Einheit
bleiben erhalten. Vorher-/Nachher-Fingerprints der Profile, Rollen,
Mitgliedschaften, Termine und tatsächlichen Anwesenheiten stimmen exakt überein.
Die acht bestehenden Auth-Identitäten bleiben bestehen; es wurde kein Auth-Konto
angelegt oder gelöscht. Der gesamte Auth-Datensatz-Fingerprint hat sich im
Prüfzeitraum geändert und wird deshalb ausdrücklich nicht als unverändert
ausgegeben. Migration 014 schreibt ausschließlich Einheiten, Korrektur-Audit und
die aktuellen Seed-Hilfsfunktionen, keine Auth-Datensätze.
Migration 015 wurde anschließend zweimal vom MCP-Client bei der
Bestätigungsanforderung automatisch abgebrochen, auch nach ausdrücklicher
erneuter Nutzerfreigabe. Laut Tool wurde jeweils **nichts ausgeführt**.
Migration 016 und der historische Seed wurden deshalb nicht gestartet.
Es gibt im gehosteten DEV noch **keine 50 neuen Historienprofile**.
Die oben genannten 50/262/258 sind der tatsächlich geprüfte CI-Datensatz,
nicht bereits angelegte gehostete Daten.

Für die Fertigstellung müssen die getesteten Migrationen 015 und 016 über einen
funktionierenden autorisierten Migrationsweg bestätigt werden. Erst danach darf
der manuelle Seed erfolgen. Ein Austausch des Clients oder eine Umgehung der
abgebrochenen Bestätigung wurde nicht vorgenommen.
Echte gehostete Jahres-/Einheitszahlen werden erst nach diesem Lauf dokumentiert.

`supabase/tests/history-seed.sql` führt echte PostgreSQL-, RLS- und RPC-Tests
in der wegwerfbaren CI-Datenbank aus. Dazu gehören beide Jahre, Einheitswechsel,
Eintritt, leeres Dienstbuch, unterschiedliche Quoten/Stunden, vollständige
CSV-Quelldaten, unveränderte echte Dienstbücher, Rollenverweigerung, Wiederholung,
geschützte Originaldaten sowie echte Bereinigung ausschließlich im Test-Rollback.
Die übrigen Auth-, Termin-, Anwesenheits-, Delegations- und Berichtstests laufen
weiterhin unverändert mit.

Browser-Tests verwenden ausdrücklich abgefangene synthetische Supabase-Antworten.
Sie prüfen Darstellung, Dropdown-Berechtigungen, unveränderte Anmeldung und
markierten CSV-Export, ersetzen aber keine echte Auth-/RLS-Prüfung.
Die veröffentlichten GitHub-Pages-Dateien ändern sich erst nach manueller
PR-Freigabe und dem regulären Deployment.
