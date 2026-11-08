# Feuerwehr Odenthal · Supabase DEV und lokale Regression

**DEV 0.5.1:** [Gemeinsamer Kalender, Gerätehaus-Stammdaten und berechtigte Belegung](docs/dev-calendar.md).
Die manuell abgenommene [DEV 0.4.1](docs/dev-history-seed.md) bleibt mit `v0.4.1-seed-dev` gesichert.
Die zusätzliche gehostete Profilmigration war zunächst durch eine automatisch
abgebrochene Client-Bestätigung blockiert. Nach direkter
Nutzeranmeldung wurden die getesteten Migrationen regulär im sichtbaren
Supabase-SQL-Editor bestätigt. 50 nicht anmeldbare Mitglieder und 262 historische
Termine sind jetzt im bestehenden DEV angelegt und mit echten RLS-/RPC-Prüfungen
validiert. Die zusätzliche UI wird erst nach manueller PR-Freigabe veröffentlicht.

Mobile-first Mitgliederportal mit **Next.js App Router, React, TypeScript und Tailwind CSS**. Inoffizieller DEV-Prototyp, keine produktive Anwendung. Die Supabase-Integration verwendet echte Authentifizierung und serverseitige Freigabe/RLS, aber ausschließlich autorisierte Testkonten und Testdaten. Kein vollständiger produktiver Backend-Funktionsumfang.

## Unabhängige Demo und DEV auf GitHub Pages

**Unveränderte unabhängige Demo:** https://n00b31.github.io/feuerwehr-odenthal-demo/

**Veröffentlichte DEV-Anwendung:** https://n00b31.github.io/feuerwehr-odenthal-app/

**Quellcode:** https://github.com/n00b31/feuerwehr-odenthal-app

GitHub Pages stellt weiterhin ausschließlich statisches HTML/JavaScript bereit. DEV spricht Supabase Auth/Data API direkt an; RLS und RPCs schützen die Daten im Backend. Standardmodus `supabase-dev`: bei fehlenden Variablen gesperrter Einrichtungshinweis, niemals Rückfall auf Demo-Personen. Die öffentliche DEV-Seite ändert sich durch einen PR nicht. Das separate Demo-Repository bleibt ohne Supabase/Anmeldung lauffähig und wird hier weder gebaut noch verändert.

Die **[Supabase-DEV-Anleitung](docs/supabase-dev-setup.md)** enthält die geprüfte Grundlage aus PR #3, fünf SQL-Migrationen, RLS/Serverfunktionen, Read-only-Preflight und sämtliche manuellen Dashboard-Schritte. Implementiert: Signup, PKCE-E-Mail-Callback, Login, Warten auf Freigabe, Global-Admin-Freigabe mit Einheit und RLS-geschützte Leseansichten. Vollständiges Backend-CRUD und Anwesenheits-/Delegations-UI folgen separat. Am 03.11.2026 wurden im autorisiert verbundenen bestehenden DEV-Projekt **Migrationen 001–005 angewendet und RLS/Grants geprüft**. Zwei echte negative Auth-API-Registrierungen bestätigen den aktivierten Domain-Hook: jeweils HTTP 403 mit konkreter Hook-Meldung, keine Konten angelegt oder verändert. Beide öffentlichen GitHub-Variablen stimmen mit dem Projekt überein. Der Benutzer hat PR #3 und anschließend PR #4 gemergt; der [Main-Build mit Veröffentlichung](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/41660067350) ist erfolgreich. Die echte Callback-Route ist erreichbar. Zwei autorisierte Testkonten haben Registrierung, Mailbestätigung im gleichen Browserprofil und Pending-Status durchlaufen. Nach ausdrücklich bestätigtem ersten GLOBAL_ADMIN-Bootstrap wurde das zweite Konto über die DEV-Administration als MEMBER für Scheuren freigeschaltet. Der Benutzer bestätigt erneute Anmeldung und geschützten Zugriff ohne Administrator-Freigabefunktionen; MCP bestätigt Verifizierung, Status, Rollen, Einheit und Audit. Das ist ein kooperativer realer Abnahmelauf, keine unabhängige Aufzeichnung des Browser-/PKCE-Protokolls. Weitere Rollen-/Delegations-API-Abnahmen und produktive Betriebsanforderungen bleiben offen.

`.github/workflows/pages.yml` prüft Fachregeln, TypeScript, ESLint, Icons und die bisherigen Demo-Szenarien sowie einen separaten statischen Auth-Testbuild mit abgefangenen synthetischen Endpunkten. Ein frischer DEV-Export mit `SUPABASE_DEV_URL` und `SUPABASE_DEV_PUBLISHABLE_KEY` aus Repository-Variablen ist das einzige Pages-Artefakt. **Nur ein erfolgreicher Main-Lauf veröffentlicht.** PRs und manuelle Feature-Branch-Läufe verändern keine öffentliche Veröffentlichung. Actions → **Validate demo and Supabase DEV / publish Pages** → Run workflow. Keine geheimen Supabase-Schlüssel im Build.

**DEV 0.3 – Einzeltermine:** PR #6 ist in main integriert; additive Migrationen 006/007 ergänzen bereichsgeprüfte RPCs für Erstellen, Bearbeiten, Absagen und begründete Rückmeldungskorrekturen. Die Terminansicht verwendet ausschließlich zentrale Supabase-Daten, eigene Zusage/Absage/Vielleicht und eine Teilnehmerübersicht für berechtigte Leitung. Die normale Beginns-/Fristsperre bleibt in der vorhandenen Server-RPC; Admins und aktuelle Delegierte korrigieren separat mit Pflichtgrund. Serien, Auth und unabhängige Demo bleiben erhalten. Migration, CI-Nachweise und die getrennte echte Zwei-Konten-Abnahme stehen in [Abschnitt 11 der DEV-Anleitung](docs/supabase-dev-setup.md#11-dev-03--zentrale-einzeltermine).

**DEV 0.3.1 – Mitglieder und Layout:** `feature/dev-031-fixes` ergänzt eingeschränkte Mitglieder-RPCs (Migration 008), globale Einheits-/Rollen-/Sonderfunktions-/Statusverwaltung und begrenzte Mitgliedschaftsaktionen eigener UNIT_ADMIN-Bereiche. Historien und Schutz des letzten aktiven GLOBAL_ADMIN bleiben erhalten. DEV und Demo-Code teilen ausschließlich reine Navigation-/Branding-Komponenten: Desktop-Sidebar, mobile Bottom-Navigation mit Safe Areas, keine Demo-Identitäten oder lokalen DEV-Daten. Ursachenanalyse und Abnahmeschritte stehen in [Abschnitt 12](docs/supabase-dev-setup.md#12-dev-031--mitgliederverwaltung-und-layout).

**DEV 0.3.3 – verbindliche Anwesenheit:** Migration 010 und die DEV-Terminansicht ergänzen einmalige transaktionale Übungs-Vorbelegung, gespeicherte Originalantworten, mobile Ein-Tipp-Erfassung, Such-/Statusfilter, einen strikt vollständig festgestellten Listenabschluss und begründete Audit-Korrekturen. Terminbezogene Dienstleitung ohne Administratorrolle, sofort serverseitig wirksamer Widerruf und ein künftig mehrpersonenfähiges Delegationsmodell. Mitglieder sehen eigene bestätigte Ist-Werte, FIRE_CHIEF nur abgeschlossene Listen. Keine neue Statistik/Serienverwaltung und keine Demo-Datenübernahme. Migration, Rollen-/Testnachweise und die noch offene reale Abnahme nach Benutzermerge stehen in [Abschnitt 15](docs/supabase-dev-setup.md#15-dev-033--verbindliche-anwesenheit-und-dienstleitung).

**DEV 0.3.4 – stabile Arbeitsansicht und Terminfilter:** Hintergrundprüfungen einschließlich SDK-Token-Erneuerung erhalten den Arbeitsbereich derselben Identität. Je fünf aktuelle/zukünftige oder vergangene Termine, serverseitig nach geplantem Ende eingeordnet; Monatsauswahl in Europe/Berlin mit 50er-Keyset-Seiten und Nachladen. Geöffnete Termine werden bei Listenverschiebungen separat erneut autorisiert erhalten. Anwesenheit grün mit Haken, Abwesenheit rot mit X, unbekannte Werte neutral. Neue Erstvorbelegung: nur Zusage vorläufig anwesend, alle übrigen Antworten vorläufig abwesend; vorhandene Listen und Audit unverändert. Details, additive Migrationen 011/012 (inklusive Altclient-Kompatibilität) und Abnahmegrenzen: [Abschnitt 16](docs/supabase-dev-setup.md#16-dev-034--stabile-arbeitsansicht-und-terminfilter). Die lokalen Demo-Fachregeln bleiben unabhängig und unverändert.

**DEV 0.3.4.1 – Release-Nachweis und kontrolliertes Update:** PR #11 ist korrekt veröffentlicht; 16 live ausgelieferte Dateien wurden mit seinem Pages-Artefakt verglichen. Im untersuchten alten Browser lief noch ein Dokument vom 03.11.2026. Eine frische, vom Benutzer angemeldete Live-Ansicht bestätigt die neuen Filter, Statusfarben und 158 Sekunden Zustandserhalt bei echten Supabase-Abfragen. Neue Pages-Builds erhalten sichtbare Commit-/Build-Identität, `release.json`, releasebezogene Worker-Caches und einen Hinweis „Neue Version verfügbar“ ohne automatischen Reload. Erst ausdrücklich bestätigtes Aktualisieren verwirft ungespeicherte Eingaben. Nach Main-Deployment vergleicht die CI jede veröffentlichte Datei mit genau ihrem DEV-Artefakt. Vollständige Kette, Grenzen und einmalige Altclient-/PWA-Prüfung: [Abschnitt 17](docs/supabase-dev-setup.md#17-dev-0341--release-nachweis-und-kontrollierte-aktualisierung). Diese Korrektur wird erst nach Benutzermerge veröffentlicht; kein automatischer Merge.

**DEV 0.4 – Dienstbuch und Jahresberichte:** Migration 013 ergänzt zentrale, historisch berechtigte Jahresaggregation ausschließlich bestätigter Anwesenheit, persönliches Dienstbuch, Einheits-/Funktionsstatistiken, ein lesendes FIRE_CHIEF-Dashboard und sichere vollständige CSV-Exporte. Keine Zusagen als Anwesenheit, keine Doppelzählung gemeinsamer Dienste, verständliche Warnungen bei fehlenden Daten. Ausbildungsrelevanz bleibt zentral und nur durch GLOBAL_ADMIN begründet änderbar. Architektur, Kennzahlendefinitionen, Rechte, echte SQL-Tests versus synthetische Browsertests und die vorbereitete manuelle Abnahme: [Dienstbuch-DEV-Anleitung](docs/dutybook-dev.md). Feature-PR, kein automatischer Merge oder Pages-Release; separates Demo-Repository unverändert.

Artefakte: **`ui-review`** für lokale Demo-Regression, **`synthetic-auth-test-results`** für künstliche Auth-/Zwei-Sitzungs-Termin-/Berichts-Szenarien und **`supabase-dev-export`** für den eigentlichen statischen DEV-Export. Keine echten Auth-Tokens/Passwörter in Testartefakten. Unternehmensrichtlinien nicht umgehen; Installationen und Builds laufen vollständig in GitHub Actions.

### Redesign vor einem Merge ausprobieren

Im Pull Request den erfolgreichen Pages-Workflow öffnen. Für die Demo-Regression `ui-review`, für DEV `supabase-dev-export` herunterladen und entpacken. Die Demo-Bilder unter `test-results` zeigen Hell/Dunkel sowie mobile und Desktop-Ansichten. Ohne echte Supabase-Konfiguration zeigt der DEV-Export nur den Einrichtungshinweis.

Mit vorhandenem Node.js im entpackten Artefakt-Verzeichnis (enthält `out`) den vorhandenen Vorschau-Server aus dem Repository ausführen:

```powershell
Set-Location C:\Vorschau\ui-review
node C:\Projekte\feuerwehr-odenthal-app\scripts\preview-pages.mjs
```

Aufruf: `http://localhost:3100/feuerwehr-odenthal-app/`. Dafür sind weder npm-Installation noch lokaler Build nötig; vorhandene Build-Ordner müssen nicht ersetzt werden. Die Vorschau bindet ausschließlich an Loopback; auf dem Smartphone ist dessen `localhost` nicht der Entwicklungsrechner. Ohne Node.js stehen die CI-Screenshots zur Ansicht bereit.

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

GitHub Pages kann die in `next.config.ts` konfigurierten individuellen HTTP-Header nicht übernehmen; diese gelten nur beim Next.js-Serverbetrieb. Pages verwendet die Header der Hostingplattform. Statische Dateien sind öffentlich; Supabase Auth/RLS/RPCs sichern erst die geschützten Daten. Pages allein ist kein Authentifizierungs- oder Datenbankserver.

## Lokal starten

Voraussetzung für erlaubte lokale Ausführung: Node.js mindestens 22 (Supabase-SDK), CI verwendet Node 24. Bei gesperrter npm-Installation ausschließlich Actions verwenden.

```powershell
Set-Location C:\Projekte\feuerwehr-odenthal-app
npm.cmd ci
npm.cmd run build
npm.cmd run start -- --hostname 127.0.0.1 --port 3000
```

Aufrufen: **http://localhost:3000**. Entwicklung: `npm.cmd run dev -- --hostname 127.0.0.1 --port 3000`.

Die `.cmd`-Aufrufe verwenden die Windows-Befehlsshims und ändern keine Execution Policy. Nur verwenden, soweit die Unternehmensrichtlinien dies erlauben. Bei gesperrten Installationen ausschließlich den GitHub-Actions-Build nutzen; keine Sicherheitsrichtlinien umgehen. Eine erlaubte Installation benötigt einmalig Internet für Pakete; laufende Demo und Build benötigen weder Cloud noch Online-Schriften.

Für den **ausdrücklichen lokalen Demo-Regressionsmodus** vor dem Build/Start
`$env:NEXT_PUBLIC_APP_MODE='demo'` setzen. Ohne diese Angabe gilt DEV.
Die folgenden Funktions-/Architekturabschnitte beschreiben den weiterhin enthaltenen lokalen
Demo-Modus, **nicht** bereits vollständig angebundenes Supabase-CRUD. Für Auth-/Backend-Verhalten
ist ausschließlich die [DEV-Anleitung](docs/supabase-dev-setup.md) maßgeblich; insbesondere werden
DEV-Sitzungen getrennt vom nachfolgend beschriebenen Demo-Speicher verwaltet.

Der Server ist bewusst an Loopback gebunden. Auf einem Smartphone ist dessen `localhost` nicht der Entwicklungsrechner. Für einen echten Gerätetest muss ausdrücklich ein vertrauenswürdiger Netzwerkzugang mit HTTPS eingerichtet werden; nicht einfach als öffentliches Mitgliederportal veröffentlichen.

## Enthaltene Funktionen

| Bereich | Umsetzung |
|---|---|
| Start | Persönliche Begrüßung und Einheit, nächster Übungsdienst (sonst nächster Termin), direkte Zusage/Absage/Vielleicht ohne Dialog, nach Frist priorisierte offene Rückmeldungen, kompaktes Ist-Dienstbuch, aus vorhandenen Daten abgeleitete Hinweise und Dokument-Schnellzugriff |
| Termine | Alle sechs Dienstarten, Suche, Bereichs-/Typfilter, Zukunft/Historie/offene Rückmeldungen, Beschreibungen, Ort, Organisator, Status und optionaler Anmeldeschluss |
| Rückmeldung | Zusage, Absage, vielleicht; änderbar bis zum früheren Zeitpunkt aus Dienstbeginn und Anmeldeschluss; Sperre in UI und Fachschicht |
| Anwesenheit | Separat von Rückmeldung: anwesend, abwesend, nicht festgestellt. Einmalige, vorläufige Vorbelegung bei Übungen; manuelle Werte bleiben erhalten. Zuständige Administration oder terminbezogen delegierte Leitung bestätigt die gesamte Liste; spätere Korrektur mit Pflichtbegründung |
| Dienstleitung | Zuständige Administration weist ein Mitglied aus dem gespeicherten Teilnehmerkreis einer einzelnen Termininstanz zu; jederzeit widerrufbar, keine zusätzlichen globalen Rollen |
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

- **Eine Zusage ist niemals ein bestätigter Anwesenheitsnachweis.** Bei Übungen ist sie lediglich eine vorläufige Erfassungshilfe; ohne Listenbestätigung zählt sie nicht. Nicht festgestellte Anwesenheit bleibt unbekannt und zählt nicht als Teilnahme.
- Rückmeldungen sind ab `now >= startsAt` gesperrt, auch wenn eine bereits geöffnete Seite weiterläuft. Der UI-Takt beträgt eine Sekunde; jeder Fachbefehl prüft die tatsächliche Uhrzeit erneut. In der Demo gilt die Gerätezeit, später zwingend die Serverzeit.
- Anmeldeschluss ist zusätzlich bindend, ebenfalls einschließlich des exakten Grenzzeitpunkts.
- Tatsächliche Anwesenheit darf die Administration des Terminbereichs oder die ausdrücklich für genau diese Instanz delegierte Person erfassen und bestätigen, jeweils erst ab Beginn. Bei Abschluss bleiben ungeklärte Personen ungeklärt, nicht automatisch abwesend.
- Nach Abschluss ist ein mindestens fünf Zeichen langer Korrekturgrund erforderlich. Protokoll erfasst Person, Zeitpunkt, Aktion sowie alten/neuen Anwesenheitswert. Terminbearbeitungen und Rollenänderungen protokollieren vorher/nachher.
- Begonnene Termine sind nicht mehr verschiebbar. Termine mit manuell erfassten Ist-Werten oder Listenabschluss sind nicht absagbar; eine rein automatische, unbestätigte Vorbelegung verhindert eine administrative Absage noch nicht. Korrekturen erfolgen über die Anwesenheit.
- Jede Instanz besitzt eine **Teilnehmerliste mit damaliger Einheits-ID**. Ein Wechsel überschreibt keine vergangenen Anwesenheiten, Quoten oder Historien. Bereits angelegte zukünftige Teilnehmerlisten bleiben ebenfalls unverändert; neue Zuordnungen wirken auf anschließend neu angelegte Termine. Es gibt keinen nachträglichen automatischen Roster-Abgleich.
- Für Einheitswechsel benötigt die handelnde Person Rechte in beiden Einheiten. Eine reine Einheitsadministration kann keine fremde Einheit verwalten. Funktionsadministrationen können Personen ihrer eigenen Funktion zuordnen oder entfernen, nicht fremde Funktionen oder Rollen vergeben.
- Rollen sind Mehrfachzuweisungen mit unabhängigem Scope. Globale Rollenvergabe ist GLOBAL_ADMIN vorbehalten; die eigene globale Rolle kann in der Demo nicht entfernt werden.
- Serien halten die **Berliner lokale Uhrzeit** über Sommer-/Winterzeit hinweg. Monatliche Serien begrenzen nicht vorhandene Monatstage auf den letzten Tag des Zielmonats. Nicht existierende Uhrzeiten während der Frühlingsumstellung werden ausdrücklich abgelehnt; mehrdeutige Herbstzeiten verwenden das frühere Vorkommen. Keine stillen Datumsverschiebungen.

### Statistikdefinition

Ein Jahr wird nach **Europe/Berlin** bestimmt, nicht UTC oder Browser-Zeitzone. Berücksichtigt werden bereits begonnene, nicht abgesagte Termine. „Übungsdienst“ umfasst reguläre Übungsdienste und Sonderübungen. Die Anzahl bisheriger Übungen wird weiterhin einschließlich offener Listen angezeigt; bestätigte und offene Listen sind daneben ausgewiesen. Die persönliche Quote ist die Anzahl bestätigt besuchter Übungen geteilt durch die Übungen mit **bestätigter Liste**, zu denen die Person im gespeicherten Teilnehmerkreis gehört. Entsprechend verwendet die Bereichsquote nur Einladungen und Teilnahmen bestätigter Übungslisten. Offene Listen senken die endgültige Quote nicht. Eine leere Basis wird als 0 % angezeigt.

Teilnahmen zählen für alle Dienstarten ausschließlich bei Ist-Wert `present` **und vorhandenem `finalizedAt`**. Automatisch vorbelegte sowie manuell erfasste offene Listen zählen weder als Teilnahme noch für Quote, Stunden, besuchte Dienste oder die Mitgliederübersicht. Das gilt auch für bereits früher gespeicherte, noch offene Listen. CSV-Bereichsexporte trennen bestätigte Zahlen und vorläufige Entwurfszahlen ausdrücklich; persönliche Exporte enthalten ausschließlich bestätigte Teilnahmen. Ausbildungsstunden sind die volle Dauer bestätigt besuchter Dienste, keine individuelle Ankunfts-/Abgangszeit. Bereichsstatistik umfasst Termine, die diesem administrierten Bereich zugeordnet sind; „Alle Einheiten“ umfasst für globale Administration sämtliche Bereiche. Die Mitgliederübersicht folgt den historischen Teilnehmerkreisen, nicht nur aktuellen Zuordnungen.

### Vorbelegung und terminbezogene Dienstleitung

Bei **regulären Übungsdiensten und Sonderübungen** bereitet `prepareAttendance` die Liste beim ersten Öffnen der Anwesenheitserfassung ab Beginn vor. Ist die Ansicht vorher geöffnet, erfolgt dies beim Erreichen des Beginns. Zusage → vorläufig anwesend, Absage → vorläufig abwesend, Vielleicht/keine Antwort → nicht festgestellt. Andere Dienstarten behalten die manuelle Erfassung. Jeder bereits gespeicherte Eintrag, einschließlich ausdrücklich manuell gesetztem „nicht festgestellt“, bleibt unverändert.

Die optionalen Felder `attendancePreparedAt` und `attendancePrefilledIds` speichern die einmalige Initialisierung und die Herkunft der vorbelegten Einträge. Manuelle Änderungen entfernen die jeweilige Vorbelegungsmarkierung, bleiben aber bis zur Bestätigung ein Entwurf. Erneutes Öffnen, Neuladen und wiederholte Initialisierungsbefehle erzeugen keine zweite Vorbelegung. Abgeschlossene Bestandslisten bleiben unverändert. Speicherfehler werden angezeigt, die Bestätigung bleibt bis zur erfolgreichen Vorbereitung gesperrt; ein erneuter Versuch ist möglich.

Unter **Termindetails → Organisator zuweisen** wählt die zuständige Einheits-, Funktions- oder globale Administration ein Mitglied aus dem gespeicherten Teilnehmerkreis. `delegatedOrganizerId` gilt ausschließlich für diese Instanz; `organizerId` bleibt die ursprüngliche Organisation. Eine Serieninstanz erhält keine Rechte für ihre Geschwister. Mehrere Funktionszuordnungen und historische Einheitswechsel ändern den gespeicherten Teilnehmerkreis nicht. Die Auswahl ist deshalb nicht pauschal auf die aktuelle Einheit beschränkt.

`canManageAttendance` prüft bei jedem Vorbereitungs-, Erfassungs-, Bestätigungs- und Korrekturbefehl die zuständige Bereichsadministration **oder** die aktuelle Delegation mit Eintrag im Teilnehmerkreis. Delegierte sehen die Planungs-/Teilnehmerliste und verwalten Anwesenheit über **Termine**, erhalten aber weder Terminbearbeitung/Absage noch Delegationsvergabe, Mitgliederverwaltung, Bereichsstatistiken oder allgemeine Administratorrechte. Widerruf bzw. Neuzuweisung entzieht die zusätzlichen Rechte beim nächsten Befehl unmittelbar; der lokale Speicher wird vor jedem Befehl erneut gelesen. Speicherereignisse entfernen die Erfassung auch aus bereits geöffneten Ansichten anderer Tabs.

„**Anwesenheitsliste bestätigen**“ bestätigt die geprüften Werte der gesamten Liste, ohne ungeklärte Personen abwesend zu setzen. Nachträgliche Änderungen verlangen weiterhin einen mindestens fünf Zeichen langen Grund und protokollieren alten/neuen Wert, betroffene Person, Termin, Akteur und Zeitpunkt. Auch Vorbelegung, Delegation, Widerruf und Bestätigung werden lokal protokolliert.

Die neuen Felder sind im bestehenden Version-1-Schema optional. Bisherige lokale Daten bleiben ohne Reset lesbar; es wird keine Delegation aus einem alten `organizerId` abgeleitet. **Diese Fachprüfung ist keine sichere Autorisierung:** Browserdaten und Profilwechsel sind manipulierbar. Erst ein produktives Backend kann jede Lese-/Schreibaktion anhand verifizierter Identität, aktueller Delegation, Serverzeit und atomarer Transaktionen sicher durchsetzen; das spätere Audit muss serverseitig unveränderbar sein.

### Lesbares Änderungsprotokoll

Das Protokoll zeigt betroffene und handelnde Personen mit Namen, Termine mit Titel, Datum, Uhrzeit in Berlin und Bereich. Anwesenheitswerte, Rückmeldungen, Rollen, Einheiten, Sonderfunktionen und Delegationen werden verständlich beschriftet. Vorbelegungen erscheinen als kompakte vorläufige Zusammenfassung statt einer JSON-Liste mit Personen-IDs. Korrekturgründe und andere frei eingegebene Texte bleiben wortgetreu.

Die technischen IDs und ursprünglichen Detaildaten werden nicht ersetzt oder gelöscht; sie stehen bei Bedarf unter **Technische Details**. Neue Einträge speichern zusätzlich einen optionalen `display`-Snapshot mit den damaligen Anzeigenamen und Terminangaben. Spätere Umbenennungen oder Terminänderungen verändern diese Beschriftungen nicht. Bereits vorhandene Einträge ohne Snapshot werden ohne Reset anhand der noch verfügbaren Daten aufbereitet; deren Beschriftungen verwenden den aktuellen Datenbestand. Fehlende Zuordnungen oder nicht lesbare alte Details werden ausdrücklich als solche angezeigt, nicht geraten.

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
src\domain\audit.ts        Lesbare Protokollansicht und kompatible Aufbereitung alter Einträge
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
- `npm.cmd run icons` erzeugt 192/512-Pixel-PNGs, ein maskierbares 512-Pixel-Icon, Apple-Touch-Icon (180 Pixel) und Favicon (32 Pixel). Proportionen und Originalfarben bleiben erhalten; 14 % Rand pro Seite, beim maskierbaren Icon 16 %, und eine aus der Vorlage abgetastete Hintergrundfarbe schützen das Motiv. Ein Pixeltest prüft, dass das Motiv innerhalb der kreisförmigen Maskable-Safe-Area mit 80 % Durchmesser bleibt.

Die bereitgestellten Grafiken sind laut Auftrag Originalgrafiken der Feuerwehr Odenthal; ihre Verwendung macht den Prototyp nicht zu einer offiziellen App. Keine zusätzliche Lizenz oder allgemeine Weiterverwendungserlaubnis wird hiermit behauptet. **Grenze:** Die Flammenvorlage hat nur 48 Pixel; Hochskalierung erzeugt keine neuen Details. Für ein schärferes großes Installationssymbol wäre eine höher aufgelöste Originalvorlage nötig. Keine nachgezeichneten oder KI-erzeugten Ersatzlogos.

Logo und Flammensymbol werden in der Oberfläche mit dezentem 6-Pixel-Eckenradius dargestellt; die Original-PNGs bleiben unverändert. Normale App-Icons und Favicon besitzen proportional abgerundete, transparente Ecken. Maskierbares Android-Icon und Apple-Touch-Icon bleiben vollflächig deckend, damit die jeweilige Plattform ihre eigene Form ohne dunkle Transparenzränder anwenden kann.

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

Der Workflow führt **52 Fach-/Konfigurationstests und 19 Playwright-Szenarien** aus. Die acht ursprünglichen Funktionsabläufe bleiben erhalten; sechs Redesign-Szenarien ergänzen Ein-Tipp-Rückmeldung ohne Ist-Änderung, Anmeldeschlusssperre, persistentes Theme/Systemwechsel/Tab-Abgleich, sichtbare Theme-Speicherfehler, Original-Branding und Icon-Größen sowie Navigation/Dialogfokus und responsive Layouts bei 320/390/412 Pixeln. Vier weitere Browserabläufe prüfen Vorbelegung/Reload/Bestandserhalt, bestätigte Statistik und CSV, delegierte Leitung/Korrekturgrund, fremde Termine, Widerruf in offener Ansicht sowie Beginn und Speicherfehler mit erneutem Versuch. Ein Protokoll-Szenario prüft lesbare Namen und Termindaten für Altbestände, ausklappbare Originaldaten und die schmale Hell-/Dunkel-Ansicht. Die Fachtests decken zusätzlich unabhängige Serieninstanzen, Funktions-/Einheitsgrenzen, erhaltene Altbestände und stabile Protokollbeschriftungen ab. Axe prüft die Haupt-, Verwaltungs-, Protokoll- und delegierten Anwesenheitsansichten in Hell/Dunkel. iPhone-13- und Pixel-7-Profile prüfen Touch-Eingaben in **Chromium-Emulation**, nicht auf echter Hardware oder Safari. Screenshots sind im CI-Artefakt verfügbar. Die tatsächlichen Ergebnisse sind im jeweiligen Actions-Lauf bzw. Pull Request ersichtlich.

Das Modern-Utility-Design und bestehende Daten bleiben erhalten; Vorbelegung, Delegation und ausschließlich bestätigte Statistik erweitern gezielt den Anwesenheitsworkflow. Eine zukünftige fachliche Wehrleiter-Rolle (`FIRE_CHIEF`) ist **nicht implementiert**; insbesondere werden keine zusätzlichen technischen Adminrechte vergeben. Ein separates Mitteilungsmodul ist ebenfalls nicht vorhanden; die Startseite kennzeichnet Hinweise aus bestehenden Termin-/Dokumentdaten ausdrücklich.

`npm.cmd run icons` erzeugt die PNG-Symbole erneut. Testartefakte liegen in `test-results` und sind in `.gitignore` ausgeschlossen. Playwright-Kontexte sind pro Test isoliert und verändern nicht die Daten des normalen Browserprofils.

**Dependency-Audit-Hinweis:** Die initiale npm-Installation meldete 16 moderate Advisories. Die anschließend versuchte gezielte Prüfung mit `npm.cmd audit --omit=dev --json` wurde vom konfigurierten Paket-Registry-Proxy mit HTTP 429 begrenzt, auch beim erneuten Versuch. Eine belastbare aktuelle Zuordnung zu Laufzeit- oder Entwicklungsabhängigkeiten ist deshalb nicht bestätigt. Dies ist kein als sauber deklarierter Security-Audit; vor Produktivbetrieb vollständig prüfen und betroffene Abhängigkeiten aktualisieren.

## Produktionsausbau – bewusst nicht implementiert

1. **PostgreSQL und Server-API:** normalisierte Personen-, Einheiten-, Funktionen-, historisierte Mitgliedschafts-, Rollen-, Serien-/Termininstanz-, Rückmeldungs-, Ist-Anwesenheits-, Dokument- und Audit-Tabellen. Transaktionen, Fremdschlüssel, eindeutige Rückmeldung je Person/Instanz, optimistische Konkurrenzkontrolle, Indizes nach Scope/Zeit/Person, paginierte Abfragen; Lasttests mit mindestens 250 Benutzern.
2. **Echte Identität mit Entra External ID:** geeignetes Tenant-/Produktmodell festlegen, OIDC Authorization Code + PKCE, serverseitig geschützte Session mit Secure/HttpOnly/SameSite-Cookies. Tokens vollständig gegen Aussteller, Zielgruppe, Signatur und Ablauf prüfen; niemals Client-Profil-IDs als authentifizierte Identität akzeptieren.
3. **Registrierung:** E-Mail-Eigentum verifizieren, normalisierte verifizierte Domain exakt `feuerwehr-odenthal.de`, danach Status „wartet auf manuelle Freigabe“. Administration genehmigt und ordnet Einheit zu; vorher keine Fachzugriffe. Domain-Suffix allein beweist weder E-Mail-Eigentum noch Mitgliedschaft. Rollen ausschließlich serverseitig aus freigegebener Datenbankzuordnung ableiten; kein implizites Administrationsrecht durch E-Mail-Domain.
4. **Jede Operation serverseitig autorisieren:** sowohl Lesezugriffe/Statistik als auch Änderungen anhand Person, Rolle, Scope, aktueller terminbezogener Delegation und serverseitiger Zeit prüfen. Die heutige zentrale Domänenlogik hinter dieser Grenze ausführen; atomare Beginngrenze, einmalige Vorbelegung, Bestätigung und Widerruf mit Transaktionen absichern.
5. **Revisionsgerechtes Audit und Datenschutz:** unveränderbare serverseitige Audit-Historie mit Alt-/Neuwert, Akteur, Begründung und vertrauenswürdiger Zeit; Aufbewahrungs-/Löschkonzept, berechtigte Exporte, Verschlüsselung, Backups, Restoretests, Protokollierung und Monitoring. Zuständigkeiten und zulässige Datenverarbeitung vor Echtdatenbetrieb klären.
6. **SharePoint gesondert klären:** App-Anmeldung über External ID erteilt keine SharePoint-Berechtigung. Verbindliche Tenant-Richtlinien für Gäste/B2B/External Sharing, Freigabelinks, MFA/Conditional Access und Dokumentklassifikation prüfen. Personen haben keine M365-Lizenzen; ob und wie konkrete Gastzugriffe zulässig sind, hängt von Microsoft-Produktbedingungen, Tenant und Nutzung ab. Nicht pauschal lizenzfrei versprechen. External-ID-App-Identitäten sind nicht automatisch SharePoint-Gastidentitäten. Keine anonymen „Jeder“-Links für sensible Feuerwehrunterlagen empfehlen.
7. **Betrieb und PWA:** HTTPS, Secret-Verwaltung, Security-Header/CSP, CSRF-/Rate-Limit-/Missbrauchsschutz, Dependency-Advisory-Prüfung, Barrierefreiheits-/Screenreaderprüfung, echte iPhone-/Android-Installation und Geräte-Zeitzonen testen. Vollständige Offline-Synchronisation nur mit Konflikt-/Berechtigungs-/Datenschutzkonzept ergänzen.

Kein produktiver Cloud-Dienst und keine produktive Authentifizierung sind Teil dieser Demo. Für den beschriebenen Betrieb existiert keine Authentifizierungsattrappe, die als sicher ausgegeben wird.
