# DEV 0.4 – Zentrales Dienstbuch und Jahresberichte

## Umfang und Architektur

Die Berichte verwenden ausschließlich das bestehende Supabase-DEV-Projekt
`orxinqhhbtjpkzwlfaxq`, seine bestätigten Anwesenheiten und historischen
Mitgliedschaftszeiträume. Keine zweite Datenbank, Demo-Identitäten, produktiven
Mitgliederdaten oder neuen Authentifizierungsverfahren.

- Datenbank: `supabase/migrations/20261106001300_dutybook_reports.sql`.
- Zentraler Faktensatz und Aggregationen: private SQL-Funktionen; öffentliche,
  zur Laufzeit autorisierte RPCs `ff_reports_context` und `ff_year_report`.
- Datengrenze: `src/data/supabase-reports.ts` prüft Antworten und Bereich/Jahr.
- Verträge, Darstellung und CSV: `src/domain/dev-reports.ts`.
- Oberfläche: `src/components/supabase-reports.tsx`, im Profil nur persönlich,
  unter Statistik zusätzlich berechtigte Einheits-/Funktions-/Organisationsberichte.

Der Browser erhält fertige Jahreskennzahlen und höchstens 50 historische Dienste
je Seite, nicht sämtliche Roh-Anwesenheiten. Die bisherige unbeschränkte
Initialabfrage der eigenen Anwesenheitshistorie entfällt. Ein CSV-Export lädt
seinen vollständigen berechtigten Jahres-/Typ-/Bereichsbericht erneut vom Server.
Mehr als 5.000 Dienste werden ausdrücklich abgewiesen, niemals still abgeschnitten.

## Verbindliche Berechnungsregeln

Ein Dienst zählt nur, wenn er begonnen, nicht abgesagt und seine Liste
`COMPLETED` oder `CORRECTED` **mit** Abschlussbestätigung ist. Zusagen, Absagen,
Vielleicht und Vorbelegungen ohne Listenabschluss sind keine Ist-Teilnahmen.
Nachträgliche, bereits begründet protokollierte Anwesenheitskorrekturen werden
beim nächsten Laden unmittelbar berücksichtigt; es gibt keinen zweiten Statistikbestand.

Das Berichtsjahr richtet sich nach dem Dienstbeginn in `Europe/Berlin`.
Intervalle sind halboffen: `valid_from <= Beginn < valid_until`, bei offenem
Ende unbegrenzt. Der historische Teilnehmer-Snapshot bewahrt die damalige
Einheit. Ein späterer Einheitswechsel verschiebt keine früheren Dienste.
Sonderfunktionen müssen ebenfalls zum Dienstbeginn gültig sein.

| Kennzahl | Berechnung |
|---|---|
| Relevante abgeschlossene Dienste | Eindeutige abgeschlossene Ausbildungsdienste im berechtigten Bereich |
| Besuchte / nicht besuchte Ausbildung | Bestätigt anwesend / abwesend, niemals unbekannt als abwesend |
| Ausbildungsquote | Bestätigte Ausbildungs-Teilnahmen / relevante Personen-Dienste × 100 |
| Persönliche Ausbildungsstunden | Geplante verstrichene Dauer der besuchten Ausbildungsdienste |
| Ausbildungsstunden der Einheit/Organisation | Summe eindeutiger angebotener Ausbildungs-Dienstdauern |
| Ausbildungs-Teilnehmerstunden | Summe Dauer × tatsächlich anwesende Ausbildungsteilnehmer |
| Dokumentierte Dienst-/Teilnehmerstunden | Tatsächlich anwesende Personen × Dauer aller Dienstarten |
| Übungsdienste | Eindeutige abgeschlossene reguläre Dienste und Sonderübungen |
| Durchschnittlich Anwesende | Bestätigte Anwesenheiten aller Arten / eindeutige abgeschlossene Dienste |
| Mitglieder im Berichtsjahr | Eindeutige Personen mit einer Mitgliedschaft im Jahr, einschließlich historischer Wechsel |

Dauer bedeutet verstrichene Zeit zwischen geplantem Beginn und Ende, auch über
Sommer-/Winterzeitwechsel, nicht individuelle An-/Abmeldung. Ein Dienst über
Silvester gehört vollständig zum Berliner Beginnjahr; Stunden werden nicht aufgeteilt.
Organisationswerte deduplizieren Personen und gemeinsame Dienste. Einheits-
Mitgliederzahlen können sich bei einem Wechsel überschneiden. Organisationsquoten
sind nach Personen-Diensten gewichtet, kein Durchschnitt der Einheitsquoten.

Standardmäßig ausbildungsrelevant: `regular`, `special`, `breathing`, `training`.
`community` und `other` sind zunächst keine Ausbildung. Die neue Tabelle
`event_type_reporting` hält diese sechs zentralen Einstellungen. Nur GLOBAL_ADMIN
kann sie mit `ff_set_reporting_type` ändern: Pflichtgrund, ausdrückliche Bestätigung
der Wirkung auf **alle** Berichtsjahre und Audit `reporting_classification_changed`.
Termintypen und Anwesenheiten werden dabei nicht verändert.

## Datenqualität und ehrliche Leerzustände

Nicht abgeschlossene Listen werden getrennt als ausgeschlossen/offen ausgewiesen.
Fehlende Teilnehmereinträge historisch berechtigter Mitglieder und fehlende
Ist-Werte bleiben unbekannt. Ungültige/überlappende historische Zuordnungen oder
Widersprüche zum Snapshot werden ohne Doppelzählung ausgeschlossen und angezeigt.
Keine verlässliche Quote bei ungeklärter Ausbildung oder ungültigen finalen Daten;
kein Durchschnitt bei unbekannten/ungültigen finalen Einträgen.
Jahre ohne verlässlichen Nenner zeigen „Nicht berechenbar“, nicht erfundene 0 %.

Bestehende NOT-NULL-, Zeitintervall- und Primärschlüssel-Constraints verhindern
fehlende/negative Dauer, ungültige Mitgliedschaftszeiträume und doppelte
Anwesenheiten. Die SQL-Tests prüfen diese tatsächlichen Constraints zusätzlich.
Eine unvollständige Terminartkonfiguration führt zu einem Fehler, nicht zu
scheinbar erfolgreichen Nullstatistiken.

## Serverseitige Berechtigungen

| Rolle | Berichtszugriff |
|---|---|
| MEMBER | Ausschließlich eigene Historie; kein frei wählbarer fremder Benutzer |
| UNIT_ADMIN | Eigene Daten und ausdrücklich zugewiesene Einheiten, einschließlich deren Historie |
| FUNCTION_ADMIN | Eigene Daten und ausschließlich zugewiesene Sonderfunktionen |
| FIRE_CHIEF | Organisationsweiter und gefilterter Einheits-/Funktionsbericht, lesend |
| GLOBAL_ADMIN | Alle Berichte und protokollierte Ausbildungs-Konfiguration |

Die Rollen bleiben unverändert. FIRE_CHIEF erhält **keine** technische
Administration, Mitglieds-/Rollenverwaltung oder Anwesenheitsschreibrechte.
Bestehende Mehrfachrollen wirken weiterhin kumulativ; ein Konto mit zusätzlicher
Adminrolle besitzt deren Rechte nicht wegen FIRE_CHIEF, sondern wegen dieser Rolle.
Der Schutz des letzten aktiven GLOBAL_ADMIN bleibt im bestehenden Rollenmodell.

Jeder RPC prüft aktuelle Freigabe und Bereich selbst, unabhängig von UI-Auswahl
oder JWT-Rollenbehauptungen. Private Hilfsfunktionen sind weder für `anon` noch
`authenticated` aufrufbar. Die neue Konfigurationstabelle hat RLS und nur aktives
SELECT; direkte Schreibrechte bleiben entzogen. Bestehende Attendance-/Profil-RLS
wird nicht erweitert. Die bestehende `security_invoker`-View
`confirmed_attendance` behält ihre Spalten, verwendet jetzt aber dieselbe
Ausbildungsrelevanz und strikte Finalitätsbedingung.

Persönliche Antworten enthalten keine fremde Mitgliederliste. Organisationsberichte
enthalten Einheitsaggregate, keine unnötigen persönlichen Mitgliederlisten.
Einheits-/Funktionsberichte enthalten nur berechtigte Personen. Export und
Neuladen prüfen erneut; fehlgeschlagene Berechtigungsprüfungen löschen zuvor
angezeigte Berichtsdaten, statt Nullzahlen oder erfolgreiche Downloads vorzutäuschen.

## CSV und Oberfläche

CSV: UTF-8-BOM, Semikolon, korrekt zitierte Zellen, deutsche Dezimalzahlen,
Berichtsjahr/-bereich und Berliner Datum/Uhrzeit. Formelpräfixe einschließlich
führender Leer-/Steuerzeichen werden gegen Excel-Formelausführung geschützt.
Nur berechtigte Serverantworten werden exportiert. Es gibt Kennzahlen-, Dienste-,
Mitglieder- und Einheitenexporte entsprechend dem jeweiligen Bereich.

Sechs persönliche KPIs, Jahr-/Typ-/historischer Einheitsfilter, lesbare
Dienstdetails; Mitgliedersuche und Sortierung; Einheitsvergleich mit Balken nur
bei verlässlicher Quote. Sidebar, mobile Bottom-Navigation, Light/Dark,
Safe Areas und bestehende Komponenten bleiben erhalten. Hintergrundprüfungen
erhalten Filter, Suche und geöffnete Details. Kein automatischer Reload.

## Prüfungen und kontrollierte Migration

`supabase/tests/reports.sql` läuft ausschließlich transaktional/mit Rollback in
der isolierten CI-Datenbank `ff_dev_ci`, **nicht** auf der gehosteten DEV-Datenbank.
Es prüft echte Rollen/RLS/RPCs, Finalität, Korrekturen, Zeiträume, Berechnungen,
fehlende Daten, Konfiguration/Audit sowie 250 synthetische Mitglieder über fünf
Einheiten und 65 Dienste. Migration 013 läuft nach 001–012. Das bestehende
persistente Konkurrenztest-Fixture muss weiterhin zuletzt ausgeführt werden.

Der erfolgreiche PostgreSQL-Lauf
[42295196626](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42295196626)
prüfte den Zwischenstand `8eaa980`; eine Jahresaggregation mit 250 Mitgliedern
dauerte dort **287,937 ms**, einschließlich 32.500 Teilnehmerstunden,
50+15 Seitenaufteilung und vollständigem Export. Das ist eine gemessene
CI-Ausführung, keine garantierte Hosting-Latenz.

Unit-Tests prüfen Verträge, Nenner/Leerzustände, CSV und scoped Repository-Aufrufe.
`tests/supabase-reports.spec.ts` verwendet ausdrücklich **abgefangene synthetische
Protokollantworten**, keine echten Konten: persönliche Details/Leerjahr,
scoped vollständiger CSV-Export, Wehrleiter ohne Adminrechte, erhaltene
Arbeitsansicht bei virtuellen Zeitfortschritten, Fehler-/Widerrufsverhalten,
mobile/Desktop-Ansicht und Axe in beiden Farbschemata.
Diese Browserfälle beweisen weder echte Mail-/Login-Abläufe noch reale RLS.

Vor gehosteter Anwendung: endgültige SQL-Quelle in CI prüfen, Projekt-URL exakt
gegen `https://orxinqhhbtjpkzwlfaxq.supabase.co` vergleichen, vorhandene Migrationen
kontrollieren und nur diese additive Migration anwenden. Keine Konten, Rollen
oder vorhandenen Anwesenheiten zur Abnahme verändern. Danach Funktionsdefinitionen,
RLS/Grants, sechs Konfigurationswerte und Berichtsergebnisse lesend prüfen.
Eine PR-Erstellung oder ein Feature-Branch-Workflow veröffentlicht keine Pages-Version.

## Vorbereitete echte DEV-Abnahme

Die Abnahme von DEV 0.3.4.1 durch den Projekteigentümer ist in dem getrennten
Dokumentations-PR [#13](https://github.com/n00b31/feuerwehr-odenthal-app/pull/13)
festgehalten. Sie ist **keine** Abnahme der neuen DEV-0.4-Oberfläche.

**Test A – Mitglied:** mit einem bestehenden freigegebenen DEV-Mitglied selbst
anmelden, Profil/Statistik → Mein Dienstbuch, Jahr wählen. Gegen eine vorhandene
abgeschlossene Liste Anzahl besuchter Dienste, geplante Ausbildungsstunden,
Quote und lesbare Historie vergleichen. Jahr ohne Daten prüfen; keine fremden
Mitglieder oder administrativen Aktionen. Keine Passwörter/Tokens aufzeichnen.

**Test B – Einheit:** als bestehender GLOBAL_ADMIN oder zugewiesener UNIT_ADMIN
anmelden, Statistik → Jahresstatistik der Einheit → Scheuren/Jahr wählen.
Mit vorhandenen bestätigten Listen vergleichen, Mitgliedersuche/Sortierung
und vollständigen CSV-Export prüfen. Als UNIT_ADMIN fremde Einheit ablehnen.
Keine Test-Anwesenheit eigens in bestehenden Diensten ändern.

**Test C – Wehrleitung:** es wurde noch keinem Konto FIRE_CHIEF zugewiesen.
Zuerst ein bestimmtes fiktives DEV-Testkonto ausdrücklich freigeben lassen.
Ein berechtigter Administrator weist erst dann FIRE_CHIEF zu. Für den Nachweis
reiner Leserechte darf das Testkonto keine zusätzliche technische Adminrolle
besitzen. Dashboard, alle fünf Einheiten, Jahreswechsel und CSV prüfen; keine
Mitglieder-/Rollenverwaltung, keine Termin-/Anwesenheits-Schreibrechte.
Nach Abnahme die zusätzliche Testzuweisung begründet wieder entfernen.

**Offen:** reale Browserabnahme A/B der Feature-Version sowie Test C mit
ausdrücklicher Kontofreigabe; native installierte iPhone-/Android-PWA-Abnahme
weiterhin separat. Kein automatischer Merge oder eigenständiger Pages-Release.
CSV ist kein PDF-Bericht, Einsatz-/Geräte-/Tätigkeitserfassung und individuelle
Zeiterfassung sind nicht implementiert.
