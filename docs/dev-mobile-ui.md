# Mobile UI: DEV 0.8 und DEV 0.8.1

## DEV 0.8.1 – Mobile UX Refinement · In Prüfung

PR #27 / DEV 0.8 wurde gemergt; der Projektverantwortliche hat die weitgehend
erfolgreiche iPhone-13-Abnahme und die fünf folgenden Verfeinerungen bestätigt.
DEV 0.8.1 bleibt bis zur erneuten manuellen Abnahme **In Prüfung**.
Kein automatischer Merge, kein Release-Tag vor Abnahme und kein Beginn von DEV 0.9.

1. **Gemeinsamer Header:** Die vorhandene kompakte Kopfzeile gilt nun auch auf
   Start. Dieselbe Komponente, unveränderte Brand-Assets, Glocke und Theme;
   mobile Abmeldung weiterhin im Profil. Die zusätzlichen `.compact-shell`-Regeln
   betreffen auf Start nur Header, Navigation und deren Dialoge. Die
   `.mobile-workspace`-Inhaltsregeln bleiben dort ausdrücklich deaktiviert.
   Cockpit-Kacheln, Inhalte und fachliche Abfragen sind unverändert; lediglich
   die beiden Dienstbuch-Linkziele führen nun zur bestehenden Statistik.
2. **Glockenvorschau:** Maximal fünf neueste berechtigte Inbox-Nachrichten,
   Symbol, Titel, zweizeilige Kurzbeschreibung, Berliner Datum/Uhrzeit und
   Gelesen-Status. Smartphone: natives Bottom Sheet; Desktop: kompakter Dialog
   nahe der Glocke. Escape, Außenklick, Schließen und Fokus-Rückgabe verwenden
   `AppDialog`. Leere Inbox und ausschließlich gelesene Inbox sind unterscheidbar.
   „Alle Benachrichtigungen“ und „Einstellungen“ führen zu den jeweiligen
   Profilankern. Die vorhandene `openNotice`-Logik prüft den Eintrag erneut
   serverseitig, markiert ihn wie bisher gelesen und öffnet ausschließlich die
   bisherigen validierten Direktziele. Entfallene Ziele werden erklärt.
3. **Einheitliche Navigation:** Nach der Korrektur im separaten Folge-PR:
   Start, Termine, Dokumente, Statistik, Mehr auf allen mobilen Seiten.
   Profil und berechtigte Administration stehen unter Mehr. PR #28 hatte
   zunächst Profil direkt und Statistik unter Mehr platziert.
   Mehr ist auf Profil/Administration aktiv; der aktuelle Link im Dialog wird
   zusätzlich durch `aria-current` und Theme-Farben markiert. Der Mehr-Button
   meldet seinen Öffnungszustand mit `aria-expanded`.
   Routen, Browser-Zurück, Desktop-Navigation, Rollenprüfung und Cockpit bleiben
   unverändert. Ohne `compact` bleibt auch die lokale Demo-Navigation unverändert.
4. **Kalender:** Unter 768 Pixel standardmäßig die maximal fünf nächsten
   laufenden oder zukünftigen Einträge, sortiert nach Beginn/ID. Bereits
   beendete Termine sind ausgeschlossen. „Weitere Termine anzeigen“ erweitert
   um fünf. Ab 768 Pixel bleibt Monat der Standard. Bewusste Monat-/Woche-/
   Listenwahl wird ausschließlich in `sessionStorage` getrennt nach App-Pfad,
   Benutzer und Mobil/Desktop gespeichert, nicht global oder dauerhaft.
   Fehlender Sitzungsspeicher wird angezeigt. Bestehende Filter, Berlin-/DST-
   Hilfen, Terminserien und Detail-/Bearbeitungsabläufe bleiben erhalten.
5. **Dienstbuch:** Nur noch die bestehende `SupabaseReports` unter Statistik;
   keine Kopie mehr im Profil, keine geänderten Auswertungen oder Daten.
   Profil, Push-Geräte, Kontoeinstellungen und persönliche Funktionen bleiben.
   Alte Profilanker `#dienstbuch`, `#dutybook`, `#diensthistorie` führen per
   Router-Replace zu `/statistik/#dienstbuch`; beide Cockpit-Verweise zeigen
   ebenfalls dorthin. Ein bloßes `/profil/` bleibt das
   Profil und wird nicht irreführend umgeleitet.

### Gemeinsame Inbox und Aktualisierung

`NotificationProvider` verwendet die vorhandene `ff_notifications`-RPC mit
Identitätsprüfung. Header und vollständige Inbox teilen denselben Stand und
genau einen vorhandenen 60-Sekunden-Aktualisierungstakt, ergänzt um Fokus,
Tab-Sichtbarkeit und `ff-notifications-changed`. Kein zweiter Inbox-Timer,
keine neue Nachrichten- oder Push-Verwaltung. Der Badge verwendet die gesamte
serverseitige Ungelesen-Anzahl, nicht nur die fünf Vorschauzeilen.
Bei Benutzer-/Freigabewechsel wird der Kontext neu aufgebaut; veraltete
Antworten werden verworfen. Unbestätigte Profile erhalten keine Inbox-Abfrage.
Dabei werden nur die Inbox-Daten verworfen, nicht die Anwendung neu gemountet:
eine im abgemeldeten Zustand empfangene opaque Push-Nachrichten-ID bleibt bis
zur geprüften Anmeldung und zum bewussten Öffnen erhalten.
Ungespeicherte Präferenzen werden durch Aktualisierungen nicht überschrieben.
Native Subscription-Abfragen bleiben im bestehenden Profil-/Geräteablauf;
die Glocke fragt weder Push-Berechtigung noch Subscription an.

### Erforderliche additive Lese-RPC und Rollout-Reihenfolge

Die bisherigen `ff_calendar_page` / `ff_calendar_vehicle_page` sind bewusst
auf 42 volle Berliner Tage begrenzt. Sie können die kalenderweit nächsten fünf
Einträge bei größeren Abständen nicht mit einer einzelnen Abfrage liefern.
Migration `20261110004000_calendar_upcoming.sql` ergänzt deshalb ausschließlich
die lesende `ff_calendar_upcoming`: bestehende `can_view_event`- und
`calendar_summary`-Prüfungen, aktive Freigabe, dieselben Filter und ausschließlich
verbindliche Fahrzeugvorgänge; kein Zugriff für `anon` oder `PUBLIC`.
Keine Tabelle, Mitgliedschaft, Rolle, Nachricht oder Termindaten werden geändert.
Es gibt keinen stillen Ersatz durch eine unvollständige Monatsliste.

**Rollout-Stand vom 10.11.2026:** PR #28 ist bereits gemergt und bereitgestellt.
Die separat autorisierte Installation von 040 ist erfolgt; der unten
dokumentierte Abgleich bestätigt den vollständigen SQL-Inhalt und den
tatsächlichen Historieneintrag. Der Navigations-Folge-PR ist davon getrennt und
wird nicht automatisch gemergt oder ausgerollt. Ohne RPC erscheint weiterhin
eine explizite Einrichtungsfehlermeldung; die Monatsansicht bleibt auswählbar.
Kein Dispatcher-, Auth-, Service-Worker- oder Cloud-Konfigurationsrollout.

Die mobile Vorschau ist auf 400 Einträge begrenzt, analog zur vorhandenen
Kalenderseitengröße. Bei weiteren Treffern führt die deutlich benannte Aktion
in den vollständigen navigierbaren Kalender; spätere Termine bleiben darüber
erreichbar. Laufende mehrtägige Termine werden einmal gezeigt, nicht pro Tag
dupliziert. Serverzeit entscheidet über „beendet“, Berlin nur über die Anzeige.

### Abschlussprüfung nach PR #28 und Navigationskorrektur

**Freigabe bleibt In Prüfung.** Automatisierte Browserprüfungen und der unten
beschriebene echte Konto-Test sind keine physische iPhone-13-Abnahme.

Der veröffentlichte DEV-Stand wurde erneut gegen das originale Pages-Artefakt
des [Main-Laufs 42836931680](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42836931680)
verglichen: **alle 77 Dateien identisch**, Commit
`d146b6bdc975420d550376b75297f261b6b66410`, Build
`d146b6bdc975-637233c9-6e7d-4a76-ab63-100e2e760a33`, Modus `supabase-dev`.
Das bestätigt PR #28, nicht die noch separat zu mergende Navigationskorrektur.

#### Migration 040: vollständiger Ist-Abgleich, keine erneute Installation

Ziel ausschließlich `orxinqhhbtjpkzwlfaxq`, kein Demo-/Produktionsprojekt:

| Prüfpunkt | Tatsächlich bestätigter DEV-Zustand |
|---|---|
| Vollständige lokale Datei | `supabase/migrations/20261110004000_calendar_upcoming.sql`; eine Funktion, REVOKE/GRANT und Transaktionsrahmen, keine DML-/Tabellenänderungen |
| Funktionsdefinition | Einzige Überladung; neun typisierte Argumente und alle neun Defaults identisch; `jsonb`, `STABLE`, `SECURITY DEFINER`, leerer `search_path`, `page_size=5` |
| Vollständiger Funktionskörper | Identisch mit Datei; MD5 nach LF-Normalisierung `fd856de22bdf256c6b01c7b54a2e26b3` |
| Gesamtes gespeichertes Migrations-SQL | Identisch mit vollständiger Datei einschließlich Grants, nach LF-Normalisierung und Entfernen äußerer Leerzeichen; MD5 `b57ab527856c0b7d5fcee535955bc938` |
| Öffentliche Ausführung | `authenticated`: erlaubt; `anon` und `PUBLIC`: nicht erlaubt |
| Privilegierte technische Rollen | Eigentümer `postgres` und bestehende `service_role`-Berechtigung bleiben erhalten; kein neuer Client-Zugriff |
| Tatsächliche Historie | Version `20261110170632`, Name `dev081_040_calendar_upcoming`; ein gespeicherter SQL-Block mit dem vollständigen Migrationsinhalt |

`040` ist die fachliche laufende Nummer im Dateinamen, nicht die gespeicherte
Supabase-Version. Das beim separat autorisierten Anwenden benutzte
`apply_migration` hat den Ausführungszeitstempel `20261110170632` vergeben,
nicht den lokalen Dateipräfix `20261110004000`. Eine Suche nur nach `040` oder
diesem lokalen Präfix kann deshalb leer sein. Der tatsächliche Datensatz und
sein vollständiges SQL wurden gelesen, nicht aus der bloßen Existenz der RPC
abgeleitet. Zur gezielten Kontrolle:

```sql
select version, name, cardinality(statements) as sql_blocks
from supabase_migrations.schema_migrations
where name = 'dev081_040_calendar_upcoming'
   or version in ('20261110170632', '20261110004000');
```

Es fehlt keine Änderung aus der Datei. **Keine erneute DDL-Ausführung, kein
zweiter Erfolgseintrag, kein manuelles Umschreiben der Historie und kein
`db push` als Reparatur.** Die dokumentierte Zuordnung gleicht die irreführende
Versionssuche mit dem nachgewiesenen Ist-Zustand ab. Bei einem zukünftigen
Wechsel auf CLI-gesteuertes Deployment muss zunächst die gesamte Historie
abgeglichen werden; nicht nur 040 blind als angewendet markieren.

#### Echter angemeldeter MEMBER-Test gegen gehostetes DEV

Der Verantwortliche hat sich im Browser selbst mit einem autorisierten
normalen Testkonto angemeldet. `ff_my_access` bestätigte ausschließlich
`MEMBER`. Die folgenden **echten** read-only PostgREST-Aufrufe benutzten diese
normale Sitzung, weder einen Service-Key noch einen künstlich erzeugten Login:

| Prüfung | Ergebnis |
|---|---|
| `ff_calendar_upcoming({})` | HTTP 200, genau fünf Einträge |
| `page_size=400` | HTTP 200, 17 erlaubte Einträge; Beginn/ID sortiert, keine Duplikate oder bereits beendeten Einträge |
| Standardseite gegen erweiterte Liste | Genau die ersten fünf derselben Reihenfolge |
| Vollständige Ergebnismenge | Identisch mit separater read-only DB-Gegenprüfung der bestehenden Sichtbarkeitsregeln für diesen Testnutzer |
| Tatsächlich geschützter Termin als manipulierte `retained_ids` | Weder in `events` noch `retained_events` sichtbar |
| Fremde Einheit als Filter einschließlich geschützter ID | HTTP 200, keine Termine und keine retained-Daten |
| `page_size=0`, `page_size=401`, unbekannter Scope | Je HTTP 403 / `42501` |
| Administrative `ff_members_workspace` als MEMBER | HTTP 403 / `42501` |
| Aufruf derselben Lese-RPC ohne Authorization | HTTP 401 / `42501`, kein anonymes Lesen |

Die DB-Gegenprüfung setzte nur transaktionslokal die Testnutzer-ID für die
Auswertung vorhandener Regeln; sie ersetzt nicht die separat ausgeführten
realen Browser-/JWT-Aufrufe. Keine Konto-, Rollen-, Passwort-, Teilnahme-,
Anwesenheits- oder Termindaten wurden geändert. Keine echten Pushs/Testmails.
Keine Passwörter oder Tokens wurden in Dateien, Berichte oder Konsolenausgaben
übernommen. Die zusätzliche temporäre Browserdiagnose wird anschließend entfernt.

Für den Folge-PR sind acht neue Mobil-Navigationsfälle ergänzt:
GLOBAL_ADMIN, UNIT_ADMIN, MEMBER und delegierter Organisator jeweils in
Light/Dark bei 320 Pixeln. Sie prüfen genaue Reihenfolge, alle Ziele,
aktive Markierung, Mehr-Öffnungszustand, Browser-Zurück, Fokus,
rollenabhängige Administration einschließlich direkter unerlaubter Route,
Overflow und Accessibility. Zusammen mit den bisherigen Mobil-/Refinement-Fällen
wurden lokal **45 Fälle erfolgreich** ausgeführt, ebenso TypeScript, Lint,
189 Domain/Auth/Config- und 24 Skripttests sowie der statische DEV-Export.
Lint enthält ausschließlich die bereits bestehende Warnung
`supabase-planning.tsx:65`. Vollständige DEV-/Demo-, SQL/RLS-/Upgrade- und
Export-Ergebnisse sind in den aktuellen Checks des separaten Folge-PR belegt.

### Automatisierte Prüfung und manuelle Abnahme DEV 0.8.1

Die ergänzte Suite prüft 320/375/390/430/768/1440 Pixel in beiden Themes,
Header-Gleichheit auf Start/Modulen, fünf sortierte Vorschauzeilen,
Gelesen-Status, Dialogschließen/Fokus, Theme, Navigation und Kalenderstandard.
Weitere Fälle prüfen echte SDK-Aufrufparameter, Nachladen über Monatsgrenzen,
getrennte Sitzungswahl und explizite Fehler bei fehlender RPC oder gesperrtem
Sitzungsspeicher, Inbox-/Einstellungsanker, gelesene/leere Inbox,
entfallene Ziele, falsche Antwortidentität, Dienstbuch und alte Profilanker.
SQL-Tests prüfen die zusätzliche RPC mit echten serverseitigen Berechtigungen
im wegwerfbaren CI-PostgreSQL. Die übrigen Browserfälle sind abgefangene
Protokollsimulationen, keine echte iPhone- oder Push-Zustellprüfung.
Screenshots `081-*` werden im vorhandenen CI-Artefakt gesammelt.
Der optionale Pixelvergleich erfasst jetzt nur das unveränderte Cockpit;
Header und Navigation sind ausdrücklich Gegenstand der Verfeinerung.

Verifizierter Prüfstand für PR #28:

| Prüfung | Ergebnis |
|---|---|
| Domain/Auth/Config und Skripte | 189 + 24 erfolgreich |
| DEV-Browser, einschließlich 18 neuer Refinement-Fälle | 178 erfolgreich |
| Bestehende Demo-Browserfälle im isolierten CI-Build | 19 erfolgreich; unabhängiges Demo-Repository unverändert |
| PostgreSQL 17 / RLS / Upgrade / geschützte Edge-Funktionen | Erfolgreich, einschließlich Migration 040 |
| TypeScript, Lint, Static Export und DEV-Exportscanner | Erfolgreich; nur die bestehende Lint-Warnung `supabase-planning.tsx:65` |
| Optionaler lokaler Cockpit-Pixelvergleich mit veröffentlichtem DEV 0.8 | Identisch, nach Ausschluss der absichtlich geänderten Header-/Navigationsgeometrie |

Die vollständigen grünen Läufe des Implementierungsstands `e7ba5dd` sind
[UI/Export](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42833692194)
und [DB/Upgrade](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42833692151).
Die aktuellen Checks und acht Light-/Dark-Bildpaare stehen in
[PR #28](https://github.com/n00b31/feuerwehr-odenthal-app/pull/28).
Der lokale Pixelvergleich verwendet das tatsächliche DEV-0.8-Pages-Artefakt
von Commit `3441b31e93efba45257a084b72a33cd041e8056c`; die Cockpit-PNGs
werden beim optionalen Lauf als Vergleichsnachweise gesichert.

Auf echtem iPhone 13 / Safari und installierter PWA nach Review prüfen:

1. Start und Module: gleiche Kopfzeile, Branding, Theme, Safe Areas, keine
   verdeckten Aktionen; Cockpit-Inhalte mit DEV 0.8 vergleichen.
2. Glocke mit leerer, gelesener und ungelesener Inbox: maximal fünf Einträge,
   aktuelle Zahl, keine Navigation beim bloßen Öffnen; alle Schließwege.
3. Dienst-, Anwesenheits-, Fahrzeug- und administrative Direktziele sowie einen
   inzwischen entfallenen Vorgang mit ausdrücklich autorisierten Testdaten.
4. Alle Benachrichtigungen, Einstellungen und unveränderte Push-Geräteverwaltung.
   Echten Push nur bewusst mit eigenem autorisiertem Gerät auslösen.
5. Untere Navigation exakt Start, Termine, Dokumente, Statistik, Mehr.
   Profil und rollenabhängige Administration unter Mehr; aktive Markierung,
   Browser-Zurück und alte Dienstbuch-Bookmarks.
6. Mobile nächste fünf, laufender/weit entfernter Termin, weitere Einträge,
   Filter und Details; Monatswahl nach Navigation erhalten.
7. Tablet/Desktop: Monat als eigener Standard, unabhängige Ansichtswahl,
   Sidebar und bestehende Kalender-/Dienstfunktionen.
8. Dienstbuch-Daten, Teilnahme, Anwesenheitsabschluss und beide Themes prüfen.

**Kurze physische iPhone-13-Freigabe nach Merge des Folge-PR:** Safari und
installierte PWA im Hochformat öffnen, bei angebotener neuer Version bewusst
aktualisieren und den tatsächlich angezeigten Commit notieren. Als MEMBER die
fünf Navigationsziele sowie Profil unter Mehr prüfen; als berechtigter Admin
zusätzlich Administration und aktive Markierungen. Auf Start und Modulseiten
gleichen Header, Glocke mit maximal fünf aktuellen Nachrichten und unverdeckte
Bedienflächen bis zur unteren Safe Area kontrollieren. Kalenderliste: fünf
kommende/laufende Einträge, Reihenfolge, Detailaufruf, Nachladen; Monat/Woche/
Liste wechseln und nach Hin-/Zurücknavigation erhaltene Ansicht prüfen.
Dienstbuch nur unter Statistik, kein Dienstbuch im Profil. Alles in Light und
Dark wiederholen, einschließlich geöffnetem Mehr-Dialog und Glockenvorschau.
Erst nach ausdrücklicher Bestätigung mit Gerät, iOS-Version, geprüftem Commit
und Ergebnis als bestanden dokumentieren. Bis dahin **offen**, kein Release-Tag.

### Historische Dokumentation DEV 0.8

Die folgenden Abschnitte beschreiben den ursprünglichen DEV-0.8-Umfang.
Die oben dokumentierten DEV-0.8.1-Anpassungen ersetzen insbesondere die damalige
Ausnahme für Header/Navigation auf Start und die doppelte Dienstbuchdarstellung.

## Ziel und Grenzen

Die mobile Terminverwaltung wird von einer langen Folge vollständiger Formulare
zu einer kompakten Übersicht mit gezielt geöffneten Details. Zuvor beanspruchten
Header, sechs Navigationsziele, Verwaltungsaktionen, Filter und eine einzige
ausführliche Terminkarte einen großen Teil mehrerer Smartphone-Bildschirme.

Die Startseite ist ausdrücklich ausgenommen: Cockpit, Header, Navigation und
Darstellung bleiben dort erhalten. Die unabhängige Demo wird nicht verändert.
DEV 0.7/0.7.1/0.7.2 sind vom Projektverantwortlichen auf iPhone 13 und einem
nicht verwalteten Windows-11-/Edge-Gerät abgenommen. Der unveränderte,
annotierte Tag `v0.7.2-push-dev` sichert den tatsächlich veröffentlichten Commit
`fa5659603c32b15c6ea7aed1d5653830cbbe11bc`.

Keine Datenbankmigration, Cloud-Konfiguration oder Änderung an Auth,
Berechtigungen, Teilnahme-, Anwesenheits-, Kalender-, Fahrzeug-, Push- oder
Service-Worker-Fachlogik gehört zu DEV 0.8. Insbesondere gibt es keine
automatischen echten Test-Pushs oder Testmails.

## Design und Breakpoints

- Bis einschließlich **767 CSS-Pixel**: kompakter Modul-Header, fünfteilige
  Navigation und mobile Dialoge. `matchMedia` und CSS verwenden dieselbe Grenze.
- Ab **768 CSS-Pixel**: bisherige ausführliche Dienstkarten, unmittelbar
  sichtbare Filter und Verwaltungsaktionen. Die vorhandene Sidebar-Grenze bleibt
  unverändert; kleinere Tablets behalten die vorhandene Bottom-Navigation.
- Gemeinsame Farben, Statussymbole, Brand-Assets, Typografie und
  `--cp-*`-Designvariablen bleiben erhalten. Helle und dunkle Darstellung werden
  gemeinsam geprüft. Status bleibt durch Text und Symbol verständlich.
- Modul-Header: Logo links, Benachrichtigungen und Theme rechts; Abmelden liegt
  mobil im bestehenden Profil und verwendet exakt die bestehende Sitzungs- und
  Push-Abmeldung. Desktop und Startseite behalten ihren bisherigen Abmeldebutton.
- `safe-area-inset-*`, mindestens 44-Pixel-Bedienflächen und der bestehende
  Inhaltsabstand oberhalb der Bottom-Navigation berücksichtigen Geräte mit
  Home-Indikator. Bottom Sheets können unabhängig vom Hintergrund scrollen.

Die Gestaltung gilt nur im aktiven DEV-Modulbereich `.mobile-workspace`, nicht
für die Startseite, Registrierung, Wiederherstellung oder Demo.

## Wiederverwendete und neue UI-Komponenten

`useMobileLayout` verwendet `useSyncExternalStore` mit einem SSR-Snapshot,
überwacht die Media Query und entfernt seinen Listener wieder.
`ResponsiveFilters` zeigt am Desktop die ursprünglichen kontrollierten Felder
und mobil eine Filteraktion mit sichtbarer Zusammenfassung.
`MobileSheet` verwendet den vorhandenen nativen `AppDialog`: Dialogtitel,
Fokusführung, Escape, Schließen und Fokus-Rückgabe bleiben gemeinsam.
Eine gezählte Scroll-Sperre erhält die vorherige Body-Einstellung auch bei
überlappenden Dialogen. Laufende Schreibvorgänge sperren das Schließen ihrer
mobilen Bearbeitungsansicht; die Anwesenheitskomponente meldet dafür lediglich
ihren bestehenden Beschäftigt-Zustand weiter.

Die kompakte Bottom-Navigation enthält Start, Termine, Dokumente, Profil und
Mehr. Statistik und die bisher berechtigungsabhängige Administration stehen
unter Mehr. Keine neue Rolle und kein zusätzliches Recht werden daraus
abgeleitet. Desktop-Sidebar und Navigation der Startseite bleiben unverändert.

## Terminverwaltung

Die mobile Segmentnavigation zeigt Dienste, Kalender und Fahrzeuge; zugängliche
Namen enthalten auch die bisherigen vollständigen Bezeichnungen. Am Desktop
bleiben die vollständigen Beschriftungen sichtbar.

**Termin erstellen** öffnet die bestehenden berechtigten Einzeltermin- und
Serienaktionen. **Verwalten** enthält CSV-Import und CSV-Vorlage. Das
Aktualisieren-Symbol behält einen verständlichen Screenreader-Namen. Alle
Planungsformulare und der bestehende serverseitige Vorschau-/Bestätigungsablauf
werden weiterverwendet.

Der Filterdialog enthält unverändert Ansicht, Monat/Jahr, Status und
Standardansicht. Die Auswahl liegt weiterhin im bisherigen Elternzustand und
bleibt beim Schließen erhalten. Übernehmen schließt lediglich den Dialog:
Filtern und Zurücksetzen verwenden die bestehenden Abfragen, einschließlich
Monatsgrenzen, Pagination und berechtigtem Filter für offene Anwesenheitslisten.

Eine mobile Karte zeigt Datum und Zeitspanne, vollständigen Titel, Einheit/Ort,
eigenen Rückmeldestatus und die bereits berechtigt gelieferten Rückmeldezahlen.
Die Karte ist eine einzige zugängliche Schaltfläche, keine schreibende Aktion.
Lange Titel werden umgebrochen, nicht abgeschnitten.

Der Detaildialog verwendet den vollständigen bisherigen Karteninhalt:
Beschreibung, Dienstart, Serieninformationen, Rückmeldung, aufklappbare
Teilnehmerliste, begründete Korrektur, Anwesenheit, Organisatorzuweisung,
Bearbeitung und bestätigte Absage. Aktionen hängen weiterhin von den
Server-Capabilities ab. Neue Details sind keine zusätzliche Berechtigungsquelle.
Geplante Rückmeldungen bleiben strikt von tatsächlicher Anwesenheit getrennt.

Schließen gibt Fokus und Scrollposition an die vorhandene Übersicht zurück.
Filter und Pagination werden nicht zurückgesetzt. Geöffnete Einträge bleiben
während einer Aktualisierung erhalten; Schließen der mobilen Detailansicht
gibt auch ihre Anwesenheitsansicht frei, damit ein inzwischen abgeschlossener
Eintrag aus dem aktiven Offen-Filter verschwinden kann. Das bloße Öffnen und
Schließen einer normalen Detailansicht benötigt keine zusätzliche Fachabfrage.

## Weitere Module und Desktop

Mobile Formulare werden einspaltig, lange Aktionszeilen umbrechbar, Buttons und
Felder auf ihre verfügbare Breite begrenzt. Kalenderlisten werden einspaltig.
Dokumentenbereiche, Mitgliederverwaltung, Administration, Profil und
Benachrichtigungseinstellungen verwenden dieselben begrenzten Inhaltsflächen.
Berichtstabellen bleiben in ihren horizontal scrollbar begrenzten Containern.

Die zeitliche Wochenansicht und Fahrzeug-Zeitraster behalten ihre fachlich
erforderlichen horizontalen Scrollflächen. Diese sind bewusst **innerhalb**
des Kalenders begrenzt; die gesamte Seite soll nicht horizontal scrollen.
Eine neue Kalender- oder Tabellenarchitektur wäre eine funktionale Erweiterung
und ist nicht Bestandteil dieses UI-Updates.

Am Desktop bleiben Dienstinhalt, Aktionen, Filter, Berechtigungsauswertung,
Formulare und Geschäftsabläufe erhalten. Responsive Tests prüfen zusätzlich
768 und 1440 Pixel. Bestehende funktionale Tests werden um die expliziten
mobilen Menüschritte ergänzt, nicht durch vereinfachte Bestätigungen ersetzt.

## Automatisierte und visuelle Prüfung

Die ergänzte responsive Suite verwendet ausschließlich isolierte
Protokoll-Fixtures. Sie prüft 320, 375, 390 und 430 Pixel sowie Tablet/Desktop,
beide Themes, lange Titel, vier Rückmeldestatus, Bedienflächen,
Seiten-/Dialog-Überläufe und Axe-Barrierefreiheit.

Weitere Fälle prüfen globale und einheitsbezogene Administration, Mitglieder
und delegierte Organisatoren; Erstellen/Verwalten/Filter/Zurücksetzen,
Rückmeldespeicherung, Anwesenheitsabschluss, Entfernen aus dem Offen-Filter,
sekundäre Navigation, Kalender, Profil und vorhandene Abmeldung.
Öffnen/Schließen wird auf unveränderte Daten, fehlende zusätzliche
Terminabfragen sowie Fokus- und Scroll-Rückgabe geprüft.
Scroll-Anker berücksichtigen den kompakten Header und den oberen Safe-Area-Abstand,
damit das Datum der angesprungenen Terminkarte nicht verdeckt wird.

Die bestehenden Auth-, Freigabe-, Rollen-, Dienst-, Berichts-, Kalender-,
Fahrzeug-, Serien-, Cockpit- und Push-/Gerätelebenszyklus-Tests bleiben
Regressionsschutz. Diese Browserfälle sind **Simulationen**, keine echte
Push-Zustellung und keine physische iPhone-Abnahme.

Für den zusätzlichen Startseiten-Pixelvergleich wird das tatsächliche
abgenommene DEV-Export-Artefakt aus Run `42801505605` getrennt lokal bereitgestellt.
Beide Ansichten erhalten dieselben abgefangenen Testdaten. Nur der dynamische
Versionsnachweis wird vor dem Vergleich auf denselben Text normalisiert.
Der Vergleich nutzt keine Live-Benutzer und schreibt nicht nach Supabase.

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run typecheck
# Synthetischer Export: Konfiguration wie im Auth-CI-Job von pages.yml
npm.cmd run build:pages
npx.cmd playwright test --config playwright.auth.config.ts
```

`MOBILE_SCREENSHOT_DIR` speichert die tatsächlichen 390-Pixel-Aufnahmen von
Übersicht, Detail, Filter und Verwaltungsaktionen. Für den optionalen
Pixelvergleich zeigt `MOBILE_BASELINE_URL` auf den zweiten lokalen Preview.
Ohne diese Variable bleibt die normale Startseiten-Ausnahmeprüfung in CI aktiv.

Lokaler Prüfnachweis: 188 Fach-/Auth-/Konfigurationstests und 24 Skripttests
erfolgreich; Typecheck und statischer DEV-Export erfolgreich. Der erste
vollständige DEV-Browserlauf ergab 156 erfolgreiche Fälle und vier notwendige
Anpassungen an mobile Bedienwege beziehungsweise die Überschriftenhierarchie;
alle vier wurden anschließend erfolgreich erneut geprüft. Die ergänzte
responsive Suite besteht vollständig mit 19 Fällen, einschließlich des
Pixelvergleichs zur abgenommenen Startseite und des unmittelbaren Entfernens
abgeschlossener Listen beim Verlassen der mobilen Detailansicht.
Der vollständige PR-CI-Lauf für `09d1eaa` war erfolgreich:
160 DEV-Browserfälle, 19 Demo-Browserfälle, Datenbank/RLS, Upgrade-Prüfung
und Veröffentlichungsschutz ([UI/Export](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42810431919),
[Datenbank](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42810431780)).
Die zusätzliche Scroll-Anker-Korrektur ist erneut mit allen 19 responsiven Fällen
einschließlich Startseiten-Pixelvergleich geprüft. Maßgeblich für den jeweils
neuesten Commit bleiben die Prüfungen im Pull Request.

## Manuelle Abnahme nach Review und Merge

Die DEV-0.8-Abnahme durch den Projektverantwortlichen steht noch aus.
Auf dem echten iPhone 13, möglichst Safari und installierte PWA, prüfen:

1. Startseite mit DEV 0.7.2 vergleichen: Cockpit und seine Navigation unverändert.
2. Header beim Scrollen, Branding, Glocke, Theme und Profil-Abmeldung prüfen.
3. Alle fünf Navigationsaktionen und Mehr verwenden; Administration nur mit
   bestehender Berechtigung. Home-Indikator darf keine Aktion verdecken.
4. Dienste/Kalender/Fahrzeuge wechseln; Kalender-Scrollflächen gezielt bedienen.
5. Einzeltermin, Serie, CSV-Import und Vorlage über die mobilen Menüs öffnen.
   Änderungen nur mit ausdrücklich autorisierten Testdaten speichern.
6. Monats-, Status- und Offen-Filter öffnen, schließen und zurücksetzen.
7. Lange Terminkarte öffnen: Inhalte vollständig, Teilnehmer zunächst
   eingeklappt, keine automatische Rückmeldung. Zurück erhält die Listenposition.
8. Vor Dienstbeginn eine Rückmeldung ändern; nach Beginn muss die vorhandene
   Sperre greifen. Geplante und tatsächliche Teilnahme nicht verwechseln.
9. Berechtigte Anwesenheit erfassen, Abschluss bestätigen und Offen-Filter sowie
   Cockpit-Zähler ohne vollständigen Reload prüfen.
10. Profil, Dokumente, Berichte, Mitglieder und Benachrichtigungen mit längeren
    Inhalten in beiden Themes und mit geöffneter Bildschirmtastatur bedienen.
11. Den abgenommenen Push-Geräte-Lebenszyklus mit eigenen autorisierten Geräten
    erneut prüfen; keine fremden Bestandsgeräte verändern.
12. Dieselben Fachabläufe auf Tablet und Desktop stichprobenartig prüfen.

Browseremulation kann echte iOS-Tastatur, Safari-Safe-Area, Installation und
Push-Transport nicht abschließend bestätigen. Der bestehende Einschränkungsfall
eines verwalteten Windows-/WNS-Geräts bleibt ein separater IT-Prüfpunkt.
Kein automatischer Merge oder vorzeitiges Deployment.
