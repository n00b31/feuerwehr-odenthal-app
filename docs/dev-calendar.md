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
