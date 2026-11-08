# DEV 0.5: gemeinsamer Feuerwehrkalender

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
