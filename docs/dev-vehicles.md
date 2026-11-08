# DEV 0.6: Fahrzeuge und Reservierungen

## Implementierungsplan

1. Abgenommene DEV 0.5.1 sichern: Tag `v0.5.1-calendar-dev` auf
   `f33383decad824dccabf135a00768fd1172ee137`; manuelle Abnahme in
   `dev-calendar.md` vor Fachänderungen committed.
2. Vorhandene `calendar_resources` mit Ressourcentyp `vehicle` wiederverwenden.
   Fahrzeugattribute, explizite Verwalter und freigegebene Nutzungseinheiten
   ergänzen; keine technische Rolle für Fahrzeugverwalter.
3. `events` bleibt einzige Quelle für Titel, Zeitraum, verantwortliche Person
   und Nutzungseinheit. Reservierungen und Sperrungen sind 1:1-Ergänzungen,
   keine neuen Teilnahme-, Anwesenheits- oder Dienstbuchdaten.
4. REQUESTED/APPROVED/REJECTED/CANCELLED/COMPLETED serverseitig prüfen.
   Angefragte Intervalle dürfen konkurrieren; Genehmigungen und Sperrungen
   sperren zuerst dieselbe Fahrzeugzeile und prüfen danach alle verbindlichen
   Intervalle. Neue kollidierende Sperrungen werden ausdrücklich abgewiesen,
   bis bestehende Buchungen bewusst geklärt wurden.
5. Eigener Fahrzeugkalender, Anfragen, Genehmigungsaufgaben, Sperrungen,
   Administration und persistente interne Benachrichtigungen im bestehenden
   Terminbereich; keine weitere Hauptnavigation.
6. Fach-/Browser-/SQL-/RLS-/Parallelitätsregressionen und Static Export prüfen.
   Erst danach geprüfte Migrationen kontrolliert ausschließlich im DEV
   anwenden, Bestands-Fingerprints vergleichen und PR ohne Auto-Merge liefern.

## Fachliche Entscheidungen

Besitzende Einheit, erlaubte Nutzungseinheiten und Genehmigungsrechte sind
getrennt. Die Einheitsführung erhält nur für Fahrzeuge der eigenen Einheit
Rechte, deren globale Konfiguration das ausdrücklich erlaubt. Explizite
Verwalter können mehreren Einheiten angehören; Widerruf wirkt bei jedem RPC
und jeder RLS-Abfrage erneut. Nur globale Administration vergibt diese Rechte.
Fahrzeugverwalter dürfen Fahrzeugdetails und Verfügbarkeit bearbeiten, aber
keine Verwalter oder Nutzungsfreigaben selbst erweitern. FIRE_CHIEF ist für
dieses Modul organisationsweit lesend, nicht schreibend.

Zeiten verwenden die vorhandenen Europe/Berlin-Helfer und technisch UTC.
Intervalle sind halboffen; direkt anschließende Nutzungen kollidieren nicht.
Neue Anfragen liegen in der Zukunft und umfassen höchstens 43 Tage.
Ablehnung und Stornierung genehmigter Nutzungen benötigen eine Begründung.
Abschluss ist erst nach Ende durch Fahrzeugverwaltung möglich, dokumentiert
nur den Status und erfasst keine Kilometerstände oder Übergaben.

Anfragen blockieren nicht. Eine verbindlich belegte Zeit wird bei Antragstellung
gewarnt und bei Genehmigung zwingend abgewiesen. Eine Fahrzeugdeaktivierung
verhindert neue Anfragen/Genehmigungen, löscht aber keine Historie oder
bestehenden Buchungen. Benachrichtigungen sind transaktional gespeicherte
App-Datensätze, keine E-Mail, SMS oder Push-Nachricht.

Die Installation der Datenbank darf den weiterhin veröffentlichten
DEV-0.5.1-Client nicht beschädigen. Dessen Kalender-/Kontext-RPCs behalten
Gerätehäuser und bisherige Eintragsarten. DEV 0.6 verhandelt über
`vehicle_calendar` ausdrücklich die neuen `ff_calendar_vehicle_context`-
und `ff_calendar_vehicle_page`-RPCs. Erst dieser Client zeigt verbindliche
Fahrzeugvorgänge im gemeinsamen Kalender. Beide Wege verwenden dieselben
Termin-IDs, Sichtbarkeitsprüfungen und Cursor; keine Termin-Kopie.

Synthetische DEV-Daten sind ausdrücklich als solche bezeichnet. Keine echten
Kennzeichen oder Funkrufzeichen werden erfunden. Eine wiederholbare,
operatorgeschützte Einrichtung verwendet vorhandene freigegebene DEV-Akteure,
ohne Profile, Mitgliedschaften oder technische Rollen zu verändern.

## Manuelle Abnahme vorbereiten

Noch nicht als durchgeführt behauptet:

| Test | Benutzerablauf |
|---|---|
| A | Fahrzeug wählen; Monat/Woche/Liste öffnen; Verfügbarkeit und Reservierungsdetails prüfen |
| B | MEMBER stellt Anfrage mit Zeitraum, Zweck, verantwortlicher Person und eigener Nutzungseinheit; REQUESTED prüfen |
| C | Zugewiesener Fahrzeugverwalter öffnet Aufgabe, genehmigt; APPROVED im Fahrzeug- und gemeinsamen Kalender prüfen |
| D | Konkurrierende Anfrage stellen; Warnung und zwingende serverseitige Ablehnung der zweiten Genehmigung prüfen |
| E | Genehmigte Reservierung mit Begründung stornieren; freien Zeitraum und Benachrichtigung prüfen |
| F | MEMBER, fremde Einheitsführung, zugewiesener/widerrufener Verwalter, GLOBAL_ADMIN und lesender FIRE_CHIEF vergleichen |

Native installierte iPhone-/Android-PWA-Gerätetests bleiben ebenfalls offen.

## Datenmodell und Schreibschutz

`calendar_resources` bleibt die gemeinsame Ressourcenquelle. `vehicles`
ergänzt genau eine Fahrzeugkonfiguration je Ressourcen-ID. `vehicle_types`
und `vehicle_purposes` sind erweiterbare globale Klassifikationen.
`vehicle_managers` und `vehicle_usage_units` trennen explizite Verwaltung
von freigegebener Nutzung. `vehicle_reservations.event_id` verweist 1:1 auf
`event_calendar` und dessen kanonischen `events`-Datensatz. Titel, Zeitraum,
verantwortliche Person und Nutzungseinheit werden nicht dupliziert.
`vehicle_notifications` speichert Empfänger, Vorgang, Text und Lesedatum.

Alle sieben neuen Tabellen haben SELECT-RLS für freigeschaltete,
berechtigte Personen. Anonyme Zugriffe und direkte INSERT-/UPDATE-/DELETE-/
TRUNCATE-Rechte sind entzogen. Schreiben erfolgt ausschließlich über die
rollen-/fahrzeuggeprüften öffentlichen RPCs; private Audit-, Seed- und
Mutationshelper sind für Browserrollen nicht ausführbar.
GLOBAL_ADMIN verwaltet alle Fahrzeuge; explizite Verwalter und ausdrücklich
aktivierte eigene Einheitsführung verwalten nur ihre Fahrzeuge.
Nutzungsfreigabe allein erteilt keine Verwaltung. Alte eigene Anfragen bleiben
nach Widerruf einer Nutzungsfreigabe sichtbar, vermitteln aber weder neue
Buchungsrechte noch Zugriff auf fremde zukünftige Nutzungen.

`ff_request_vehicle`, `ff_decide_vehicle` und `ff_save_vehicle` sperren
dieselbe `calendar_resources`-Zeile. Nach Erwerb der Sperre wird der aktuelle
verbindliche Belegungszustand erneut geprüft; Status, Terminrevision, Audit
und Benachrichtigungen werden gemeinsam committed oder vollständig verworfen.
Gerätehäuser behalten ausdrücklich die bisherige unverbindliche Konfliktwarnung.

## Tatsächliche DEV-Installation am 08.11.2026

Ziel wurde unabhängig über MCP und sichtbare Dashboard-URL geprüft:
`https://orxinqhhbtjpkzwlfaxq.supabase.co`, `feuerwehr-odenthal-dev`.
Die native Migrationsbestätigung wurde zweimal sofort vom Client abgebrochen,
ohne Ausführung. Nach ausdrücklicher Nutzerfreigabe und eigener
Dashboard-Anmeldung wurden die unveränderten, SHA256-geprüften Git-Quellen
regulär im sichtbaren SQL-Editor bestätigt. RLS wird im SQL ausdrücklich
für alle neuen Tabellen aktiviert; die statische Dashboard-Warnung erkennt
die entsprechende DO-Schleife nicht.

Getestete Quelle für 021–023:
`90a21d466914cc3132730d4a663d922831b82dea`.
Remote-Historie und Git-Blob stimmen einschließlich abschließender LF bytegenau:

| Datei | Remote-Version / Name | Git-/Remote-SQL-SHA256 |
|---|---|---|
| `20261108002100_vehicles.sql` | `20261108132655` / `ff_021_vehicles` | `9f32ff7b4424c109a4c42508664720b7c0cf3250460236c4a695b534bfbcc200` |
| `20261108002200_vehicle_calendar.sql` | `20261108132656` / `ff_022_vehicle_calendar` | `fe002dbc12ae004a2128699ba87108434bfe9fd77e5cdf1f78b9a1bab92fc412` |
| `20261108002300_dev_vehicle_fixtures.sql` | `20261108132657` / `ff_023_dev_vehicle_fixtures` | `7e3851c4fc38f977e909f6a8ee3f9046f9136015a12ccf0b722e67be1afe8db2` |

Die erste Historienregistrierung interpretierte Dollarzeichen innerhalb der
gespeicherten Quelltextkopie als JavaScript-Ersetzungszeichen. Das ausgeführte
DDL war unverändert; ausschließlich die drei Quelltext-Metadaten wurden
anschließend mit Versions-/Namens-/Hash-Guard korrigiert. Nicht erneut migriert.
Vor Ergänzung 024 wurden alle **23 tatsächlich installierten Funktionskörper** zusätzlich
unabhängig mit ihren Git-Quellkörpern verglichen und stimmen bytegenau.
Bereits installierte Migrationen bleiben unverändert.

Migration 024 ergänzt die vollständige Vorher-/Nachher-
Protokollierung von Fahrzeugtyp-/Zweckänderungen. Ein schlüsselbezogenes
Transaktionslock serialisiert auch gleichzeitig erstellte Konfigurationen.
Am 08.11.2026 über natives `apply_migration` installiert:
`20261108133632` / `ff_024_vehicle_option_audit`.
Quelle `9d7c0f6fa2de72be6e7e9bf84190b9ea7a22601e`,
Datei `20261108002400_vehicle_option_audit.sql`,
Git-/Remote-SQL-SHA256
`37f585b495cbc4ac6212fc87f75c86d774c032f55f352af6e5c02cc40507e7c9`.
Der ersetzte RPC-Körper stimmt ebenfalls bytegenau mit dem geprüften Commit
überein. Zusätzliche echte DEV-Konfigurations-/Audit-Probe erfolgreich,
vollständig zurückgerollt.

## Synthetische Fahrzeuge und wiederholbarer Seed

Migration 023 definiert den Seed nur; weder Migration noch Merge führen ihn aus.
Im ausschließlich geprüften DEV kann ein berechtigter Datenbankoperator ausführen:

```sql
select ff_private.seed_dev_vehicles('orxinqhhbtjpkzwlfaxq');
```

Vorher Projekt-URL/ID, Umgebung, Migrationen und vorhandene aktive Akteure prüfen.
Nicht aus der App, nicht mit Browserrechten und nicht in Produktion ausführen.
Kein Service-Role-Key oder Passwort wird dafür ins Repository oder in den Build übernommen.
CLI-`db push` darf die abweichenden Remote-Versionen nicht blind erneut anwenden.

| Synthetisches Fahrzeug | Typ | Besitz | Verwalter | Einheitsführung | Nutzung |
|---|---|---|---|---|---|
| DEV synthetisch - MTF Scheuren | MTF | Scheuren, nur DEV-Pilot | Vorhandener GLOBAL_ADMIN | Eigene ausdrücklich aktiviert | Alle fünf bestehenden Einheiten |
| DEV synthetisch - Reserve-HLF | HLF | Scheuren, nur DEV-Pilot | Vorhandener GLOBAL_ADMIN | Nicht aktiviert | Alle fünf bestehenden Einheiten |
| DEV synthetisch - Bunte Kuh | Sonstige | Scheuren, nur DEV-Pilot | Vorhandener GLOBAL_ADMIN | Nicht aktiviert | Alle fünf bestehenden Einheiten |
| DEV synthetisch - KdoW | KdoW | Scheuren, nur DEV-Pilot | Vorhandener GLOBAL_ADMIN | Nicht aktiviert | Alle fünf bestehenden Einheiten |

Keine echte Fahrzeugzuordnung, Kennzeichen oder Funkrufzeichen behauptet.
Funkrufzeichen sind leer. Der Seed verwendet vorhandene Mitglieder, keine neuen
Auth-Konten, Profile, technischen Rollen oder Mitgliedschaften.
Die fünf markierten Beispielvorgänge sind REQUESTED, APPROVED, REJECTED,
CANCELLED sowie eine APPROVED-Wartungssperrung; 10.–14.11.2026, jeweils
09:00–11:00 Europe/Berlin. Erneuter Seed verschiebt keine alten Zeiten und
überschreibt keine Änderungen. Für spätere Abnahmen neue zukünftige Anfragen
über die App anlegen.

Tatsächlich zweimal ausgeführt: **vier Fahrzeuge und fünf Vorgänge**.
Der zweite Lauf verändert weder Fahrzeuge, kanonische Beispieltermine,
Reservierungen, Benachrichtigungen noch deren Audit.
22 neue Fahrzeug-/Fixture-Audits und 26 interne Benachrichtigungen;
keine externen Nachrichten. Sichere spätere Stilllegung: Testvorgänge bewusst
mit Begründung stornieren, Testfahrzeuge deaktivieren, Historie/Audit erhalten.
Keine automatische Löschung oder Kaskadenbereinigung.

## Bestandserhaltung und echte DEV-Prüfungen

Aktualisierte Baseline: **08.11.2026, 13:09:45.098197 UTC**.
Vor/nach Installation, Seed und zurückgerollter RPC-Probe identisch:

| Bestand | Ergebnis |
|---|---|
| Ursprüngliche Fachdaten | MD5 `2dd028a28af031bfd7ecaeb8364a7e16` |
| Ursprünglicher Audit bis Baseline | MD5 `a5799672ea7e1cbfde920eefd155bd05` |
| Auth-Identitäten | Acht, keine neuen Konten |
| Gerätehäuser / Einheiten | Fünf unverändert: Scheuren, Scherf, Blecher, Voiswinkel, Eikamp |
| Bestätigte Dienstlisten | 262 unverändert; kein Fahrzeugvorgang erzeugt Roster oder Anwesenheit |
| Ursprüngliche organisatorische Kalenderdaten | Zwei unverändert |

Fachdaten-Fingerprint umfasst Profile, Einheiten, Rollen, Unit-/Funktions-
Mitgliedschaften, ursprüngliche Termine/Kalenderzusatzdaten, Zielgruppen,
Roster, Rückmeldungen, Anwesenheiten, Bestätigungen und Gerätehäuser.
Ausschließlich die fünf neuen Fahrzeug-Termin-IDs werden aus dem Vergleich
der ursprünglichen Termine/Kalenderzusatzdaten ausgeschlossen.
Reale Auth-Anmeldungen dürfen Auth-Metadaten aktualisieren.

Gehostete Probe mit vorhandenen freigeschalteten Akteuren und tatsächlicher
SQL-Rolle `authenticated`: MEMBER liest freigegebene Fahrzeuge und stellt
eine unverbindliche konkurrierende Anfrage; Genehmigung/direktes DML verweigert.
GLOBAL_ADMIN sieht alle Fahrzeuge, erhält die verbindliche Konfliktsperre;
alter Kalender liefert weiterhin nur bisherige Eintragsarten/fünf Gerätehäuser,
neuer Kalender genau die zwei verbindlichen Beispiele. Scheurener UNIT_ADMIN
erhält keine HLF-Verwaltung, kann aber das ausdrücklich freigegebene eigene
MTF sperren. Alle Probeeinträge, Audits und Nachrichten wurden zurückgerollt.
Das sind SQL-Claims-Prüfungen, kein signierter HTTP-Schreibtest.

Zusätzlich **sechs tatsächliche Auth-Anmeldungen** mit Profil-/Ressourcen-/
Reservierungs-RLS, Fahrzeug-Workspace, aktuellen Rollenbereichen, Dienstbuch,
Jahresberichten, gemeinsamen Kalendern und kanonischen IDs:
[42485274669](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42485274669),
erfolgreich, ausschließlich lesend, geschütztes Laufzeitpasswort, kein Service-Role-Key.
Wiederholen über den manuellen bestehenden Workflow, Modus `history-check`,
Projektbestätigung `orxinqhhbtjpkzwlfaxq`. Schreibender Benutzer-Seed bleibt
weiterhin main-only; die Feature-Freigabe betrifft nur den lesenden Prüfer.

## Automatisierte Nachweise

110 Fach-/Konfigurations-/Auth-Tests, 17 Skripttests, TypeScript und ESLint
erfolgreich. Alle **47 DEV-Browserfälle** einschließlich acht Fahrzeugfällen,
alle **19 lokalen Demo-Browserregressionen** und der gesperrte DEV-Setup-Fall
bestanden. DEV-, Demo- und gesperrter Pages-Static-Export gebaut.
Das separate Demo-Repository wurde weder geändert noch veröffentlicht.

Echte PostgreSQL-17-CI mit sämtlichen alten Regressionen, neuen Fahrzeug-RLS-/
Workflow-/Benachrichtigungs-/Seed-/Altclient-Prüfungen und beobachtetem
Zwei-Verbindungen-Locktest:
[42483198618](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42483198618),
erfolgreich. Im Locktest wartet der zweite Genehmiger tatsächlich an der
Fahrzeugzeile; nach Freigabe bleibt genau eine APPROVED- und eine
REQUESTED-Anfrage, kein zweiter Genehmigungs-Audit.
CI-Auth-Fixtures werden nur in der disponiblen `ff_dev_ci` angelegt,
niemals im gehosteten DEV.

Abschließende SQL-CI einschließlich 024, exakten alten/neuen Klassifikations-
und Zweckwerten sowie verweigerter MEMBER-Konfiguration:
[42485598877](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42485598877),
ebenfalls erfolgreich, Quellcommit `9d7c0f6fa2de72be6e7e9bf84190b9ea7a22601e`.

| Nr. | Anforderung | Tatsächlicher automatisierter Nachweis |
|---|---|---|
| 1 | Fahrzeug anlegen | SQL-RPC und GLOBAL_ADMIN-Browserfall |
| 2 | Fahrzeugübersicht | SQL-Workspace, Browser, signierte DEV-Abfragen |
| 3 | Eigener Fahrzeugkalender | Monats-/Wochen-/Listen-Browserfall und Zeitraum-Fachtests |
| 4 | MEMBER stellt Anfrage | SQL-RPC, Browser, gehostete Rollback-Probe |
| 5 | REQUESTED gespeichert | SQL-Status/RLS und Browser |
| 6 | Zuständiger Verwalter genehmigt | SQL mit MEMBER als explizitem Verwalter, Browser |
| 7 | Unberechtigte Genehmigung gesperrt | SQL/RPC und gehostete MEMBER-/UNIT_ADMIN-Probe |
| 8 | APPROVED mit Akteur/Zeit | SQL und Browser |
| 9 | Pflichtgrund Ablehnung | SQL und Browser einschließlich leerem Grund |
| 10 | Stornierung mit Pflichtgrund | SQL und Browser |
| 11 | Verbindlicher Zeitraum | SQL, Konflikt-Fachtests, gehostete Probe |
| 12 | Keine Überschneidung | SQL und Browser-Serverfehler |
| 13 | Parallele Genehmigungen | Echte getrennte PostgreSQL-Verbindungen, beobachteter Lock-Wait |
| 14 | Fahrzeugbezogene Verwalterrechte | SQL fremdes Fahrzeug, Rechteerweiterung und Widerruf |
| 15 | UNIT_ADMIN ohne fremde Rechte | SQL, gehosteter RPC, signierte Workspace-Fähigkeiten |
| 16 | GLOBAL_ADMIN-Konfiguration | SQL und Fahrzeug-CRUD-Browserfall |
| 17 | FIRE_CHIEF nur Fahrzeug-Leserechte | SQL und eigener Browserfall |
| 18 | Fahrzeug sperren | SQL, Browser und gehosteter eigener UNIT_ADMIN |
| 19 | Sperrung blockiert Genehmigung | SQL und Konflikt-Fachtests |
| 20 | Gemeinsamer Kalender | SQL, gehosteter neuer RPC, Browser öffnet kanonischen Kalenderchip |
| 21 | REQUESTED nicht verbindlich | SQL-Ereignis-RLS und Filter, Browser-Status |
| 22 | Interne Nachrichten | SQL Empfänger-/Lesezustand, Browser, tatsächliche DEV-Datensätze |
| 23 | RLS und direkte Schreibsperren | SQL, gehostete authenticated-Probe, sechs echte Anmeldungen |
| 24 | Audit | SQL Status-/Akteur-/Zeitprüfungen; Vorher-/Nachher-Konfiguration mit 024 |
| 25 | Gerätehausbelegung bleibt | Bestehende Kalender-SQL- und vier Gerätehaus-Browserfälle |
| 26 | Terminverwaltung bleibt | Bestehende Fach-/SQL-/Zwei-Sitzungs-Browserregressionen |
| 27 | Anwesenheit bleibt | Bestehende SQL-/Parallelitäts-/Browserregressionen |
| 28 | Dienstbuch bleibt | Bestehende Berichts-SQL-/Browserfälle und signierte DEV-Abfragen |
| 29 | Jahresstatistik bleibt | Bestehende Berichts-SQL-/Browserfälle und signierte DEV-Abfragen |
| 30 | Pages Static Export | DEV-/Demo-/gesperrte Builds und bestehende PWA-Regressionsfälle |

Browserfälle verwenden abgefangene synthetische Protokollantworten. Sie prüfen
wirkliches Rendering/Bedienung, sind aber **keine veröffentlichte reale Abnahme**.
Reale A–F-Ergebnisse bleiben bis zur Nutzerabnahme nach manuellem Merge offen.
Nach erfolgreichem main-Deployment die sichtbare DEV-0.6-/Commit-/Build-ID prüfen,
gegebenenfalls das kontrollierte PWA-Update bestätigen; kein aggressiver Reload.
