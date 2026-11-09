# DEV 0.7 – Organisatorische Benachrichtigungen

**Keine Alarmierung:** Diese Funktion ersetzt weder aPager noch die offizielle
Feuerwehralarmierung. Zustellung ist browser-, geräte- und netzabhängig.
Die unabhängige Demo wird nicht verändert.

## Analyse und Implementierungsplan

Der bestehende Service Worker `public/sw.js` wird erweitert, nicht ersetzt.
Seine Offline-Fallbacks, unterpfadbezogenen Caches und explizit bestätigten
PWA-Updates bleiben erhalten. GitHub Pages bleibt ein Static Export;
privilegierte Versandoperationen laufen ausschließlich serverseitig.

Es existiert bereits `public.vehicle_notifications`, mit eigenem Postfach,
RLS und Gelesen-Markierung im Fahrzeugmodul. Diese Tabelle wird **additiv
zum zentralen Empfängermodell erweitert**, nicht durch eine zweite Inbox
ersetzt. Alte Datensätze, IDs, Lesestatus und Fahrzeug-RPCs bleiben erhalten.
Das Fahrzeugmodul zeigt weiterhin seine bestehende gefilterte Ansicht.

Implementierungsreihenfolge:

1. Additives zentrales Modell, eigene Einstellungen und geschützte Geräte.
2. Transaktionale fachliche Outbox; Erstellung/Änderung/Absage und bestehende
   Fahrzeugbenachrichtigungen anbinden. Dynamische Mitgliedschaften und
   bestehende Berechtigungshelfer wiederverwenden.
3. Begrenzter, wiederholbarer Erinnerungsjob und geleaste Versandaufträge.
4. Geschützte Supabase Edge Function mit VAPID, begrenzten Wiederholungen,
   serverseitiger Empfängerprüfung und abgeschirmten Fehlerprotokollen.
5. Freiwillige Profil-Einrichtung, zentrale Inbox und sichere Direktnavigation.
6. Bestehenden Worker um Push/Click/Deduplizierung erweitern, ohne ein
   bereits geöffnetes Formular durch erzwungene Navigation zu verwerfen.
7. Isolierte PostgreSQL-, Transport-, Browser- und bestehende Regressionstests.
8. Erst danach kontrollierte DEV-Installation, Secret-Provisionierung,
   Edge-Deployment, Zustandsprüfung und PR ohne automatischen Merge.

## Sicherheitsentscheidungen

- Berechtigungsdialog ausschließlich durch direkten Klick, nie beim Laden.
  Feature Detection für Service Worker, Notification und PushManager.
  Fehlende Unterstützung sperrt die Inbox nicht.
- iPhone: Web Push setzt eine geeignete installierte Home-Screen-Web-App
  voraus. Eine Installationsanleitung wird angeboten; Browsernamen sind
  keine Berechtigungsprüfung.
- Öffentliche VAPID-Schlüssel dürfen zum Client. Private Schlüssel und
  Cron-Autorisierung ausschließlich in Supabase-Secrets beziehungsweise
  Vault; keine privaten Schlüssel in Migrationen oder statischem Export.
- Browser dürfen nur eigene Abonnements registrieren/deaktivieren.
  Endpoints und Subscription-Schlüssel erscheinen weder in Geräteübersichten
  noch in administrativen Versandprotokollen.
- Nur bekannte HTTPS-Push-Provider werden als Versandziele akzeptiert;
  keine frei wählbaren URLs, Weiterleitungen oder internen Netzwerkziele.
- Push-Payloads sind generisch: keine Namen, Termine, Einheiten, Zwecke,
  Ablehnungsgründe oder andere fachliche Inhalte auf dem Sperrbildschirm.
  Details werden erst nach Anmeldung und erneuter RLS-/RPC-Prüfung geladen.
- Fachliches Ereignis, Empfänger-Inbox und Versandkanal sind getrennt.
  E-Mail kann später als Kanal ergänzt werden, wird jetzt nicht versandt.
- Versandbestätigung bedeutet Annahme durch den Push-Dienst, nicht
  nachgewiesenen Empfang, Anzeige oder Kenntnisnahme auf einem Gerät.
- Absolut genau-einmalige HTTP-Zustellung ist bei Verbindungsabbrüchen
  nicht beweisbar. Stabile Auftrags-IDs/Topics, atomare Leases, begrenzte
  Wiederholungen und Worker-Deduplizierung verhindern doppelte Anzeigen.
  Diese Grenze wird nicht als Exactly-once-Garantie verkauft.
- Keine rückwirkenden Massenmitteilungen: fachliche Outbox ab Installation,
  zeitgesteuerte Erinnerungen erst ab Aktivierungszeitpunkt. Keine Test-Pushs
  ohne ausdrückliche Aktion des angemeldeten Empfängers.

## Reale Geräteabnahme

Noch nicht durchgeführt. Automatisierte oder emulierte Tests sind keine
reale iPhone-/Android-/Desktop-Abnahme. Die vom Auftrag beschriebenen
Aktivierungs-, Zustellungs-, Navigations-, Deaktivierungs- und Regressionstests
werden mit autorisierten vorhandenen DEV-Konten vorbereitet; tatsächliche
Ergebnisse sind separat zu dokumentieren.

Referenzen:
[Supabase Cron](https://supabase.com/docs/guides/functions/schedule-functions),
[Web Push auf iOS](https://webkit.org/blog/13966/web-push-for-web-apps-on-ios-and-ipados/),
[Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API).
