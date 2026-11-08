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
