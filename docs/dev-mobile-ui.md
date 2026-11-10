# DEV 0.8 – Mobile UI & UX Redesign

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
Der PR führt zusätzlich den vollständigen CI-Lauf einschließlich Datenbank/RLS,
Demo-Regression, DEV-Browsern und Veröffentlichungsschutz aus.

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
