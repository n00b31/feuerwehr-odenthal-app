# Feuerwehr Odenthal · lokale Demo

Mobile-first Mitgliederportal mit **Next.js App Router, React, TypeScript und Tailwind CSS**. Inoffizieller Prototyp mit fiktiven Daten, keine offizielle oder produktive Anwendung der Feuerwehr. Keine produktiven Cloud-Dienste, keine externen Zugangsdaten, keine produktive Authentifizierung. Der ausdrücklich ungeschützte Profilwechsel dient ausschließlich der Demonstration von Berechtigungen. Keine echten personenbezogenen oder einsatzbezogenen Daten eingeben.

## Öffentliche Demo auf GitHub Pages

**Demo:** https://n00b31.github.io/feuerwehr-odenthal-app/

**Quellcode:** https://github.com/n00b31/feuerwehr-odenthal-app

GitHub Pages stellt ausschließlich den statischen Next.js-Export bereit. Es gibt keinen Datenbankserver, keine gemeinsam gespeicherten Zusagen und keine Anmeldung. Jede Besucherin und jeder Besucher bekommt eigene fiktive Daten und kann alle Demo-Rollen ausprobieren. Änderungen liegen nur im jeweiligen Browser. Die Demo ist per HTTPS öffentlich erreichbar und benötigt keine Zugangsdaten.

Nach jedem Push auf `main` und für Pull Requests nach `main` prüft `.github\workflows\pages.yml` die Fachregeln, TypeScript, ESLint, die Icon-Erzeugung, den statischen Build und die Browser-Szenarien unter dem Repository-Unterpfad. **Nur ein erfolgreicher Lauf auf `main` veröffentlicht nach Pages.** Pull Requests und manuelle Läufe auf Feature-Branches prüfen ausschließlich und verändern die öffentliche Demo nicht. Ein manueller Lauf ist über „Actions → Publish demo to GitHub Pages → Run workflow“ möglich. Verwendet werden nur die eingebauten, auf Build/Deployment begrenzten GitHub-Actions-Berechtigungen; keine gespeicherten persönlichen Tokens oder Cloud-Secrets.

Der Workflow speichert den statischen Export und Browser-Screenshots/-Fehlertraces sieben Tage im Artefakt **`ui-review`**. Damit ist eine Prüfung ohne npm-Installation auf dem lokalen Rechner möglich. Unternehmensrichtlinien nicht umgehen; Installationen und Builds können vollständig auf GitHub Actions laufen.

### Redesign vor einem Merge ausprobieren

Im Pull Request den erfolgreichen Lauf **Publish demo to GitHub Pages** öffnen, `ui-review` herunterladen und entpacken. Der enthaltene Ordner `out` ist die vollständige statische Vorschau. Die Bilder unter `test-results` zeigen Hell/Dunkel sowie mobile und Desktop-Ansichten.

Mit vorhandenem Node.js lässt sich das heruntergeladene `out` im Repository-Hauptverzeichnis über `node scripts\preview-pages.mjs` bereitstellen. Aufruf: `http://localhost:3100/feuerwehr-odenthal-app/`. Dafür sind weder npm-Installation noch lokaler Build nötig. Ein eventuell vorhandener `out`-Ordner darf nur nach bewusster Sicherung ersetzt werden. Die Vorschau bindet ausschließlich an Loopback; auf dem Smartphone ist dessen `localhost` nicht der Entwicklungsrechner. Ohne Node.js stehen die CI-Screenshots zur Ansicht bereit.

Der Build setzt `NEXT_PUBLIC_BASE_PATH=/feuerwehr-odenthal-app` und `STATIC_EXPORT=true`. Next.js-Verweise, Icons, Manifest, Service-Worker-Scope und Offline-Seite berücksichtigen diesen Unterpfad. Der Browser-Speicherschlüssel ist zusätzlich nach dem Unterpfad getrennt. Das Manifest enthält ein passendes `start_url`/`scope`. Keine clientseitigen Root-Weiterleitungen als Ersatz für echte statische Seiten.

Statischen Pages-Build lokal prüfen:

```powershell
npm.cmd run build:pages
npm.cmd run preview:pages
# Im Browser: http://localhost:3100/feuerwehr-odenthal-app/
```

In einem zweiten Terminal:

```powershell
$env:NEXT_PUBLIC_BASE_PATH='/feuerwehr-odenthal-app'
$env:PLAYWRIGHT_BASE_URL='http://localhost:3100'
npm.cmd run test:e2e
```

Bei anderem Repository-Namen muss `NEXT_PUBLIC_BASE_PATH` beim Bauen und beim Testen entsprechend gesetzt werden. Der Workflow übernimmt den tatsächlichen Repository-Namen automatisch. Für eine Veröffentlichung direkt unter einer eigenen Domain wäre ein erneuter Build mit leerem Base Path erforderlich.

GitHub Pages kann die in `next.config.ts` konfigurierten individuellen HTTP-Header nicht übernehmen; diese gelten nur beim Next.js-Serverbetrieb. Pages verwendet die Header der Hostingplattform. Es gibt bewusst keine Behauptung einer serverseitigen Zugriffssicherung. Für späteren echten Mehrbenutzerbetrieb ist GitHub Pages allein ungeeignet.

## Lokal starten

Voraussetzung: Node.js 20.9 oder neuer und npm (entwickelt mit Node 24).

```powershell
Set-Location C:\Projekte\feuerwehr-odenthal-app
npm.cmd ci
npm.cmd run build
npm.cmd run start -- --hostname 127.0.0.1 --port 3000
```

Aufrufen: **http://localhost:3000**. Entwicklung: `npm.cmd run dev -- --hostname 127.0.0.1 --port 3000`.

Die `.cmd`-Aufrufe verwenden die Windows-Befehlsshims und ändern keine Execution Policy. Nur verwenden, soweit die Unternehmensrichtlinien dies erlauben. Bei gesperrten Installationen ausschließlich den GitHub-Actions-Build nutzen; keine Sicherheitsrichtlinien umgehen. Eine erlaubte Installation benötigt einmalig Internet für Pakete; laufende Demo und Build benötigen weder Cloud noch Online-Schriften.

Der Server ist bewusst an Loopback gebunden. Auf einem Smartphone ist dessen `localhost` nicht der Entwicklungsrechner. Für einen echten Gerätetest muss ausdrücklich ein vertrauenswürdiger Netzwerkzugang mit HTTPS eingerichtet werden; nicht einfach als öffentliches Mitgliederportal veröffentlichen.

## Enthaltene Funktionen

| Bereich | Umsetzung |
|---|---|
| Start | Persönliche Begrüßung und Einheit, nächster Übungsdienst (sonst nächster Termin), direkte Zusage/Absage/Vielleicht ohne Dialog, nach Frist priorisierte offene Rückmeldungen, kompaktes Ist-Dienstbuch, aus vorhandenen Daten abgeleitete Hinweise und Dokument-Schnellzugriff |
| Termine | Alle sechs Dienstarten, Suche, Bereichs-/Typfilter, Zukunft/Historie/offene Rückmeldungen, Beschreibungen, Ort, Organisator, Status und optionaler Anmeldeschluss |
| Rückmeldung | Zusage, Absage, vielleicht; änderbar bis zum früheren Zeitpunkt aus Dienstbeginn und Anmeldeschluss; Sperre in UI und Fachschicht |
| Anwesenheit | Separat von Rückmeldung: anwesend, abwesend, nicht festgestellt. Nur zuständige Administration und erst ab Dienstbeginn. Listenabschluss und spätere Korrektur mit Pflichtbegründung |
| Serien | Wöchentlich, zweiwöchentlich, monatlich; 1–52 Instanzen, gespeicherte Regel/Instanznummer, unabhängige Listen; einzelne zukünftige Instanzen bearbeiten oder einzeln absagen |
| Statistik | Jahresübungen, tatsächliche Teilnahmen, Übungsquote, volle Ausbildungsstunden, besuchte Dienste und historische Einheit. Administration zusätzlich Bereich, Dienst, Dienstart, Personenübersicht |
| Exportvorbereitung | UTF-8-CSV für Excel mit Formel-Injection-Schutz und druckbare Browseransicht / „Als PDF speichern“. Kein natives XLSX, keine serverseitige PDF-Engine |
| Dokumente | Name, Beschreibung, SharePoint-Freigabelink, Einheit/Funktion/Organisation und Mitglieder-/Adminsichtbarkeit; berechtigte Administration legt Bereiche an |
| Administration | Scoped Termin-/Anwesenheitsverwaltung, Mitgliederzuordnung, Mehrfachfunktionen, Rollenvergabe durch globale Administration, konfigurierbare Einheiten und frei definierbare Funktionen, Änderungsprotokoll |
| Profil | Demo-Person wählen, Zuordnungen/Rollen/Einheitshistorie ansehen, Hell/Dunkel/System dauerhaft auswählen, lokaler Reset mit Bestätigung |
| PWA-Grundlagen | Manifest, aus dem Original-Flammensymbol erzeugte 192/512-Pixel-Icons, maskierbares Icon, Apple-Touch-Icon, PNG-Favicon, Standalone-Darstellung, Service Worker mit Offline-Hinweisseite |
| Bedienung | Responsive Seitenleiste / mobile Bottom-Navigation, Hell/Dunkel, native Modal-Fokusführung und Escape, beschriftete Eingaben, Skip-Link, Reduced Motion, große Haupt-Touch-Ziele |

### Demodaten

Beim ersten Besuch werden **250 fiktive Personen in fünf Einheiten mit je 50 Personen** erzeugt. Startprofil und Starteinheit: **Anna Berg, Scheuren**. Einheitsnamen sind ausschließlich Konfiguration und Seed-Daten, niemals Bedingungen in der Fachlogik.

Unter **Profil** stehen vier schnelle Perspektiven bereit:

| Demo-Person | Rolle |
|---|---|
| Anna Berg | MEMBER · Scheuren; Gerätewarte und Atemschutz |
| Lukas Weber | UNIT_ADMIN · Scheuren |
| Miriam Keller | FUNCTION_ADMIN · Atemschutz |
| Thomas Hoffmann | GLOBAL_ADMIN · ganze Organisation |

Weitere Personen sind über die Profilauswahl erreichbar. Alle Namen, E-Mail-Adressen, Zusagen und historischen Anwesenheiten sind synthetisch. Auch rückwirkend abgeschlossene Listen sind keine realen Nachweise. Die Daten entstehen bezogen auf den ersten Aufruf; laufender Dienst: 30 Minuten vor Initialisierung, nächste Termine relativ dazu. Über den Reset entsteht eine neue zeitlich aktuelle Datenbasis.

### Zentrale Regeln

- **Eine Zusage wird niemals zur Anwesenheit umgedeutet.** Nicht festgestellte Anwesenheit zählt nicht als Teilnahme.
- Rückmeldungen sind ab `now >= startsAt` gesperrt, auch wenn eine bereits geöffnete Seite weiterläuft. Der UI-Takt beträgt eine Sekunde; jeder Fachbefehl prüft die tatsächliche Uhrzeit erneut. In der Demo gilt die Gerätezeit, später zwingend die Serverzeit.
- Anmeldeschluss ist zusätzlich bindend, ebenfalls einschließlich des exakten Grenzzeitpunkts.
- Tatsächliche Anwesenheit darf nur die Administration des Terminbereichs erfassen. Bei Abschluss bleiben ungeklärte Personen ungeklärt, nicht automatisch abwesend.
- Nach Abschluss ist ein mindestens fünf Zeichen langer Korrekturgrund erforderlich. Protokoll erfasst Person, Zeitpunkt, Aktion sowie alten/neuen Anwesenheitswert. Terminbearbeitungen und Rollenänderungen protokollieren vorher/nachher.
- Begonnene Termine sind nicht mehr verschiebbar. Termine mit erfassten Ist-Werten oder Listenabschluss sind nicht absagbar; Korrekturen erfolgen über die Anwesenheit.
- Jede Instanz besitzt eine **Teilnehmerliste mit damaliger Einheits-ID**. Ein Wechsel überschreibt keine vergangenen Anwesenheiten, Quoten oder Historien. Bereits angelegte zukünftige Teilnehmerlisten bleiben ebenfalls unverändert; neue Zuordnungen wirken auf anschließend neu angelegte Termine. Es gibt keinen nachträglichen automatischen Roster-Abgleich.
- Für Einheitswechsel benötigt die handelnde Person Rechte in beiden Einheiten. Eine reine Einheitsadministration kann keine fremde Einheit verwalten. Funktionsadministrationen können Personen ihrer eigenen Funktion zuordnen oder entfernen, nicht fremde Funktionen oder Rollen vergeben.
- Rollen sind Mehrfachzuweisungen mit unabhängigem Scope. Globale Rollenvergabe ist GLOBAL_ADMIN vorbehalten; die eigene globale Rolle kann in der Demo nicht entfernt werden.
- Serien halten die **Berliner lokale Uhrzeit** über Sommer-/Winterzeit hinweg. Monatliche Serien begrenzen nicht vorhandene Monatstage auf den letzten Tag des Zielmonats. Nicht existierende Uhrzeiten während der Frühlingsumstellung werden ausdrücklich abgelehnt; mehrdeutige Herbstzeiten verwenden das frühere Vorkommen. Keine stillen Datumsverschiebungen.

### Statistikdefinition

Ein Jahr wird nach **Europe/Berlin** bestimmt, nicht UTC oder Browser-Zeitzone. Berücksichtigt werden bereits begonnene, nicht abgesagte Termine. „Übungsdienst“ umfasst reguläre Übungsdienste und Sonderübungen. Die persönliche Quote ist die Anzahl tatsächlicher besuchter Übungen geteilt durch bisherige Übungen, zu denen die Person im gespeicherten Teilnehmerkreis gehört. Eine leere Basis wird als 0 % angezeigt.

Teilnahmen zählen für alle Dienstarten ausschließlich bei Ist-Wert `present`. Erfasste, aber noch nicht abgeschlossene Listen sind **vorläufig** und zählen bereits; dies ist in der Oberfläche benannt. Ausbildungsstunden sind die volle Dauer besuchter Dienste, keine individuelle Ankunfts-/Abgangszeit. Bereichsstatistik umfasst Termine, die diesem administrierten Bereich zugeordnet sind; „Alle Einheiten“ umfasst für globale Administration sämtliche Bereiche. Die Mitgliederübersicht folgt den historischen Teilnehmerkreisen, nicht nur aktuellen Zuordnungen.

## Architektur

```text
src\app\                  Next.js App Router, Routen, Metadaten, Manifest, globales Theme
src\components\           UI und interaktive Fachansichten
src\components\demo-provider.tsx
                          React-Kontext: Profil, Fachbefehle, Takt, sichtbare Fehler
src\components\theme-provider.tsx
                          Hell/Dunkel/System, Browser-Persistenz, Tab-/System-Synchronisation
src\components\response-picker.tsx
                          Gemeinsame Rückmeldung für Startseite und Termindialog
src\components\event-parts.tsx
                          Wiederverwendbare Datums-, Dienstart- und Statusdarstellung
src\domain\model.ts        Zod-Schemata und TypeScript-Domänenmodell
src\domain\permissions.ts  Zentraler Rollen-/Scope- und Sichtbarkeitsdienst
src\domain\service.ts      Reine, immutable Geschäftsoperationen und Änderungsprotokoll
src\domain\statistics.ts   Getrennte Ist-Statistik
src\domain\time.ts         Europe/Berlin, Grenzzeitpunkte, Serien und DST
src\domain\export.ts       CSV-Exportaufbereitung
src\data\repository.ts     Browser-Repository, Schemavalidierung, React External Store
src\data\seed.ts           Realistische, ausdrücklich fiktive lokale Ausgangsdaten
src\config\app.ts          App-Konfiguration, Beschriftungen, Konstanten
src\config\theme.ts        Theme-Präferenz und Initialisierung vor dem ersten Paint
public\branding\           Unveränderte, vom Auftraggeber bereitgestellte Original-PNGs
public\                   Abgeleitete Icons, Service Worker, Offline-Hinweisseite
scripts\generate-icons.mjs Proportionale Icon-Erzeugung aus dem Original-Flammensymbol
tests\                    Echte Playwright-Browserabläufe und Accessibility-Prüfung
```

Die UI ruft Befehle auf; diese prüfen Rollen, Scopes und zeitliche Regeln und liefern einen neuen Zustand. Erst nach erfolgreichem lokalem Schreiben wird die UI aktualisiert. Fehler werden sichtbar, nicht als Erfolg kaschiert. Die Postgres-/Entra-Anbindung kann das Datenzugriffs- und Identitätsmodul ersetzen; das Domänenmodell ist nicht auf fünf Einheiten oder 250 Benutzer begrenzt. Browser-JSON ist jedoch ausdrücklich keine geeignete Produktionsdatenbank.

### Lokale Persistenz und Grenzen

Versionierter Speicher: `localStorage`, lokal Schlüssel `ff-odenthal-demo-v1`, bei Unterpfad zusätzlich dessen Suffix (z. B. `ff-odenthal-demo-v1:/feuerwehr-odenthal-app`); aktives Profil im zugehörigen `-profile`-Schlüssel. Browser und Ursprünge sind getrennt: `localhost`, `127.0.0.1` und die öffentliche Pages-Demo besitzen unterschiedliche Daten. Es werden keine Kennwörter, Tokens, Cookies zur Anmeldung oder Cloud-Zugangsdaten angelegt.

Änderungen bleiben nach Neuladen und Serverneustart erhalten. Speicherereignisse aktualisieren weitere geöffnete Tabs; vor einem Befehl wird der gespeicherte Zustand erneut gelesen. **Keine Transaktions-/Konfliktgarantie für gleichzeitig schreibende Tabs**, keine Mehrgerätesynchronisation, keine Backups. Für zuverlässige Demonstrationen nur einen schreibenden Tab verwenden.

Beschädigte/inkompatible Daten werden nicht still überschrieben: Es erscheint eine Fehler-/Resetansicht. Auch voller oder gesperrter Browser-Speicher wird sichtbar gemeldet. Reset entfernt sämtliche lokalen Fachänderungen und erzeugt neue Demodaten. Keine Upgrade-Migration alter Schemaversionen und keine echten Daten eingeben.

Der Profilwechsel ist **vollständig ungeschützt**. Sämtliche Demodaten liegen im Client und sind über Entwicklerwerkzeuge manipulierbar. Berechtigungen zeigen die beabsichtigte Fachlogik, bilden aber **keine Sicherheitsgrenze**. Das lokale Audit ist weder manipulationssicher noch revisionssicher.

### Theme und PWA

Das Designsystem liegt zentral in `src\app\globals.css`: gemeinsame `--cp-*`-Tokens für Farben, Schriftgrößen, 4-Pixel-Abstände, Radien, Bewegung und Zustände. Auf den gemeinsamen Basistokens liegt die ausdrücklich angeforderte Odenthal-Palette: Hell `#F7F8FA` / `#FFFFFF` / `#17212B`, Dunkel `#111418` / `#1C2127` / `#F3F5F7`, Akzent `#C62828` beziehungsweise `#EF5350`. Neutrale Oberflächen, wenig Rot, listenbasierte Termine, gemeinsame Status- und Rückmeldekomponenten. Keine externen Fonts, Bilder oder CDNs.

Die Systemdarstellung wird automatisch erkannt. Unter **Profil → Darstellung** lassen sich System/Hell/Dunkel auswählen; am Desktop zusätzlich über den Kopfzeilen-Schalter. Die Auswahl liegt im zum Demo-Ursprung/-Unterpfad gehörenden `-theme`-Schlüssel, unabhängig vom Fachdatenschema und Demo-Profil. Der Initialisierungscode berücksichtigt sie vor dem ersten Paint; System- und Speicherereignisse aktualisieren offene Tabs. Speicherfehler erscheinen sichtbar. `?scoutTheme=light` beziehungsweise `dark` ermöglicht eine temporär vorgegebene Darstellungsprüfung.

### Original-Branding

- `public\branding\feuerwehr-odenthal-logo.png`: unveränderte Originaldatei, **300 × 100 Pixel**, in Kopfzeile und Ladeansicht. Keine Anmeldeseite ergänzt; die Demo besitzt weiterhin keine Authentifizierung.
- `public\branding\feuerwehr-odenthal-flamme.png`: unveränderte Originaldatei, **48 × 48 Pixel**, für kleine Markierungen und als Quelle aller App-Icons.
- `npm.cmd run icons` erzeugt 192/512-Pixel-PNGs, ein maskierbares 512-Pixel-Icon, Apple-Touch-Icon (180 Pixel) und Favicon (32 Pixel). Proportionen und Originalfarben bleiben erhalten; 14 % Rand pro Seite und eine aus der Vorlage abgetastete Hintergrundfarbe schützen das Motiv bei Maskierung.

Die bereitgestellten Grafiken sind laut Auftrag Originalgrafiken der Feuerwehr Odenthal; ihre Verwendung macht den Prototyp nicht zu einer offiziellen App. Keine zusätzliche Lizenz oder allgemeine Weiterverwendungserlaubnis wird hiermit behauptet. **Grenze:** Die Flammenvorlage hat nur 48 Pixel; Hochskalierung erzeugt keine neuen Details. Für ein schärferes großes Installationssymbol wäre eine höher aufgelöste Originalvorlage nötig. Keine nachgezeichneten oder KI-erzeugten Ersatzlogos.

Installationsangebot ist browser-/plattformabhängig; Manifest und Service Worker benötigen einen sicheren Kontext (localhost oder HTTPS). Auf iOS: Safari → Teilen → Zum Home-Bildschirm. Auf Android: Browser-Menü → App installieren, sofern angeboten.

**Keine vollständige Offline-App:** Der Service Worker cached ausschließlich die Offline-Hinweisseite und Basissymbole, keine personenbezogenen Daten, Next.js-Routen oder React-Flight-Antworten. Bereits geladene Ansichten können bei Serverausfall teilweise weiterarbeiten; neue Navigationen sind nicht garantiert. Bei nicht erreichbarem Server und echtem Seitenaufruf erscheint die Offline-Seite. Installation auf echten iPhone-/Android-Geräten wurde nicht hardwareseitig zertifiziert.

## Prüfungen

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npx.cmd playwright install chromium
# In einem separaten Terminal zuvor den Produktionsserver auf localhost:3000 starten:
npm.cmd run test:e2e
```

Fachtests prüfen unter anderem exakte Beginn-/Anmeldeschlussgrenzen, scoped Rollen, Ist-Statistik ohne Zusagen, Abschluss/Korrekturen, Historie nach Einheitswechsel, unabhängige Serieninstanzen, UTC-/Berliner Jahresgrenzen, Sommer-/Winterzeit und CSV-Zellen. Playwright prüft echte Benutzerabläufe, Persistenz, Rollenansichten, Mitglieds-/Dokumentverwaltung, mobile Viewports, Service Worker und Offline-Fallback. Axe ergänzt automatisierte WCAG-Prüfungen; ersetzt keinen manuellen Screenreader-/Gerätetest.

Der Workflow führt **22 Fachtests und 14 Playwright-Szenarien** aus. Die acht ursprünglichen Funktionsabläufe bleiben erhalten; sechs Redesign-Szenarien ergänzen Ein-Tipp-Rückmeldung ohne Ist-Änderung, Anmeldeschlusssperre, persistentes Theme/Systemwechsel/Tab-Abgleich, sichtbare Theme-Speicherfehler, Original-Branding und Icon-Größen sowie Navigation/Dialogfokus und responsive Layouts bei 320/390/412 Pixeln. Axe prüft die Haupt- und Verwaltungsansichten in Hell/Dunkel. iPhone-13- und Pixel-7-Profile prüfen Touch-Eingaben in **Chromium-Emulation**, nicht auf echter Hardware oder Safari. Screenshots sind im CI-Artefakt verfügbar. Die tatsächlichen Ergebnisse sind im jeweiligen Actions-Lauf bzw. Pull Request ersichtlich.

Fachmodell, Berechtigungsregeln, Statistikdefinitionen und vorhandene Daten bleiben durch das UI-Redesign unverändert. Eine zukünftige fachliche Wehrleiter-Rolle (`FIRE_CHIEF`) ist **nicht implementiert**; insbesondere werden keine zusätzlichen technischen Adminrechte vergeben. Ein separates Mitteilungsmodul ist ebenfalls nicht vorhanden; die Startseite kennzeichnet Hinweise aus bestehenden Termin-/Dokumentdaten ausdrücklich.

`npm.cmd run icons` erzeugt die PNG-Symbole erneut. Testartefakte liegen in `test-results` und sind in `.gitignore` ausgeschlossen. Playwright-Kontexte sind pro Test isoliert und verändern nicht die Daten des normalen Browserprofils.

**Dependency-Audit-Hinweis:** Die initiale npm-Installation meldete 16 moderate Advisories. Die anschließend versuchte gezielte Prüfung mit `npm.cmd audit --omit=dev --json` wurde vom konfigurierten Paket-Registry-Proxy mit HTTP 429 begrenzt, auch beim erneuten Versuch. Eine belastbare aktuelle Zuordnung zu Laufzeit- oder Entwicklungsabhängigkeiten ist deshalb nicht bestätigt. Dies ist kein als sauber deklarierter Security-Audit; vor Produktivbetrieb vollständig prüfen und betroffene Abhängigkeiten aktualisieren.

## Produktionsausbau – bewusst nicht implementiert

1. **PostgreSQL und Server-API:** normalisierte Personen-, Einheiten-, Funktionen-, historisierte Mitgliedschafts-, Rollen-, Serien-/Termininstanz-, Rückmeldungs-, Ist-Anwesenheits-, Dokument- und Audit-Tabellen. Transaktionen, Fremdschlüssel, eindeutige Rückmeldung je Person/Instanz, optimistische Konkurrenzkontrolle, Indizes nach Scope/Zeit/Person, paginierte Abfragen; Lasttests mit mindestens 250 Benutzern.
2. **Echte Identität mit Entra External ID:** geeignetes Tenant-/Produktmodell festlegen, OIDC Authorization Code + PKCE, serverseitig geschützte Session mit Secure/HttpOnly/SameSite-Cookies. Tokens vollständig gegen Aussteller, Zielgruppe, Signatur und Ablauf prüfen; niemals Client-Profil-IDs als authentifizierte Identität akzeptieren.
3. **Registrierung:** E-Mail-Eigentum verifizieren, normalisierte verifizierte Domain exakt `feuerwehr-odenthal.de`, danach Status „wartet auf manuelle Freigabe“. Administration genehmigt und ordnet Einheit zu; vorher keine Fachzugriffe. Domain-Suffix allein beweist weder E-Mail-Eigentum noch Mitgliedschaft. Rollen ausschließlich serverseitig aus freigegebener Datenbankzuordnung ableiten; kein implizites Administrationsrecht durch E-Mail-Domain.
4. **Jede Operation serverseitig autorisieren:** sowohl Lesezugriffe/Statistik als auch Änderungen anhand Person, Rolle, Scope und serverseitiger Zeit prüfen. Die heutige zentrale Domänenlogik hinter dieser Grenze ausführen; atomare Beginngrenze und Transaktionen verhindern verspätete Rückmeldungen.
5. **Revisionsgerechtes Audit und Datenschutz:** unveränderbare serverseitige Audit-Historie mit Alt-/Neuwert, Akteur, Begründung und vertrauenswürdiger Zeit; Aufbewahrungs-/Löschkonzept, berechtigte Exporte, Verschlüsselung, Backups, Restoretests, Protokollierung und Monitoring. Zuständigkeiten und zulässige Datenverarbeitung vor Echtdatenbetrieb klären.
6. **SharePoint gesondert klären:** App-Anmeldung über External ID erteilt keine SharePoint-Berechtigung. Verbindliche Tenant-Richtlinien für Gäste/B2B/External Sharing, Freigabelinks, MFA/Conditional Access und Dokumentklassifikation prüfen. Personen haben keine M365-Lizenzen; ob und wie konkrete Gastzugriffe zulässig sind, hängt von Microsoft-Produktbedingungen, Tenant und Nutzung ab. Nicht pauschal lizenzfrei versprechen. External-ID-App-Identitäten sind nicht automatisch SharePoint-Gastidentitäten. Keine anonymen „Jeder“-Links für sensible Feuerwehrunterlagen empfehlen.
7. **Betrieb und PWA:** HTTPS, Secret-Verwaltung, Security-Header/CSP, CSRF-/Rate-Limit-/Missbrauchsschutz, Dependency-Advisory-Prüfung, Barrierefreiheits-/Screenreaderprüfung, echte iPhone-/Android-Installation und Geräte-Zeitzonen testen. Vollständige Offline-Synchronisation nur mit Konflikt-/Berechtigungs-/Datenschutzkonzept ergänzen.

Kein produktiver Cloud-Dienst und keine produktive Authentifizierung sind Teil dieser Demo. Für den beschriebenen Betrieb existiert keine Authentifizierungsattrappe, die als sicher ausgegeben wird.
