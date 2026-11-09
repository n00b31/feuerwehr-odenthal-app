# DEV 0.6.4 – Mein Feuerwehr-Cockpit

DEV 0.6.4 wurde über PR #22 manuell gemergt und vom Projektverantwortlichen
erfolgreich abgenommen. Aktuelle Ergänzung: DEV 0.6.4.1 im Branch
`feature/dev-0641-attendance-filter`, kein automatischer Merge.
Öffentlich bleibt DEV 0.6.4 bis zum manuellen Merge dieser Ergänzung.
Die unabhängige Demo wurde nicht verändert.

## DEV 0.6.4 – Erfolgreiche manuelle Abnahme

Vom Projektverantwortlichen ausdrücklich bestätigt: MEMBER-Dashboard,
GLOBAL_ADMIN-Dashboard, Fahrzeugverwalter-Dashboard, Responsive Design,
Light-/Dark-Mode und Regression bestehender Funktionen.
Bestätigung am 09.11.2026 dokumentiert; ein gesondertes tatsächliches
Abnahmedatum wurde nicht angegeben. Zugehöriger Main-Merge von PR #22:
`40e9d96602ede5af22fceb800cc3af449011a00d`.
Diese Angaben sind eine manuelle Nutzerbestätigung, keine synthetischen
Testergebnisse. Native iPhone-/Android-PWA-Gerätetests bleiben offen.

## DEV 0.6.4.1 – Offene Anwesenheitslisten

„Anwesenheitslisten abschließen“ unter „Meine offenen Aufgaben“ öffnet
`/termine/?bereich=dienste&ansicht=open_attendance` statt nur eines
einzelnen Dienstes. Der Filter ist auch in „Terminansicht“ verfügbar.
Die bestehende Dienstverwaltung zeigt Datum, Dienstbezeichnung,
Einheit/Funktions-Scope, primäre Dienstleitung beziehungsweise Organisator,
Anwesenheitsstatus und die direkte Aktion „Anwesenheit erfassen“.

Die additive Migration 035 ergänzt die bestehende `ff_events_page`-RPC
um `open_attendance`, Capability und exakten Gesamtzähler. Die private,
nicht direkt ausführbare Auswahl `open_attendance_events()` wird von
dieser RPC und dem Cockpit verwendet. Voraussetzungen:

- Geplanter normaler Dienst, kein organisatorischer Kalender-/Fahrzeugeintrag.
- Beginn kleiner oder gleich Serverzeit; nicht die manipulierbare Browser-Uhr.
- `NOT_STARTED` oder `IN_PROGRESS`; `COMPLETED`/`CORRECTED` ausgeschlossen.
- Bestehende `can_lead_event` **und** `can_view_event` für den aktuellen Account.

UNIT_ADMIN bleibt im eigenen Scope; FUNCTION_ADMIN behält seinen bestehenden
Funktions-Scope; delegierte Mitglieder bearbeiten ausschließlich aktuell
gültig zugewiesene Dienste. GLOBAL_ADMIN verwendet seine bestehenden
organisationsweiten Rechte. MEMBER ohne Delegation und FIRE_CHIEF ohne
zusätzliche bestehende Verwaltungsrechte werden auch bei direktem,
manipuliertem RPC-Aufruf abgewiesen. Die Filterberechtigung hängt nicht
davon ab, ob aktuell mindestens eine offene Liste vorhanden ist.

Sortierung aufsteigend nach Dienstbeginn und UUID, Keyset-Pagination
mit 50 Ergebnissen. Der Zähler umfasst alle berechtigten offenen Listen,
nicht nur die aktuelle Seite. Monats-/Statusfilter sind hier bewusst
deaktiviert. Es werden weder zusätzliche Rollen noch RLS-Regeln, Tabellen,
Schreibfunktionen oder neue Auth-Konfiguration eingeführt.
Bestehende RPC-Signaturen und andere Listenmodi bleiben kompatibel.

Nach verbindlichem Abschluss liest die bestehende Hintergrundaktualisierung
die aktuelle Auswahl und den Gesamtzähler erneut, auch für bereits geladene
Folgeseiten. Der Dienst verschwindet als offenes Ergebnis. Ein bereits
geöffnetes Detail bleibt separat als abgeschlossen und erneut berechtigt
sichtbar, zählt aber nicht mehr zur offenen Liste. Dieselbe React-Instanz
erhält Suchfilter und geöffnete Ansicht; kein vollständiger Seitenreload.
Bei Rückkehr zu Start lädt das Cockpit den aktualisierten gemeinsamen
Aufgabenzähler. Browser-Zurück aktiviert den verlinkten Filter wieder.

### Automatisierte Prüfung und manuelle DEV-Abnahme

Die echten PostgreSQL-Tests laufen ausschließlich in der isolierten
`ff_dev_ci`-Datenbank: Startgrenze, nicht initialisierte/vorbereitete/finale
Listen, UNIT_ADMIN-/Delegationsgrenzen, direkte MEMBER-/FIRE_CHIEF-Sperre,
identische Cockpit-Zähler, Abschluss, retained Detail und 51 Ergebnisse
über mehrere stabile Cursorseiten. Zusätzlich bestehende RLS-, Upgrade-
und Zwei-Verbindungs-Regressionsprüfungen.
CI: https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42635131323.

Ergebnisse: 169 Domain-/Auth-/Konfigurationstests, 17 Skripttests,
101 DEV-Browserszenarien einschließlich acht neuer Filter-/Abschlussfälle;
Typecheck und GitHub-Pages-Static-Export erfolgreich. Light-/Dark-Mode
einschließlich Axe-Prüfung, erhaltene DOM-Instanz/Suchfilter, 52 Ergebnisse
über Folgeseiten und Rückkehr zum aktualisierten Cockpit ohne Dokumentreload
geprüft. Lint ohne Fehler; die vorhandene, nicht geänderte Warnung in
`supabase-planning.tsx:65` bleibt bestehen.

Die Browserprüfungen verwenden ausschließlich synthetische Auth-/RPC-Daten
mit dem echten Supabase-SDK. Sie ersetzen keine Anmeldung mit einem echten
DEV-Konto. In DEV werden keine synthetischen Dienste, Anwesenheiten,
Konten, Rollen oder Testmails angelegt.

Migration `ff_035_open_attendance` am 09.11.2026 im vorher verifizierten
DEV `orxinqhhbtjpkzwlfaxq` regulär installiert; Registry `20261109144549`.
Ein Transaktionsguard schützt alle 34 öffentlichen/privaten Tabellen
einschließlich `auth.users`, bestehende RLS-/Tabellenrechte, unveränderte
Funktionen und die Originalkörper der beiden weiterverwendeten RPC-Helfer.
Unabhängige Nachprüfung: Datenfingerprint vor/nach Installation identisch
`c72683238f17429b74e6d72b32953cea`; private Helfer für Clients gesperrt,
öffentliche RPCs weiterhin nur für authentifizierte Benutzer ausführbar.
Keine fachlichen Daten, Rollen, Konten oder Passwörter verändert.

SHA256 der LF-normalisierten Quelle:
`ed0f578fa63771350623fad75e3ae5e76740171508283667582d22942743f032`.
SHA256 des installierten Guard-Pakets:
`5c52db53eaaf8c931ee24efa95c94a11ff45a386438f4460ab754b26724c776d`.
Der aus der Registry extrahierte SQL-Körper stimmt mit der CI-geprüften
Quelle überein; SHA256 nach Entfernen von äußerem BEGIN/COMMIT und
Rand-Leerraum:
`8d1f039e03f446111d07a2661139409b03b8d90f9e72927e4f5bd3ba935e6389`.
Der bestehende DEV-0.6.4-Client bleibt kompatibel; die neue Filter-UI
wird erst durch manuellen PR-Merge und dessen erfolgreiches Deployment
veröffentlicht.

Nach manuellem PR-Merge mit autorisierten vorhandenen Testkonten prüfen:

1. Cockpit-Aufgabe und Filter zeigen denselben vollständigen Zähler.
2. Nicht begonnene und abgeschlossene Dienste fehlen; begonnene Dienste
   ohne initialisierte Anwesenheit sind direkt bearbeitbar.
3. UNIT_ADMIN sieht nur eigene Einheiten, Delegierte nur gültige Zuweisungen;
   MEMBER und FIRE_CHIEF erhalten keine zusätzlichen Verwaltungsrechte.
4. Liste abschließen: Ergebnis und Zähler verschwinden beziehungsweise
   sinken ohne Reload; Detail und dessen Suchfilter bleiben erhalten.
5. Zu Start zurückkehren: aktualisierte Aufgaben; Kalender, Fahrzeuge,
   Dienstbuch und bestehende Anwesenheitskorrekturen unverändert prüfen.
6. Light-/Dark-Mode, Desktop-Sidebar und mobile Bottom-Navigation prüfen;
   native PWA-Gerätetests gesondert durchführen.

## Ausgangslage und Entscheidung

Die bisherige Startseite verwendete dieselbe vollständige Dienstverwaltung
wie Termine. Ihr Auth-Arbeitsbereich lud auch auf Start Terminseiten,
Dokumentenbereiche, Einheiten und gegebenenfalls offene Registrierungen.
Das war keine kompakte persönliche Übersicht.

Die neue Startseite verwendet `SupabaseDashboard` mit wiederverwendbaren
`CockpitSection`-Karten, streng geprüftem DTO in `domain/dashboard.ts`
und einem kleinen Datenadapter `data/supabase-dashboard.ts`.
`ff_my_access` bleibt der vorhandene Sitzungs-/Freigabecheck. Nur die
Startseite verzichtet auf das allgemeine Workspace-Laden; die Fachmodule
laden weiterhin ihre bestehenden Daten. Keine zweite Authentifizierung,
kein lokaler fachlicher DEV-Speicher und keine Demo-Ersatzwerte.

Eine additive Migration 034 ist erforderlich, weil bestehende RPCs entweder
vollständige Modulansichten liefern oder die benötigte kombinierte,
personenbezogene Vorschau nicht bereitstellen. `ff_dashboard()` filtert
serverseitig, gibt nur kleine Vorschauen und exakte Zähler zurück und
verwendet vorhandene Berechtigungs- und Statistikfunktionen wieder.
Es gibt keine neuen Tabellen, RLS-Regeln, Rollen oder Schreibfunktionen.

## Komponenten, Daten und fachliche Grenzen

| Bereich | Quelle und Verhalten |
|---|---|
| Persönlicher Header | Verifizierter `ff_my_access`-Name, aktueller Vorname; aktuelle `unit_memberships` und `function_memberships` über bestehende Scope-Helfer. Lokale Tageszeit ist nur die Begrüßung, fachliche Termine bleiben Europe/Berlin. |
| Nächster Übungsdienst | Nächster zukünftiger, geplanter regulärer oder Sonderübungsdienst aus `events`; aktuelle dynamische `event_members`, keine Kalender-/Fahrzeugergänzungen. Datum, Uhrzeit, Titel, Ort, Scope und gültige eigene Rückmeldung. |
| Direkte Rückmeldung | Unveränderte `ff_set_response`-RPC. Supabase prüft Beginn, Frist, festgestellten Teilnehmerkreis und Berechtigung erneut. Die UI-Sperre nutzt Serverzeit plus monotone verstrichene Zeit, nicht eine manipulierbare Browser-Uhr. |
| Offene Rückmeldungen | Exakter Zähler aller berechtigten, zukünftigen, noch beantwortbaren Dienste aller Dienstarten. Höchstens drei Vorschauen, aufsteigend nach Beginn/ID. Keine Absagen, abgelaufenen Fristen, begonnenen oder eingefrorenen Dienste. Invalidierte Antworten zählen nicht als gültige Rückmeldung. |
| Mein Feuerwehrjahr | Nur `summary` aus der bestehenden `ff_year_report(Berlin-Jahr,'personal',…)`-Berechnung. Keine Jahresdetails im Netzwerk und keine neue Formel im Frontend. Bestätigte Teilnahmen, Ausbildungsstunden und Quote. Fehlende Quote heißt „Nicht berechenbar“, nicht 0 %. |
| Aktuelle Informationen | Höchstens drei nicht archivierte, nicht abgesagte, noch nicht beendete `event_calendar`-Einträge vom Typ `information`, nach nächstem Beginn sortiert. Bestehende Scope-Sichtbarkeit; keine erfundenen Nachrichten oder neue Redaktion. |
| Meine Fahrzeugreservierungen | Nur `requester_id = auth.uid()`, bestehende Sichtbarkeit und aktive REQUESTED/APPROVED-Vorgänge. Nächste genehmigte Reservierung und nächste offene Anfrage, maximal zwei; ohne Genehmigung bis zu zwei offene Anfragen. Keine fremden persönlichen Detaildaten. |
| Meine offenen Aufgaben | Ein Zähler je tatsächlich bearbeitbarer Aufgabenart mit direktem Ziel. Keine doppelten Aufgaben bei Mehrfachrollen, keine leere Aufgabenkarte. |
| Schnellzugriffe | Bestehende Termine, gemeinsamer Kalender, berechtigter Fahrzeugkalender, eigenes Dienstbuch und Dokumente. Keine neue Modulnavigation oder duplizierten Fachaktionen. |

„Bestätigte Teilnahmen“ ist absichtlich nicht „Besuchte Übungsdienste“:
`summary.present` umfasst bestätigte Teilnahmen über die bestehenden
Dienstarten. `summary.practices` ist dagegen die Zahl berechtigter,
abgeschlossener Übungen einschließlich nicht besuchter Übungen und wäre
als persönliche Besuchszahl irreführend. Zusagen sind niemals Anwesenheit.

Quelllinks validieren UUIDs und öffnen bestehende Ansichten mit
`termin`, `aufgabe` beziehungsweise `vorgang`. Das vorhandene
Retained-ID-Verfahren autorisiert auch einen Eintrag außerhalb der
aktuell angezeigten Kalender-/Terminseite erneut. Ein verlorener Zugriff
öffnet keine alten Details. Geschlossene Kalenderdialoge werden durch
Hintergrundaktualisierung desselben Links nicht erneut geöffnet.

## Rollen und serverseitiger Schutz

| Berechtigung | Aufgaben |
|---|---|
| MEMBER | Eigene Karten; keine fremden Verwaltungsaufgaben. Eine echte, aktuelle Termin-Delegation kann eine berechtigte Anwesenheitsaufgabe hinzufügen. |
| UNIT_ADMIN | Noch nicht abgeschlossene, bereits begonnene Anwesenheitslisten und zukünftige Dienste ohne gültige primäre Dienstleitung im verwalteten Scope. |
| FUNCTION_ADMIN | Entsprechende Aufgaben ausschließlich im vorhandenen Funktions-Scope. |
| Fahrzeugverwalter | Noch bearbeitbare zukünftige REQUESTED-Reservierungen nur für Fahrzeuge mit bestehendem `vehicle_manager`-Recht. UNIT_ADMIN ist nicht automatisch Fahrzeugverwalter. |
| GLOBAL_ADMIN | Zusätzlich vorhandene offene Registrierungen und die bestehenden globalen Bearbeitungsbereiche. |
| FIRE_CHIEF | Bestehende fachliche Sichtbarkeit und persönliche Karten; keine durch das Cockpit neu gewährten technischen Verwaltungsrechte. |

Offene Registrierungen sind bewusst **nur global** sichtbar. Das vorhandene
Registrierungsmodell enthält keine verlässlich zugewiesene Antragseinheit;
die Freigabe und `ff_pending_registrations` sind bereits GLOBAL_ADMIN
vorbehalten. Eine angebliche einheitsbezogene Freigabe würde neue Rechte
oder eine erfundene Zuordnung einführen.

`ff_dashboard()` hat keine vom Client wählbare Benutzer-ID oder Scope-Parameter.
Es prüft den aktiven Account und verwendet bestehende Helfer für Mitgliedschaft,
Terminzugriff, Dienstleitung, Scope-Verwaltung und Fahrzeugzugriff.
Security Definer mit leerem `search_path`, Ausführung nur für
`authenticated`, nicht `anon`/PUBLIC. Der interne Event-DTO-Helfer ist für
Clients nicht ausführbar. Der Adapter prüft zusätzlich die zurückgegebene
Identität und die begrenzten Listen. Keine Service-Role-Schlüssel im Client.

## UX und Hintergrundaktualisierung

Mobil bleibt die gewünschte Reihenfolge Header, nächster Dienst, offene
Rückmeldungen, vorhandene Aufgaben, Informationen, Feuerwehrjahr,
Fahrzeugvorgänge, Schnellzugriffe erhalten. Desktop verwendet zwei
Spalten mit vorhandener Sidebar; ohne Aufgaben rückt das persönliche Jahr
in die oberste rechte Karte. Auf kleinen Displays bleiben Schnellzugriffe
lesbar einspaltig. Bottom-Navigation und Safe Areas bleiben erhalten.

Vorhandene Corporate-/Theme-Tokens, klare Karten, große Touch-Ziele,
Haken/X/Fragezeichen plus Text statt alleiniger Farbcodierung.
Zusage grün, Absage rot, Vielleicht bernsteinfarben, unbeantwortet neutral;
Akzent und dezenter Hintergrund werden wirklich aus dem Statustoken
berechnet. Quelllinks auf getönten Karten bleiben kontrastreich und
unterstrichen.

Die Komponente steht auf Modulebene und wird nur nach Benutzeridentität
geschlüsselt. Sichtbare 30-Sekunden-Aktualisierung und vorhandene
Auth-Revalidierung ersetzen den Snapshot ohne Remount, Scroll-/Fokusverlust
oder Seitenreload. Veraltete/in-flight Ergebnisse werden verworfen.
Bei Berechtigungs-/Netzwerkfehlern werden geschützte Karten entfernt und
eine Fehlermeldung angezeigt, nicht als leere erfolgreiche Abfrage ausgegeben.
Ein abgelehnter Schreibversuch bleibt auch nach erneutem Laden sichtbar.
Ein zusätzlicher Lesefehler wird nicht vom ursprünglichen Schreibfehler verdeckt.

Spätere Push-/E-Mail-Mitteilungen, Tätigkeitsnachweise, Abwesenheiten,
Einsatztagebuch, Material und SharePoint können zusätzliche Karten erhalten.
Diese Fachmodule sind ausdrücklich nicht implementiert.

## Automatisierte Nachweise

`supabase/tests/dashboard.sql` läuft ausschließlich rollback-only in der
wegwerfbaren CI-Datenbank. Echte PostgreSQL-Rollen, Auth-Claims und bestehende
RPCs prüfen dynamische Mehrfachmitgliedschaften, genaue offene Antworten,
Fristen/Absagen, direkte Rückmeldung, Beginnssperre, kanonische bestätigte
Statistik, scoped Informationen, eigene/fremde Reservierungen, gemischte
genehmigte/offene Vorschau, Aufgaben aller Rollen einschließlich Delegation
und Mehrfachrollen sowie gesperrte/anonymous Zugriffe.

`upgrade-064-before.sql` und `upgrade-064-after.sql` vergleichen vollständige
Datensnapshots vor/nach der additiven Migration. Bestehende Rollen,
Anwesenheit, Kalender, Serien, Importnachweise, Fahrzeuge und Konten bleiben
erhalten. Erfolgreicher PostgreSQL-/Upgrade-Lauf:
[42619449411](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42619449411).

Neue Domain-Tests prüfen DTO-Begrenzungen, Identität, eindeutige Aufgaben,
sichere Links, Begrüßung und Serverzeit-Sperren. Neue synthetische
Playwright-Szenarien prüfen echte React-/SDK-Interaktion mit abgefangenen
Protokollantworten, nicht echte gehostete Anmeldungen: alle Rollen,
direkte Rückmeldungen mit tatsächlich berechneten Farben in beiden Themes,
Quell- und Retained-Detailnavigation, Empty States, Netzwerk-/Sperrfehler,
DOM/Fokus/Scroll-Erhalt, Aufgaben-freies Desktop-Layout und responsive
WCAG-Axe-Prüfungen einschließlich 320-Pixel-Breite. Bestehende Modul-
Tests starten explizit auf Termine; das neue Cockpit hat eigene Root-Tests.

Ergebnisse des geprüften Implementierungsstands:

| Prüfung | Ergebnis |
|---|---|
| Domain/Auth/Konfiguration | 168 erfolgreich, davon 17 neue Dashboard-Tests. |
| Release-/Worker-/Seed-Skripte | 17 erfolgreich. |
| DEV-Browserregression | Alle 93 erfolgreich in der vollständigen CI, einschließlich 23 neuer Cockpit-Szenarien. Die neuen 23 zusätzlich lokal erfolgreich. |
| Lokale Demo-Regression | Alle 19 lokal und in CI erfolgreich; separates Demo-Repository unangetastet. |
| Fehlende DEV-Konfiguration | Ein zusätzlicher lokaler Browserfall erfolgreich: Start, Administration, Termine und Callback bleiben gesperrt, kein Demo-Fallback. |
| PostgreSQL und Upgrade | Neue und bestehende SQL-/Parallelitäts-/Upgrade-Prüfungen erfolgreich in der isolierten CI. |
| TypeScript / ESLint | Typecheck erfolgreich, keine Lint-Fehler. Ein bereits bestehender Ref-Cleanup-Hinweis in `supabase-planning.tsx:65` ist nicht Teil dieser Änderung. |
| Static Export | Demo, synthetisches DEV, gesperrtes DEV und echtes DEV erfolgreich; BasePath bleibt `/feuerwehr-odenthal-app`. |

Vollständiger Pages-/DEV-/Demo-Prüflauf:
[42620642048](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42620642048)
auf Implementierungscommit `7c572c3d702a…`. `auth`, `build` und `dev-export`
erfolgreich; `deploy` auf dem Feature-Branch absichtlich übersprungen.
Die früheren lokalen Läufe deckten zusätzlich einen noch auf das alte
Root-Modul gerichteten Test und einen knapp unzureichenden Kontrast der
Datumszeile auf getöntem Hintergrund auf. Tests wurden entsprechend der
neuen Modultrennung zugeordnet und die Kontraste tatsächlich korrigiert;
die endgültigen positiven Ergebnisse stammen aus dem korrigierten Stand.

## Kontrollierte DEV-Installation

Am 09.11.2026 regulär über `apply_migration` ausschließlich im vorher
verifizierten DEV `orxinqhhbtjpkzwlfaxq` installiert:
`ff_034_dashboard`, registrierte Version **`20261109125853`**.
Quelle `supabase/migrations/20261109003400_dashboard.sql`, normalisierte
LF-SHA256:
`fc4a12b5bdfa6b01a3a4ec5ca3b9ce24d7420e80cbeca390c079cbba64dda273`.

Die Transaktion prüfte vorab den exakten Stand 001–033 und das Fehlen
beider neuen Funktionen. Ein frischer Snapshot aller **34 Tabellen** in
`public`, `ff_private` und `auth.users` wurde gegen den vorab geprüften
Bestand und anschließend gegen den Nachher-Zustand verglichen.
Zusätzlich wurden bestehende RLS-Flags, Policies, Tabellen-/Funktions-ACLs
und bestehende Funktionsdefinitionen vorher/nachher verglichen.
Jede Abweichung hätte die gesamte neue Migration zurückgerollt.
Keine breiten Tabellensperren oder Änderungen historischer Werte.

Unabhängige anschließende Read-only-Prüfung bestätigt unverändert den
gesamten Datenfingerprint `090323033a2d0735ee971edac8dc6f88`,
die registrierte Migration und den SHA256 des tatsächlich installierten
normalisierten Schutzpakets:
`a6c8853fb808f189853cd031520fc88209daceedc6b0a549e9b809c7bf1d73e4`.
Er stimmt mit dem vorab aus der geprüften Quelle erzeugten Paket überein.

Unverändert unter anderem: **9 Auth-Konten, 59 Profile,
67 Mitgliedschaftsintervalle, 17 Rollenzuweisungen, 294 Termine,
2671 Rückmeldungen, 2685 Anwesenheiten, 262 Bestätigungen, eine Serie,
eine Serienausnahme, vier Import-/Planbestätigungen, 13 Kalendereinträge,
zehn Fahrzeugvorgänge und 176 Audit-Einträge**. Die zusätzlichen seit
Migration 033 vorhandenen Abnahmedaten wurden erhalten, nicht auf den
damaligen kleineren Bestand zurückgesetzt.

Beide neuen Funktionen sind `STABLE`, Security Definer mit leerem
`search_path`. Nur `authenticated` kann `ff_dashboard()` ausführen;
`anon` ist gesperrt. Der private DTO-Helfer ist für beide Clientrollen
gesperrt. Bestehende RPCs/RLS/Berechtigungen blieben unverändert.
Keine Dashboard-Datenabfrage unter einer fremden realen Benutzeridentität,
keine gehosteten synthetischen Konten, keine Mails oder Testimporte.
Keine zusätzlichen Supabase-Dashboard-/Auth-Einstellungen erforderlich.

## Reale DEV-Abnahme – vorbereitet, noch nicht ausgeführt

Nach manuellem PR-Merge zuerst das erfolgreiche Main-Deployment und in
`release.json`/Versionszeile DEV 0.6.4 mit dem tatsächlichen Merge-Commit
prüfen. Bei vorhandener PWA erst den Update-Hinweis ausdrücklich bestätigen;
ungespeicherte Eingaben nicht stillschweigend verwerfen.

| Test | Manueller Ablauf | Tatsächlicher Status |
|---|---|---|
| A – MEMBER | Mit autorisiertem Konto anmelden; Name, aktuelle Einheiten/Funktionen, nächster Dienst und Quelle prüfen. Rückmeldung ändern und dieselbe Antwort im Terminmodul vergleichen. Offene Anzahl prüfen, Jahreswerte mit eigenem Dienstbuch vergleichen. | Offen, nicht als gehostete Abnahme ausgegeben. |
| B – GLOBAL_ADMIN | Tatsächlich vorhandene Aufgaben prüfen. Registrierungen, Anwesenheitsliste, fehlende Dienstleitung und Fahrzeuganfrage direkt öffnen; keine Testkonten oder Vorgänge allein für die Anzeige anlegen. | Offen. |
| C – Fahrzeugverwalter | Mit berechtigtem Konto nur eigene Fahrzeugbereiche prüfen und vorhandene Anfrage direkt im vorhandenen Modul öffnen. MEMBER/FIRE_CHIEF ohne Zusatzrecht dürfen keine Genehmigung erhalten. | Offen. |
| D – Responsive/Theme | Desktop-Sidebar und Smartphone-Bottom-Navigation, große Touch-Flächen, Light/Dark, lange echte Namen/Titel, Quelle außerhalb des Monats, unveränderte Scroll-/Fokusposition nach Hintergrundprüfung. | Synthetisch automatisiert; reale Browser-/Geräteabnahme offen. |
| E – Regression | Termine/Serien/CSV, Rückmeldungen, Anwesenheit, Dienstbuch, Fahrzeuganfrage/-genehmigung/-stornierung und Benutzerverwaltung mit ausdrücklich erlaubten Testdaten kontrollieren. | Automatisiert separat; reale Abnahme offen. |

Native iPhone-/Android-Installation, Safe Areas im echten PWA-Fenster,
Back-Geste und OS-Theme-Wechsel bleiben offen. Desktop-Chromium mit
mobilen Viewports ist kein Ersatz dafür. Es wurden für diese Entwicklung
keine echten Konten/Passwörter/Rollen geändert, Testmails versandt oder
Mitgliederdaten importiert.

## Bekannte Grenzen

Der Kalender liefert bereits bestehende organisatorische Einträge, kein
News-System. Aufgaben sind eine kompakte Vorschau mit Zähler und erstem
Ziel, keine neue Inbox. Die Jahresberechnung wird serverseitig aus dem
bestehenden Report wiederverwendet; nur dessen Summary wird übertragen.
Auch diese bestehende Berechnung hat mit wachsendem Datenbestand weiterhin
den Performancebedarf der bisherigen Berichtslogik.

Die statische GitHub-Pages-App hat weiterhin keine eigenen Server-Routen;
Autorisierung und jede Mutation liegen in Supabase. Keine Änderung der
bestehenden Recovery-Versandgrenzen, Offline-/Push-Funktion oder
Produktionsfreigabe. Die übrigen dokumentierten DEV-Grenzen gelten weiter.
