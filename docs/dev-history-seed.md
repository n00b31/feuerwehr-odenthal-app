# DEV 0.4.1: nicht anmeldbare historische Testdaten

## Abschluss und manuelle Nutzerabnahme

Am **07.11.2026** hat der Projektverantwortliche die reale Abnahme ausdrücklich
bestätigt: Jahresauswahl 2025/2026 und persönliche Diensthistorie,
Einheitsstatistiken einschließlich Scheuren/Scherf und weiterer Einheiten,
Wehrleiter-Dashboard mit Jahresvergleich/Gesamtstatistiken/CSV-Export sowie
Terminverwaltung, Teilnahme, Anwesenheit, Delegation und Benutzerverwaltung.
Dies sind **manuell vom Projektverantwortlichen bestätigte Ergebnisse**,
nicht neu erfundene oder durch automatisierte Tests ersetzte Browserprüfungen.
Native PWA-Gerätetests auf iPhone/Android bleiben offen.

Abgenommen wurde **DEV 0.4.1**, Commit
`ab596e58a9735fec1cba8826ecdab4bf7a7296bc`.
Die Kette ist nachgewiesen: manuell gemergter PR #15 → derselbe `main`-Commit →
[erfolgreicher Workflow 42411613373](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42411613373)
→ heruntergeladenes Artefakt `supabase-dev-export` →
[öffentliches release.json](https://n00b31.github.io/feuerwehr-odenthal-app/release.json).
Artefakt und veröffentlichte Anwendung enthalten identische Release-Metadaten:
Build `ab596e58a973-fec35054-e096-4643-a73a-e728df67c574`,
Buildzeit `2026-11-07T20:37:16.931Z`, Modus `supabase-dev`,
`sourceDirty=false`. Auch die SQL-CI
[42411613297](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42411613297)
war erfolgreich.

Der zuvor lokal und remote nicht vorhandene annotierte Tag
**`v0.4.1-seed-dev`** wurde ohne Überschreiben auf genau diesen Commit gesetzt
und zu GitHub gepusht. Diese Dokumentation wird vor Kalender-Code separat
committet und gepusht; ihre PR-Sicherung erfolgt zusammen mit dem anschließenden
DEV-0.5-PR, ohne automatischen Merge. Die abgenommenen Daten werden nicht
zurückgesetzt, entfernt oder erneut überschrieben.

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

Die bewusst ausgeführten Migrationen 014–017 installieren das DEV-Modell und
geprüfte RPCs; Migration 014 korrigiert zusätzlich die Einheitsstammdaten.
**Kein historischer Seed läuft beim Merge, beim Deployment oder beim Browserstart**.
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
Ein unveränderter Wiederholungslauf ändert keine Datensätze und erzeugt keine
Duplikate; die serverseitige Prüfung sperrt die Batch-Registrierung kurzzeitig.
Änderungen oder Kollisionen führen zum atomaren Abbruch, nicht zum
Überschreiben oder „Reparieren“ bestehender Daten. Der Server vergleicht zusätzlich
Fingerprints der geschützten Auth- und Fachdatensätze vor und nach dem Seed.

## Sichere spätere Entfernung: vorbereitet, nicht ausführen

`ff_dev_remove_history` ist standardmäßig ein **Dry Run**. Voraussetzung:
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
Nach direkter Nutzeranmeldung wurde der reguläre, sichtbare Supabase-SQL-Editor
des bestätigten DEV-Projekts verwendet. Seine Sicherheitsdialoge wurden für die
ausdrücklich freigegebenen Schemaänderungen bestätigt, nicht versteckt umgangen.
Die geladenen, unveränderten Quellen wurden vor Ausführung per SHA-256 geprüft
und innerhalb derselben Transaktion in der Migrationshistorie protokolliert:

| Migration | Gehostete Version | Quellen-SHA-256 |
|---|---|---|
| 015 | `20261107194924` | `83a408bbb5b61558f551e047a51760c9d124b8d33fc5058d13a04f54c363b66c` |
| 016 | `20261107195053` | `3b4125cb4eaafb30087a388b4145648ad62dfbb3b36136b9ce20b9cfe0152648` |
| 017 | `20261107201625` | `470f2b7a0a0f83607e0209bd509f421c4b9cca7a0b44fdd5a077315dd7246c01` |

Alle 15 Funktionsdefinitionen stimmten anschließend exakt mit den geprüften
Quellen überein. Die acht normalen Auth-Bindungen und bestehende öffentliche
RLS-Regeln blieben erhalten; Zugriff auf die private Seed-Tabelle und private
Seed-Helfer ist für `authenticated` weiterhin entzogen.
Migration 017 wurde nach erfolgreichem echtem PostgreSQL-CI-Test über das reguläre
Migrationswerkzeug ausgeführt. Sie korrigiert ausschließlich die doppelte
DEV-Kennzeichnung im Testdienstbuch. Der installierte Funktionskörper stimmt
mit der LF-normalisierten Quelle überein (MD5
`76a312260f72d4424951580e1f108d79`); Berechtigungen und Daten bleiben unverändert.
Öffentliche Profilspalten sind weiterhin gezielt freigegeben, die neue interne
Seed-Markierung nicht direkt für `authenticated`. Der Testdienstbuch-Zugriff
erfolgt ausschließlich über die geprüfte RPC.

Der Seed wurde danach über die tatsächlich installierte RPC im ausdrücklich
autorisierten Datenbank-Administratorkontext ausgeführt. Der bestehende aktive
GLOBAL_ADMIN war als handelnde Person hinterlegt. Dies war **kein Browserlogin
als dieser Benutzer** und keine neu geschaffene Authentifizierung.

**Tatsächlich gehostet:** 50 zusätzliche Fachprofile ohne Auth-Identität oder Rolle,
51 historische Einheitsmitgliedschaften, 41 Funktionsmitgliedschaften und
262 Termine. 258 sind abgeschlossen, zwei offen und zwei abgesagt.
2.655 tatsächliche Anwesenheitszeilen sind vorhanden; davon sind 2.616 durch
Abschlüsse bestätigt. Die übrigen 39 Vorbelegungen zählen nicht als bestätigte
Anwesenheit. Der Datensatz-Fingerprint lautet
`6fd6737be8dab684db406d63507b7989`. Ein tatsächlich ausgeführter, committed
Wiederholungslauf ließ Datensatz und geschützte Originaldaten unverändert.
Auch die abschließende Prüfung nach Migration 017 und echten Auth-Anmeldungen
bestätigt exakt dieselben Original-Fingerprints wie vor der Änderung:

| Geschützter ursprünglicher Bestand | MD5 |
|---|---|
| Profile ohne neue Bindungs-/Markierungsspalten | `a4c54298e2e8c9b94444eb57714a74c4` |
| Rollen | `24b579c289539b8c89b89969faac8739` |
| Einheitsmitgliedschaften | `e4b9f9975fcdd271a78b34b5dffcd3ed` |
| Termine ohne neue Markierungsspalte | `ee05bba762f12e08354cafde5e4a48c4` |
| Tatsächliche Anwesenheiten | `fcb9cf747de1a944e9bae79ba70b52b8` |

Es bestehen acht normale Auth-Bindungen, 50 nicht anmeldbare Profile,
keine Rollen für synthetische Personen, genau ein Seed-Batch-Audit und
kein Bereinigungs-Audit.

### Tatsächliche Seed-Statistik nach Jahr und historischer Einheit

Die Tabelle enthält **nur neue synthetische Daten**, einschließlich zugeordneter
Organisations- und Funktionstermine. Deshalb sind es 29 abgeschlossene Dienste
je Einheit und Jahr, obwohl 25 Termine unmittelbar je Einheit angelegt wurden.
Gemeinsame Dienste dürfen bei einer Organisationssumme nicht mehrfach gezählt
werden. Die Quote bezieht sich auf ausbildungsrelevante bestätigte Teilnahmen.
„Teilnehmerstunden“ sind aufsummierte Anwesenheitsstunden, keine angebotenen Stunden.

| Jahr | Einheit | Anwesend | Abwesend | Ausbildungsquote | Ausbildungs-Teilnehmerstunden | Teilnehmerstunden gesamt |
|---|---|---:|---:|---:|---:|---:|
| 2025 | Scheuren | 209 | 46 | 82,96 % | 409,5 | 474 |
| 2025 | Scherf | 194 | 74 | 71,91 % | 375,5 | 435,5 |
| 2025 | Blecher | 161 | 107 | 59,15 % | 316 | 363 |
| 2025 | Eikamp | 149 | 119 | 56,60 % | 301,5 | 341 |
| 2025 | Voiswinkel | 98 | 144 | 40,57 % | 196,5 | 230,5 |
| 2026 | Scheuren | 240 | 29 | 89,41 % | 572,5 | 663,5 |
| 2026 | Scherf | 206 | 51 | 80,09 % | 504,5 | 575,5 |
| 2026 | Blecher | 198 | 81 | 70,49 % | 473,5 | 555 |
| 2026 | Eikamp | 170 | 98 | 65,11 % | 415 | 472 |
| 2026 | Voiswinkel | 115 | 127 | 48,58 % | 278 | 315 |

Seed-only Organisationssumme: 2025 1.599 Ausbildungs-Teilnehmerstunden und
1.844 Teilnehmerstunden gesamt; 2026 2.243,5 und 2.581 Stunden.
Die normale zentrale RPC enthält zusätzlich bestehende reale DEV-Daten:
2026 insgesamt 2.247,5 Ausbildungs-Teilnehmerstunden und 2.605 Teilnehmerstunden.
Die Differenz von vier beziehungsweise 24 Stunden stammt aus bestehenden Daten,
nicht aus einer Änderung des Seeds. Eine unabhängige Abfrage bestätigter
Anwesenheitszeilen stimmt mit diesen RPC-Ergebnissen überein.

### Tatsächlich geprüfte gehostete Sonderfälle und Rechte

Scheuren 01 hat 2025 100 % Ausbildungsquote und 51,5 Ausbildungsstunden;
Scheuren 02 8,70 % und 3,5 Stunden. Scheuren 09 hat 15 abgeschlossene Dienste
und keinen Eintrag vor dem Eintritt am 01.07.2025. Scherf 08 behält 2026
16 historische Dienste in Scherf und elf in Blecher.
Voiswinkel 10 hat keine bestätigte Historie, null Stunden, eine offene Liste
und ausdrücklich keine berechenbare Quote.

Die tatsächlich installierten RLS-Regeln und RPCs wurden mit `authenticated`
und bestehenden GLOBAL_ADMIN-, UNIT_ADMIN- und MEMBER-Identitäten geprüft.
Der bestehende MEMBER behält drei eigene abgeschlossene reale Dienste,
ohne synthetische Einträge, Testidentitätsauswahl oder administrative Rechte.
UNIT_ADMIN kann den eigenen Einheitsbericht lesen, nicht andere Einheiten oder
fremde Testdienstbücher, und nicht seeden. Eine synthetische Identität kann auch
im negativen SQL-Claims-Test keinen aktiven Mitgliederbericht abrufen.
Der letzte GLOBAL_ADMIN kann weder deaktiviert noch seiner Rolle beraubt werden;
diese Prüfungen waren ausschließlich rollback-geschützt.
Die gehostete Bereinigung wurde nur als Dry Run geprüft, niemals ausgeführt.
Positive FIRE_CHIEF-Prüfungen stammen aus echten isolierten PostgreSQL-Tests
und synthetischen Browserprüfungen; es wurde kein neuer gehosteter FIRE_CHIEF
oder eine zusätzliche gehostete Rolle angelegt.

### Tatsächlich ausgeführter Auth-/HTTP-Nachweis

Der bestehende manuelle Workflow `seed-dev-test-users.yml` bietet den zusätzlichen
rein prüfenden Modus `history-check`. Dieser verwendet ausschließlich die sechs
bestehenden Auth-Testkonten, den öffentlichen DEV-Key und das geschützte
Laufzeit-Testpasswort. Er erzeugt keine Konten und ändert keine Fach-/Rollendaten.
Normale Auth-Anmeldungen können erwartungsgemäß Auth-Sitzungsmetadaten aktualisieren.
Die bestehenden aktuellen Einheiten werden geprüft, nicht auf das ursprüngliche
Seed-Manifest zurückgesetzt. Profil-RLS, echte Jahresbericht-RPCs, geschützte
Scopes und die bestehende Termin-RPC werden mit echten signierten Auth-Sitzungen
geprüft. Der Modus ist manuell auf `main` und diesem Feature-Branch ausführbar;
die bisherigen schreibenden Auth-Seeds bleiben ausschließlich auf `main`.

Dieser Modus wurde tatsächlich erfolgreich ausgeführt:
[Actions-Lauf 42410418250](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42410418250)
auf `4f54a75eacc415a9c621cf588806dcd16571fe27`.
Alle sechs vorhandenen Konten meldeten sich erfolgreich über Supabase Auth an.
Echte HTTP-Anfragen prüften deren öffentliche Profilspalten mit RLS, persönliche
Berichte für beide Jahre ohne synthetische Einträge, zulässige Einheitsberichte,
Verweigerung organisationsweiter/fremder Testdienstbücher und die bestehende
Termin-RPC. Die temporären Testsitzungen wurden anschließend einzeln abgemeldet;
andere Sitzungen wurden nicht global abgemeldet. Dieser Nachweis betrifft
MEMBER und UNIT_ADMIN; die positive GLOBAL_ADMIN-Prüfung bleibt der oben
ausgewiesene echte SQL-/RPC-Nachweis.

Erneute manuelle Prüfung ohne Fachänderung:

```powershell
gh workflow run seed-dev-test-users.yml --repo n00b31/feuerwehr-odenthal-app --ref main -f mode=history-check -f confirm_project=orxinqhhbtjpkzwlfaxq
```

Der Befehl für `main` ist nach manuellem Merge verfügbar. Vorher kann ausdrücklich
`--ref feature/dev-041-seed-data` verwendet werden.

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

Abschließende Quellcode-CI auf `4f54a75`: reale SQL-/RLS-Regressionen in
[42410421821](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42410421821),
statische Demo-/Auth-/DEV-Exporte und Browserregressionen in
[42410421793](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42410421793)
erfolgreich; der Deployment-Job war ausdrücklich übersprungen.
110 Unit-/Skripttests, Typecheck und Lint waren erfolgreich. Die sieben aktuellen
Report-Browserfälle inklusive des `dev-test-`-Downloadnamens wurden zusätzlich
lokal gegen den tatsächlichen statischen Export erfolgreich wiederholt.
