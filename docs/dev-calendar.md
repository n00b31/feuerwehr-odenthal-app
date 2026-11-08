# DEV 0.5: gemeinsamer Feuerwehrkalender

## DEV 0.6.3 – Implementierungsplan

1. Bestehende `events`/`event_series`, dynamische Mitgliedschaften und
   Teilnahme-/Anwesenheits-RPCs weiterverwenden. Serieninstanzen behalten eigene
   IDs. Neue Verwaltung ergänzt Vorschau/Bestätigung, keine zweite Terminquelle.
2. Vorhandene Grenze von 52 Serieninstanzen pro Vorgang beibehalten;
   maximal fünf Jahre Planungshorizont, CSV maximal 200 Termine/512 KiB.
   Berlin-Ortszeiten explizit prüfen, nicht existierende Zeiten ablehnen,
   doppelte Herbststunden wie bisher auf die frühere Ausprägung abbilden.
3. Einheit/Funktion/Organisation bleiben exklusive bestehende Bereiche.
   Keine Rechte für MEMBER oder bloße FIRE_CHIEF-Rolle erweitern.
   Alle Vorschläge serverseitig erneut prüfen; atomare, wiederholbare
   Bestätigung mit Duplikat-/Stale-Prüfung und Audit.
4. Einzel-/Folge-/Gesamtserienänderungen erhalten IDs und rohe Antworten.
   Begonnene oder eingefrorene Instanzen bleiben unverändert.
   Bedeutungsänderungen zeigen Antwortinvalidierung vor Bestätigung an;
   individuelle Ausnahmen bleiben bei gewöhnlicher Serienänderung geschützt.
5. UTF-8-Semikolon-CSV mit deutschen/ISO-Daten, quotierten Feldern,
   kommentierter Excel-Vorlage und zeilenbezogener Fehleranzeige.
   Kein Schreiben bei Dateiauswahl oder Vorschau; keine stillen Teilimporte.
6. Bestehende und neue Fach-/Browser-/SQL-/Konkurrenz-/Upgradeprüfungen
   vor kontrollierter DEV-Migration und PR ohne automatischen Merge ausführen.

## DEV 0.6.2: dynamische Zuordnung und persönliche Rückmeldungen

**DEV 0.6.2 veröffentlicht; die unten aufgeführten Browserergebnisse sind
vom Projektverantwortlichen manuell bestätigt.**
Der [Installations- und Prüfnachweis](dev-vehicles.md#kontrollierte-installation-und-prüfnachweis-am-08112026)
dokumentiert unveränderte Altdaten und historische Berichte.
Migrationen 028–032 ergänzen Mehrfachmitgliedschaften und die neue
Zuordnungslogik. Ein zusätzliches aktuelles Einheitsintervall ist nur durch
GLOBAL_ADMIN mit Änderungsgrund möglich. Die bisherige Wechselaktion
ersetzt weiterhin die aktuellen Einheiten; Entfernen schließt nur die
gewählte Mitgliedschaft. Bestehende Rollen werden nicht automatisch erweitert.

Bei bereichsgebundenen zukünftigen Diensten bestimmt die gültige Einheits-,
Organisations- oder Funktionsmitgliedschaft den Teilnehmerkreis neu.
Mehrfachmitglieder erscheinen einmal. Explizite Einladungskreise werden nicht
automatisch erweitert und behalten zusätzlich ihre Bereichsprüfung.
Die erste Anwesenheitsinitialisierung bewertet den Kreis am Dienstbeginn,
nicht mit der späteren heutigen Mitgliedschaft. Bereits initialisierte oder
abgeschlossene Listen bleiben eingefroren: Personen, Einheits-Snapshot,
Anwesenheiten, Bestätigungen und historische Zuordnung werden nicht ersetzt.

Nicht mehr berechtigte zukünftige Rückmeldungen bleiben mit ursprünglichem
Wert und Änderungszeitpunkt gespeichert, werden aber als ungültig markiert.
Ein späterer Wiedereintritt reaktiviert sie nicht; eine neue ausdrücklich
abgegebene Rückmeldung ist erforderlich. Unterbrechungsfreie organisatorische
Zugehörigkeit bei einem Einheitswechsel bleibt erhalten. Die Initialisierung
übernimmt nur gültiges Ja als vorläufig anwesend; alle anderen Fälle werden
abwesend vorbelegt. Diese Vorbelegung ist keine bestätigte tatsächliche Teilnahme.

Die Mitgliederverwaltung bietet eine Einheitsauswahl mit „Alle Einheiten“,
behält die Namenssuche und sortiert nach Einheit und alphabetischem Namen.
Mehrfachmitglieder erscheinen insgesamt einmal und sind in allen vom
Verwaltungsbereich gelieferten aktuellen Einheiten filterbar. Bei mehreren
Einheiten ist die alphabetisch erste die Sortiergruppe; im Einheitsfilter
wird nur nach Namen sortiert. Einheitsdaten kommen aus dem Backend.
Die Verwaltungsberechtigungen bleiben unverändert.

Persönliche Zusagen sind grün mit Haken, Absagen rot mit X, Vielleicht
bernsteinfarben mit Fragezeichen, fehlende Antworten neutral grau.
Dashboard, Dienstübersicht, Details und Teilnahmeeinträge im gemeinsamen
Kalender verwenden dieselbe Darstellung in Light und Dark Mode.
Terminabsage und tatsächliche Anwesenheit bleiben davon getrennte Zustände.

### DEV 0.6.2 – Erfolgreiche manuelle Abnahme

Mit dem Auftrag vom 08.11.2026 manuell bestätigt: Navigation aller drei
Terminbereiche; relevante zukünftige Termine für neue Mitglieder und nach
Einheitswechsel bei erhaltener Anwesenheitshistorie; Einheitsfilter,
alphabetische Sortierung und deduplizierte Mehrfachmitgliedschaften;
grüne/rote/gelbe/neutrale Rückmeldungsfarben. Fahrzeugreservierungen,
Antragstellerrechte, Doppelbuchungsschutz und begründete Stornierung mit
Freigabe des Zeitraums wurden ebenfalls bestätigt.

Abgenommener Commit: `84037cf3fc5d2281d2493ccf9b3b7571cef9c3c7`.
Tag: `v0.6.2-vehicles-memberships-dev`. Veröffentlicht: DEV 0.6.2,
Pages-Lauf `42515134524`, Deployment `7640714241`.
Der [vollständige manuelle Nachweis](dev-vehicles.md#dev-062--erfolgreiche-manuelle-abnahme)
enthält die sechs Testergebnisse, Bestätigungsdatum, PWA-Build-ID und offene
native iPhone-/Android-PWA-Gerätetests.

Nicht zusätzlich behauptet: gesonderte reale Tests für Funktionswechsel,
feste Einladungen, ungültige alte Antworten und alle speziellen
Jahresberichts-/Serienfälle. Die DEV-0.5.1-Abnahme unten bleibt unabhängig.

## DEV 0.5.1 – Erfolgreiche manuelle Abnahme

Der Projektverantwortliche hat am **08.11.2026** die reale Abnahme von
**DEV 0.5.1** ausdrücklich manuell bestätigt, nicht aus automatisierten
Testergebnissen abgeleitet:

- Kalenderansichten und Filter erfolgreich getestet.
- Organisatorische Termine erstellt, angezeigt, bearbeitet und abgesagt.
- Gerätehausbelegung erfolgreich getestet: alle fünf Gerätehäuser Scheuren,
  Scherf, Blecher, Voiswinkel und Eikamp auswählbar; Belegungen erstellt, im
  Kalender angezeigt, bearbeitet und abgesagt; Konfliktwarnung funktioniert.
- Bestehende Übungsdienste, Teilnahme, Anwesenheit, Dienstbuch und
  Jahresstatistiken weiterhin erfolgreich getestet.

Gesicherter, tatsächlich veröffentlichter main-/Merge-Commit von
[PR #17](https://github.com/n00b31/feuerwehr-odenthal-app/pull/17):
`f33383decad824dccabf135a00768fd1172ee137`.
Annotierter, unverändert zu GitHub gepushter Tag: **`v0.5.1-calendar-dev`**.
Beschreibung: "Feuerwehr Odenthal DEV 0.5.1 – Shared calendar, organizational
events and fire station resources validated."

[Pages-Lauf 42480259516](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42480259516)
baute denselben Commit aus main; Build, Auth, DEV-Export und Deployment waren
erfolgreich. Das öffentliche `release.json` nennt DEV 0.5.1, diesen vollständigen
Commit, `sourceDirty=false` und Build-ID
`f33383decad8-3febe324-d87b-4634-a915-af49014bb27f`.
Das heruntergeladene DEV-Artefakt wurde am 08.11.2026 mit dem öffentlichen
Stand verglichen: Versionsnachweis und 72 geprüfte Anwendungsdateien stimmen
bytegenau überein.

**Noch offen:** native installierte iPhone-/Android-PWA-Gerätetests. Dafür
wurde keine erfolgreiche Abnahme behauptet. Diese Dokumentation wurde vor
der Fahrzeugentwicklung separat mit
`47356ca72a9c2d86d5d9bcf7b2bbd1c14fea2167` committed und wird im DEV-0.6-PR
mitgesichert; ein zusätzlicher Dokumentations-PR ist nicht erforderlich.

## Plan und Architektur

1. DEV 0.4.1 anhand main, Release-Artefakt und Pages nachweisen, annotiert taggen
   und die ausdrücklich bestätigte Nutzerabnahme separat sichern.
2. `events` als einzige Terminquelle behalten. Organisatorische Einträge bekommen
   eine 1:1-Ergänzung ohne doppelte Titel, Zeiten oder Identitäten.
3. Sichtbarkeit/Rollen, Ressourcen, Belegungswarnungen und begrenzte
   Monats-/Wochenabfragen serverseitig implementieren.
4. Monat/Woche/Liste und Filter im bestehenden Terminbereich integrieren.
   Dienste öffnen die bestehende Teilnahme-/Anwesenheits-/Bearbeitungsfunktion.
5. Fach-/SQL-/RLS-/Browser-/Static-Export-Regressionen prüfen, Migrationen
   kontrolliert im DEV anwenden, tatsächliche Ergebnisse und offene Abnahme
   dokumentieren und PR ohne automatischen Merge erstellen.

`events` bleibt die einzige Terminverwaltung. `event_calendar` enthält nur
Informations-/Belegungsart, Ganztägigkeit, Sichtbarkeit, Kategorie, Ressource
und Archivierungszeit. `calendar_event_units` enthält Mehrfacheinheits-Zielgruppen.
Bestehende Dienste besitzen keine Zusatzzeile und erscheinen automatisch mit
ihrer bisherigen ID. Neue Informationen und Belegungen erhalten keine
Teilnehmerlisten, Antworten oder Anwesenheiten und werden aus Dienstbüchern
und deren Pending-/Fehlzeitenberechnung ausgeschlossen.

Migration 018 ergänzt Kategorien/Ressourcen und geprüfte Schreib-RPCs.
Migration 019 ergänzt paginierte Zeitfenster und isoliert die bestehende
Dienstlisten-/Berichts-API von reinen Kalenderinformationen.
Keine bisherigen Tabellenzeilen, Auth-Konten, Rollen oder Bestätigungen werden
umgeschrieben. Der DEV-0.4.1-Seed-Fingerprint muss unverändert bleiben.

## Berechtigungen

MEMBER liest ausschließlich berechtigte Ereignisse und Ressourcen.
UNIT_ADMIN verwaltet organisatorische Einträge seiner Einheit und deren
Gerätehäuserbelegungen. FUNCTION_ADMIN verwaltet seine Funktionen.
FIRE_CHIEF erhält **ausdrücklich nur fachliche organisationsweite
Kalenderverwaltung**; Kategorien, Ressourcen, Konten und technische Rollen
bleiben GLOBAL_ADMIN vorbehalten. Globale Administration verwaltet alle Bereiche.

Sichtbarkeit umfasst Bereichsmitglieder, ausgewählte mehrere Einheiten und
Führungskreise. Bei organisationsweitem Führungskreis sind Einheitsführung,
Wehrleitung und globale Administration berechtigt; ein Funktionsadministrator
ist dadurch nicht pauschal organisationsweite Führung. Eigene Bereichsverwaltung
und organisationsweite Berichtseinsicht bleiben berücksichtigt.

RLS schützt Ereignisse, Zusatzdaten, Zieleinheiten und Ressourcen. Alle
Änderungen laufen über Security-Definer-RPCs mit leerem `search_path`,
erneuter Freigabe-/Bereichsprüfung, Revisionen und Append-only-Audit.
Ressourcen und Kategorien werden deaktiviert statt gelöscht; Informationen
werden archiviert statt historische Beziehungen zu entfernen.

## Ressourcen und Zeit

Konfigurierbare Ressourcentypen sind Gerätehaus, Raum, Fahrzeug und Material.
DEV 0.5 erlaubt ausschließlich Gerätehausanlage/-belegung. Fahrzeuge, deren
Reservierungen und Genehmigungsworkflows sind **nicht implementiert**.
Es gibt keine hart codierten Gerätehausnamen.

Überlappungen verwenden echte Zeitpunkte und halboffene Intervalle `[Beginn,Ende)`.
Direkt anschließende Belegungen kollidieren nicht. Eine Ressourcensperre
serialisiert die serverseitige Prüfung; Überschneidungen warnen, blockieren
aber nicht und sind keine Genehmigung. Berechtigte Nutzer können auch belegte
Intervalle privater Einträge erkennen, jedoch ohne deren ID oder Titel.

Alle Zeitfenster verwenden Europe/Berlin und höchstens 42 ganze lokale Tage.
400 Einträge je Cursorseite, höchstens 4.000 pro vollständiger UI-Abfrage;
bei Überschreitung wird explizit zum Eingrenzen aufgefordert, nicht still gekürzt.
Ganztägige Formular-Endtage sind einschließlich, gespeicherte Endzeitpunkte
ausschließlich. Damit umfassen Zeitumstellungstage korrekt 23 oder 25 Stunden.
Nicht existente lokale Uhrzeiten werden abgewiesen; doppelte Herbst-Uhrzeiten
verwenden wie bestehende Formulare die frühere Instanz.

Eine Belegung referenziert zunächst genau eine Ressource. Warnungen berücksichtigen
nur ausdrücklich zugeordnete Ressourcen, nicht den Freitext-Ort vorhandener Dienste.
GLOBAL_ADMIN darf auch ein Gerätehaus einer anderen Einheit koordinieren;
Einheitsführung darf nur eigene oder gemeinsam verfügbare Ressourcen verwenden.

## Ausgeführte Prüfungen und kontrollierte DEV-Anwendung

Geprüfte SQL-Quelle:
`e5838750868a21527705fef80995a5b558f6ec6b`.
Abschließend geprüfter UI-/Adapterstand:
`b4f803cc3c4eb20c556c8cc152ce136bb9e348a8`.
Die Änderungen an der unabhängigen Demo sind ausgeschlossen; ihre lokalen
Regressionen verwenden ausschließlich den bestehenden Demo-Modus dieses Checkouts.

| Prüfung | Tatsächliches Ergebnis |
|---|---|
| Fach-, Konfigurations-, Auth- und Skripttests | 102 + 17 Tests bestanden |
| Lint / TypeScript | Bestanden |
| DEV-Browserregressionen | 35 bestanden, einschließlich sieben Kalenderfällen; synthetische, abgefangene Supabase-Antworten |
| Lokale Demo-Browserregressionen | 19 bestanden |
| Gesperrter DEV-Static-Export | Build und ein Browserfall bestanden; ohne externe Zugangsdaten |
| PostgreSQL 17 / SQL / RLS | [Run 42416268533](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42416268533) erfolgreich; echte isolierte Datenbank, zurückgerollte CI-Fixtures |
| Gehostete DEV-RPC-/RLS-Prüfung am 08.11.2026 | Bestanden mit bestehenden freigegebenen Akteuren, `authenticated` und transaktionslokalen Claims; keine echte HTTP-Anmeldung in dieser SQL-Prüfung |
| Tatsächliche signierte Auth-/PostgREST-Prüfung | [Run 42463756877](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42463756877) erfolgreich: sechs bestehende Testkonten, Profil-RLS, Jahresberichte, Bereichssperren, Kalender und identische Dienst-IDs; ausschließlich Leseaufrufe |

Der erste echte HTTP-Lauf
[42463461854](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42463461854)
scheiterte beim Kalenderabruf: Der Adapter hatte das vollständige
`calendarRange`-Objekt einschließlich `days`, `start` und `end` an die RPC
weitergegeben. Diese Anzeigefelder gehören nicht zur Datenbanksignatur.
Die Anfrage überträgt jetzt ausschließlich die beiden Zeitgrenzen und die
definierten Filter-/Cursorparameter. Ein zusätzlicher Test verwendet das echte
Supabase-SDK mit streng geprüftem HTTP-Body über zwei Cursorseiten; auch die
Browser-Fixtures prüfen jetzt die vollständige Parameterliste.
Danach wurden alle 35 DEV-Browserfälle erneut erfolgreich ausgeführt.
Es war keine weitere Datenbankmigration erforderlich.

Nach den tatsächlichen Anmeldungen waren Seed-Fingerprint, acht Auth-Identitäten,
50 historische Profile, 262 Seed-Termine und 2.616 Bestätigungen weiterhin
unverändert. Auth-Anmeldungen können legitim Auth-Metadaten aktualisieren;
für diese Phase wird deshalb nicht Bytegleichheit sämtlicher Auth-Zeilen behauptet.
Die temporären Testsitzungen wurden lokal abgemeldet, keine bestehenden fremden
Sitzungen widerrufen. Testpasswort ausschließlich aus dem vorhandenen geschützten
GitHub-Secret, kein Service-Role-Key.

Die kontrollierte Anwendung erfolgte auf ausdrückliche Freigabe über den
angemeldeten SQL-Editor im bestehenden Projekt `orxinqhhbtjpkzwlfaxq`.
Quellen wurden vor Ausführung anhand des unveränderlichen Git-Commits und
SHA256 geprüft. Schemaänderung und Historienregistrierung erfolgten jeweils
innerhalb einer Transaktion.

| Quelle | Gehostete Version / Name | SHA256 der Git-Quelle |
|---|---|---|
| `20261107001800_calendar.sql` | `20261108082922` / `ff_018_shared_calendar` | `57bd90f5f303be118841d655cddac21f95c101d268ec1be27c166c32c82b043d` |
| `20261107001900_calendar_queries.sql` | `20261108083239` / `ff_019_calendar_queries` | `5ddd2bad7248a5816eaecd029c6182db71041e14700e7ac44db4de520c464f0e` |

Die gespeicherten Originalquellen stimmen bytegenau überein:
MD5 `d4dd16f9e66a572ed400072cd3d01f0e` beziehungsweise
`cb833dea3fb8923eed8b81934285f889`.
Bei der ersten Historienregistrierung hatte JavaScript-Ersetzung `$$` nur
innerhalb der gespeicherten Quellenkopie zu `$` verkürzt. Diese Metadaten wurden
gezielt korrigiert und erneut geprüft; die ausgeführte DDL war davon nicht betroffen.
Die zweite Registrierung verwendet Base64 und eine Ersetzungsfunktion.
Das ist keine Wiederanwendung der Migration.

Der SQL-Editor erkennt das dynamische RLS-Aktivieren in Migration 018 nicht
statisch. Es wurde die geprüfte Quelle ohne automatische SQL-Ergänzungen des
Editors ausgeführt. Unabhängig bestätigt: alle vier neuen Tabellen mit RLS,
keine direkten INSERT-/UPDATE-/DELETE-Rechte für `authenticated`.
Die abweichenden gehosteten Versionsnummern vor einem späteren CLI-`db push`
berücksichtigen; nicht blind erneut anwenden oder Migrationen reparieren.

Unmittelbar vor und nach beiden Migrationen sowie nach der zurückgerollten
RPC-Prüfung waren folgende Nachweise identisch:

| Bestand | Unverändertes Ergebnis |
|---|---|
| Historien-Fingerprint | `6fd6737be8dab684db406d63507b7989` |
| Geschützter Bestands-Fingerprint einschließlich Auth-/Audit-Zeilen | `6d694cf831e8e7d7864d4c3c39daf487` |
| Auth-Identitäten | 8 |
| Nicht anmeldbare historische Profile / Seed-Termine | 50 / 262 |
| Bestätigte Seed-Anwesenheiten | 2.616 |

Gehostet geprüft wurden GLOBAL_ADMIN-Ressourcenanlage und Informations-CRUD
mit Audit/Revisionen; MEMBER-Lesezugriff und private Ereignis-/Metadaten-RLS;
Redaktion privater Konfliktidentitäten; abgewiesene MEMBER-Schreib-/Ressourcen-/
Teilnahmeaufrufe; eigene UNIT_ADMIN-Belegung mit nicht blockierender Warnung
und fremde Schreibsperre; sowie temporäre FIRE_CHIEF-Kalenderrechte ohne
Kategorien- oder Kontenadministration. Alle Probeeinträge und die temporäre
Rollenzuweisung wurden zurückgerollt. Danach existierten keine Probeeinträge
oder Gerätehausressourcen. Es wurden keine zusätzlichen dauerhaften
Kalender-Testdaten benötigt: die vorhandenen synthetischen Dienste erscheinen
bereits im Kalender; Test C legt sein Gerätehaus ausdrücklich selbst an.

### Nachweis der 24 angeforderten Testbereiche

| Nr. | Bereich | Abdeckung |
|---|---|---|
| 1 | Vorhandene Dienste | SQL-Kalender-ID und Browser-Handoff zur bestehenden Ansicht |
| 2 | Keine Duplikate | SQL-Identitätsvergleich und Cursor-Paging |
| 3 | Monat | Kalender-Browserfall |
| 4 | Woche | Kalender-Browserfall und Überlappungsspuren-Fachtests |
| 5 | Liste | Kalender-Browserfall |
| 6 | Monatswechsel | Kalender-Browserfall und Berlin-Zeitfenster |
| 7 | Kombinierte Filter | Browser und SQL; Typ/Eintragsart ODER innerhalb einer Filtergruppe |
| 8 | Einheitsfilter | SQL mit Mehrfacheinheits-Zielen und fremden Bereichen |
| 9 | Globale Sichtbarkeit | SQL und gehosteter MEMBER-Lesezugriff |
| 10 | Sonderfunktionen | SQL mit FUNCTION_ADMIN und unberechtigtem MEMBER |
| 11 | Information erstellen | SQL, Browser und gehosteter RPC |
| 12 | Information bearbeiten | SQL, Browser und gehostete Revision |
| 13 | Information absagen | SQL, Browser und gehosteter RPC |
| 14 | Keine Teilnahme für Informationen | SQL-Roster-/RPC-/Berichtssperren, Browser und gehosteter RPC |
| 15 | Gerätehausbelegung | SQL, Browser und gehosteter RPC |
| 16 | Überschneidungen | SQL und gehostete Warnung/Redaktion, Browser; anschließende Intervalle kollidieren nicht |
| 17 | Ressourcen-Schreibsperren | SQL-DML-/RPC-Prüfung und gehosteter MEMBER-RPC |
| 18 | FIRE_CHIEF ohne technische Administration | SQL und gehostete zurückgerollte Rollenzuweisung |
| 19 | Fremde RLS-Daten | SQL und gehostete Ereignis-/Metadaten-RLS |
| 20 | Berlin / DST / ganztägig | Fachtests und SQL für 23-/25-Stunden-Tage und exklusive Endgrenzen |
| 21 | Erhalt bei Hintergrundaktualisierung | Kalender-Browserfall über vier simulierte Intervalle; Dialog-/Editor-Knoten und Entwürfe bleiben erhalten |
| 22 | Bestehende Anwesenheit | Bestehende DEV-Browser-/Fach-/SQL-Regressionen einschließlich Delegation und Sperren |
| 23 | Bestehendes Dienstbuch | Bestehende Berichts-/SQL-/Browserregressionen und Ausschluss reiner Informationen |
| 24 | Pages Static Export | DEV-/Demo-/gesperrte Builds und Browserregressionen |

Browserantworten und beschleunigte Aktualisierungsintervalle sind keine reale
veröffentlichte Benutzerabnahme. Die SQL-CI-Fixture schreibt direkt in
`auth.users` ausschließlich in der ausdrücklich isolierten CI-Datenbank und
wurde **nicht** im gehosteten DEV ausgeführt.

## Bewusste Begrenzung organisatorischer Serien

Die bestehende Serienarchitektur erzeugt Teilnahme-/Roster-Daten und kennt
noch keine Zusatzmerkmale, Mehrfacheinheits-Zielgruppen oder Belegungswarnungen
je Instanz. Ihre sichere Erweiterung erfordert versionierte Serienmetadaten,
atomare Instanz-/Ressourcenprüfung und getrennte Bearbeitungsregeln.
Gemäß B9 werden deshalb zunächst **organisatorische Einzeltermine** implementiert.
Bestehende Dienstserien und unabhängige Instanzen bleiben unverändert.

## Manuelle Abnahme: vorzubereiten, nicht als erfolgt behauptet

A: Monat, Woche und Liste öffnen; Monate wechseln; Tag/Termin öffnen;
Bereichs-, Einheits-, Typ-, Kategorie- und Ressourcenfilter kombinieren.

B: MEMBER-Sichtbarkeit und interne fremde Einheiten prüfen; GLOBAL_ADMIN
erstellt eine globale Information; beim MEMBER sichtbar, ohne Teilnahmeabfrage.
Führungskreise und Sonderfunktionen separat prüfen.

C: Gerätehaus konfigurieren, Belegung und überlappende Belegung erstellen,
Warnung und geschützte Konfliktdetails prüfen, bestehende Belegung ändern,
absagen und archivieren.

D: Dienst über vorhandene Verwaltung erstellen, Teilnahme melden,
Anwesenheit abschließen, Dienstbuch und Jahresstatistik vergleichen.
Kalenderdialog/Filter/Formular mindestens 130 Sekunden geöffnet lassen.

Native installierte iPhone-/Android-PWA-Abnahme bleibt offen.
Keine neue Kalenderabnahme wird allein aus synthetischen Browserantworten
oder erfolgreichen SQL-Tests abgeleitet.

## DEV 0.5.1: Gerätehaus-Stammdaten und Auswahl

PR #16 wurde am 08.11.2026 mit
`f8a14d362c38a85c8068b732dd5d28f1738d9226` gemergt.
Der Benutzer hat Kalenderansichten (A), organisatorische Termine (B) und
bestehende Funktionen (D) erfolgreich abgenommen. Gerätehausbelegung (C)
war nicht erfolgreich: Im gehosteten DEV waren **null Ressourcen** vorhanden.
Migration 018 hatte den Ressourcentyp und die Konfiguration bereitgestellt,
aber bewusst keine Gerätehaus-Stammdaten angelegt. RLS und
`ff_calendar_context` filtern bestehende Zeilen korrekt; es fehlten die Zeilen.
Zusätzlich bot das Formular weder die eigene Vorauswahl noch einen
verständlichen Hinweis bei fehlenden Ressourcen.

Die tatsächlichen fünf Einheiten sind Scheuren, Scherf, Blecher, Voiswinkel
und **Eikamp**. Migration `20261108002000_firestations.sql` übernimmt IDs und
Namen aus `units`, ohne neue Einheiten oder hart codierte UUIDs. Sie ergänzt
je Einheit nur ein fehlendes `building` mit Namen `Gerätehaus <Einheit>`.
Vorhandene Ressourcen werden nicht umbenannt, reaktiviert oder ersetzt.
Eine Tabellensperre serialisiert konkurrierende Stammdatenanlage; vorhandene
mehrfache Gerätehäuser je Einheit werden explizit zur Prüfung gemeldet,
nicht gelöscht. Neue Ressourcen werden mit Herkunft `DEV051-firestations`
über den bestehenden Audit-Helper protokolliert. Erneute Ausführung erzeugt
weder Ressourcen- noch Audit-Duplikate.

Das Formular verwendet ausschließlich aktive, vom Server gelieferte
Gerätehäuser. Bei Einheitsverwaltung sind zusätzlich nur eigene oder
gemeinsame Ressourcen auswählbar; GLOBAL_ADMIN behält die bestehende
berechtigte Auswahl anderer Einheiten. Beim Wechsel zur Belegung wird
das eigene Gerätehaus aus der aktuellen Hauptmitgliedschaft vorausgewählt,
auch beim globalen Administrator. Bestehende Belegungen behalten ihre
Auswahl. Ohne Ressourcen werden eine konkrete Fehlermeldung und keine
leere Auswahlliste angezeigt; Speichern und Konfliktprüfung sind gesperrt.
Wird eine gewählte Ressource während der Bearbeitung deaktiviert, bleibt
der Entwurf erhalten, erfordert aber eine ausdrückliche neue Auswahl.

Bestehende RLS, Schreib-RPCs und Rollen bleiben unverändert:
UNIT_ADMIN verwaltet eigene Belegungen, MEMBER liest berechtigte Einträge,
GLOBAL_ADMIN verwaltet alle Gerätehäuser. Technische Ressourcen-Stammdaten
bleiben wie bisher GLOBAL_ADMIN vorbehalten. FIRE_CHIEF liest organisationsweit;
seine in DEV 0.5 ausdrücklich eingeräumten fachlichen Kalenderrechte werden
weder erweitert noch entzogen. Warnungen bei Überschneidungen bleiben
nicht blockierend; keine verbindliche Reservierungssperre.

Prüfplan: Migration in PostgreSQL-CI zweimal ausführen; fünf aktive
Einheitsressourcen und unveränderte Auditanzahl prüfen; bestehende
SQL-Kalendertests mit den tatsächlich angelegten Gerätehäusern nutzen;
SDK-/Fach-/Browserregressionen, eigene Vorauswahl, Fremdauswahl,
leere/deaktivierte Ressourcen und Belegungs-CRUD prüfen; anschließend
kontrollierte DEV-Anwendung, zurückgerollte echte RPC-/RLS-Prüfung und
signierte Leseprüfung mit den sechs bestehenden Testkonten.

### Tatsächliche DEV-Anwendung und Erhaltung

Migration 020 wurde am 08.11.2026 über das projektgebundene Supabase-MCP
im bestätigten Projekt `orxinqhhbtjpkzwlfaxq` angewendet:
`20261108100532` / `ff_020_unit_firestations`.
Quelle aus Commit `49d4c8e2c80eda9352d9e9d35ae074bcbb3a38f8`,
SHA256 `dffc951d210c8974d972ccf68e370ffbceb93881fe5816fb54a432e1d7ffd0bd`.
Die gespeicherte Originalquelle stimmt bytegenau überein:
MD5 `9ea8dc65751f81032c4f157b3a4811dc`.

| Aktive Ressource | Vorhandene Einheits-ID |
|---|---|
| Gerätehaus Scheuren | `72bd86e8-2017-451b-8523-59d9d1c871ef` |
| Gerätehaus Scherf | `458dae15-ba37-43eb-9e75-b2296092aed7` |
| Gerätehaus Blecher | `e07f979e-adde-4785-b005-95f24a4f92fc` |
| Gerätehaus Voiswinkel | `c8495f81-857a-434a-be67-d9e3da06955d` |
| Gerätehaus Eikamp | `b61593b7-df4e-4692-b8df-8026cc512c67` |

Vor und nach der Migration unverändert:
Fachdaten-Hash `71464984bbfba52a38576bb70ba028e0`
über Profile, Einheiten, Rollen, Mitgliedschaften, Termine, Roster, Antworten,
Anwesenheiten, Bestätigungen und Kalenderzusatzdaten; ursprünglicher
Audit-Hash `63ec8940792a46e6c3dd0afd089036db`; Historien-Fingerprint
`6fd6737be8dab684db406d63507b7989`.
Es wurden ausschließlich fünf Ressourcen und fünf entsprechend markierte
Audit-Einträge ergänzt. Acht Auth-Konten, 2.639 bestätigte Anwesenheiten
und zwei bestehende organisatorische Kalendereinträge bleiben erhalten.
Auth-Zeilen waren unmittelbar vor/nach Stammdatenanlage ebenfalls identisch;
spätere echte Testanmeldungen dürfen Auth-Metadaten aktualisieren.

Die gehostete RPC-/RLS-Transaktion mit vorhandenen freigegebenen Akteuren
prüfte Anlage, Kalenderanzeige, Warnung, Bearbeitung, Absage und Audit einer
Belegung, MEMBER-Lesezugriff, fremde Ressourcen-/Ereignissperren, direkte
Schreibsperren sowie organisationsweiten FIRE_CHIEF-Lesezugriff ohne
technische Ressourcenrechte. Sie wurde vollständig zurückgerollt,
einschließlich der temporären FIRE_CHIEF-Rolle. Keine Probeeinträge verblieben.
Fachdaten-/Audit-/Historien-Hashes waren danach weiterhin identisch.
Diese SQL-Prüfung verwendet transaktionslokale Claims und ist kein signierter
HTTP-Schreibtest.

### Tests und erneute Abnahme

| Nr. | Angeforderter Test | Tatsächlicher Nachweis |
|---|---|---|
| 1 | Genau fünf Gerätehäuser | Gehostete Bestandsabfrage und PostgreSQL-CI |
| 2 | Jeweils einer Einheit zugeordnet | Gehostete FK-/Einheitsabfrage und CI |
| 3 | Keine Duplikate | Migration zweimal in CI, weiterhin fünf Ressourcen/fünf Audit-Einträge |
| 4 | GLOBAL_ADMIN sieht alle | Gehostete authentifizierte SQL-RLS/Context-Prüfung und Browser |
| 5 | UNIT_ADMIN sieht berechtigte | Gehostete SQL-Prüfung und echte signierte Ressourcen-RLS; aktuelle Mitgliedschaften und Rollenbereiche berücksichtigt |
| 6 | MEMBER darf nicht administrieren | Gehostete RPC-Sperren, CI und Browser |
| 7 | Auswahl und eigene Vorauswahl | Vier neue Browserfälle und Fachtests, inklusive Fremd-/Leer-/Inaktiv-Auswahl |
| 8 | Belegung erstellen | Gehosteter RPC, CI und Browser |
| 9 | Anzeige im Kalender | Gehosteter RPC, Browser einschließlich Neuladen |
| 10 | Überschneidung | Gehosteter RPC, CI und Browser; Warnung blockiert nicht |
| 11 | Bearbeitung | Gehosteter RPC mit Revision/Audit, CI und Browser |
| 12 | RLS-/Schreibschutz | Gehostete Rollen-/RPC-/DML-Prüfung und CI |
| 13 | Kalenderregressionen | Alle 39 DEV-Browserfälle und bestehende SQL-/Fachtests bestanden |
| 14 | Pages Static Export | DEV-/Demo-Builds bestanden; abschließender Export und PR-CI separat nachvollziehbar |

104 Fach-/Konfigurations-/Auth-Tests und 17 Skripttests sind erfolgreich;
Lint und TypeScript ebenfalls. Die 19 lokalen Demo-Browserregressionen
bestanden ohne Änderung am separaten Demo-Repository.
SQL-CI einschließlich doppelter Stammdatenmigration:
[42469638986](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42469638986).
Echte sechs bestehende Auth-Anmeldungen mit signierten Profil-/Mitgliedschafts-/
Ressourcen-RLS- und Kalender-/Berichtsabfragen:
[42470421896](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42470421896).
Dieser Lauf ist ausschließlich lesend, ohne Service-Role-Key oder neue Konten.

Ein erster zusätzlicher Live-Prüflauf erwartete genau eine Ressource pro
Testkonto. Bestehende manuelle Mitgliedschaftsänderungen und getrennt
vergebene Einheitsrollen können aber mehrere berechtigte Lesebereiche ergeben.
Der Prüfer wurde auf aktuelle Mitgliedschaften **und** tatsächliche Rollenbereiche
korrigiert, nicht die Berechtigungen oder Mitgliederdaten.
Ein Testaufruf mit einer nicht mehr aktiven Zielgruppen-Mitgliedschaft als
verantwortlicher Person wurde vom bestehenden RPC korrekt abgewiesen.
Die erfolgreiche Belegungsprüfung verwendet eine tatsächlich aktuelle
freigeschaltete verantwortliche Person.

Browserfälle verwenden abgefangene Supabase-Protokollantworten. Die erneute
manuelle Abnahme C auf der veröffentlichten Anwendung ist davon getrennt:
Kalender aktualisieren, Gerätehaus auswählen, Datum/Zweck/Verantwortliche
eintragen, speichern, öffnen, bearbeiten und absagen; zweite zeitgleiche
Belegung mit Warnung prüfen. Stammdaten sind bereits im DEV vorhanden;
die verbesserte Vorauswahl und Fehlermeldung werden erst nach Benutzermerge
und Pages-Deployment sichtbar. Kein automatischer Merge oder Deployment.
