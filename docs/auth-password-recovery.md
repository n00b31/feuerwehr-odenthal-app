# Auth-Hotfix: Passwortbestätigung und Wiederherstellung

## Sicherheits- und Implementierungsplan

Entscheidung des Projektverantwortlichen: vorhandenen integrierten DEV-Mailversand
behalten; die nicht durchgängig garantierbare Versandgrenze ausdrücklich
dokumentieren. Keine neuen Mailanbieter, keine temporären Passwörter und keine
Änderungen an der unabhängigen Demo.

1. Registrierung und neues Passwort verlangen zwei exakt gleiche Eingaben.
   Die bisherige App-Regel bleibt 12 bis 128 Zeichen, ohne vorgeschriebene
   Zeichenklassen. Passwörter bleiben ausschließlich im flüchtigen Formular.
2. Eine Supabase Edge Function übernimmt die App-Reset-Anfragen. Sie prüft
   bereits verifizierte Feuerwehr-Adressen, verschickt selbst keine Tokens an
   den Browser und benutzt weiter Supabase Auths integrierten Mailversand.
3. Self-Service und administrative Anfragen teilen eine atomare Datenbankgrenze:
   eine reservierte Anfrage pro normalisierter Adresse in 60 Minuten, höchstens
   drei in rollierenden 24 Stunden. Auch fehlgeschlagene oder unklare
   Versandversuche verbrauchen die Reservierung; kein automatischer Retry.
   Die Zeitfenster laufen ab Abschluss des Versandversuchs, nicht bereits vor
   dessen Netzwerklaufzeit. Unaufgelöste Reservierungen blockieren weitere
   Versuche bis zur vertrauenswürdigen Ergebnisaufnahme. Das ist konservativer
   als eine Zählung tatsächlich zugestellter Mails; Zustellung ist kein API-Nachweis.
4. Administrative Anfragen verlangen einen serverseitig verifizierten Auth-Benutzer
   und die aktuelle, exakte GLOBAL_ADMIN-Rolle in PostgreSQL. Nur die bereits
   verifizierte Adresse des ausgewählten bestehenden Kontos ist zulässig.
   Beginn und Versandresultat werden ohne Passwort oder Reset-Token protokolliert.
5. Der integrierte Versand verwendet seine Standard-Mailvorlage. Die Edge Function
   erzeugt pro Anfrage einen kryptographisch zufälligen PKCE-Verifier und hält
   ihn ausschließlich in einer gesperrten privaten Tabelle, maximal 60 Minuten
   für den Austausch zugänglich. Auth bekommt nur dessen S256-Challenge.
   Der Mail-Link führt nach Auth-Verifikation mit einmaligem Code und
   Anfrage-ID zur statischen Recovery-Seite. Die Edge Function beansprucht
   den Verifier atomar und tauscht ihn gegen genau die erwartete Benutzer-
   Sitzung. Die Edge Function gibt keinen Verifier oder Service-Key zurück
   und empfängt keine Passwörter.
   So funktionieren Self-Service und administrative Links auch in einem
   anderen Empfängerbrowser, ohne neue SMTP-Vorlage. Erst erfolgreicher
   PKCE-Austausch und erneute
   serverseitige Identitätsprüfung öffnen das Passwortformular. Bestehende
   browsergebundene PKCE-Callbacks bleiben unterstützt; ihr `sb_flow_id` wird vor dem Entfernen
   der URL-Parameter gesichert. Keine Next.js-Serverroute auf GitHub Pages.
6. Recovery lädt keine Feuerwehrdaten und ändert weder Freigabe noch Rollen oder
   Mitgliedschaften. Nach dem Setzen des eigenen Passworts wird lokal abgemeldet.
7. Synthetische SDK-/Browser-, SQL-, Parallelitäts- und Static-Export-Prüfungen
   getrennt von einem echten, ausdrücklich autorisierten Mail-/Gerätetest.

## Tatsächliche Konfiguration vor dem Hotfix

Am 08.11.2026 im Dashboard von DEV `orxinqhhbtjpkzwlfaxq` gelesen:

| Einstellung | Vorhandener Wert |
|---|---|
| E-Mail-Bestätigung | aktiv |
| Anonyme Anmeldung / manuelle Identitätsverknüpfung | inaktiv |
| Auth-Server: Mindestlänge | 6 Zeichen |
| App: Mindest-/Höchstlänge | 12 / 128 Zeichen |
| Vorgeschriebene Zeichenklassen | keine |
| Sichere E-Mail-Änderung | aktiv |
| Sichere Passwortänderung / aktuelles Passwort erforderlich | inaktiv |
| Leak-Prüfung | inaktiv; Pro-Funktion |
| E-Mail-OTP-Gültigkeit / Code-Länge | 3600 Sekunden / 8 Ziffern |
| Integrierter Versand | 2 Mails/Stunde **für das gesamte Projekt** |
| Custom SMTP / Send Email Hook | beide inaktiv |
| Mailvorlagen | integrierte Standardvorlagen; keine Custom-SMTP-Vorlage aktiviert |
| Minimales Benutzerintervall | 60 Sekunden; Dashboard: nur Custom SMTP |
| Signup/Signin, Token-Verifikation | jeweils 30 Anfragen/5 Minuten je IP |
| Token-Refresh | 150 Anfragen/5 Minuten je IP |
| Redirect-Allowlist | bestehende GitHub-Pages-Callback-URL |

## Nicht geschlossene Grenze: direkte Auth-API

**Die Forderung „1 versandte Mail/Stunde und 3/24 Stunden“ ist nicht für das
gesamte Supabase-Projekt garantiert.** Ein direkter Aufruf von
`/auth/v1/recover` benutzt nicht die zusätzliche App-Edge-Function und nicht
deren atomare Reservierung. Auch ein Browser-Cooldown, CORS oder ein
projektweites Mailkontingent würde diese Lücke nicht schließen.

Die zusätzliche App-Grenze ist nur für den App-Versandpfad gültig, einschließlich
GLOBAL_ADMIN und paralleler Anfragen. Auths eigene Projekt-/IP-Grenzen bleiben
aktiv. Integrierte SMTP-Einschränkungen können sogar eine zulässige App-Anfrage
ablehnen: nur vorautorisierte Team-Adressen, zwei Projektmails/Stunde,
kein Zustellungs-SLA. Eine öffentliche bedingte Antwort bestätigt deshalb
weder Kontobestand noch Versand oder Zustellung.

Für vollständige Durchsetzung: ein **Send Email Hook am Auth-Versandübergang**
mit atomarer gemeinsamer Reservierung und geeignetem eigenen Mailanbieter.
Der Hook muss auch direkte Recovery-Aufrufe und administrative Versände
erfassen, alle anderen Auth-Mailtypen erhalten und Tokens ausschließlich
kurzzeitig im geschützten Versandkontext behandeln. Der Hook ersetzt den
integrierten SMTP-Versand; bloß Custom SMTP oder ein vorgeschalteter
App-Endpunkt genügt nicht. Anbieter/Secrets/Hook-Aktivierung sind nicht
Teil dieser ausdrücklich gewählten integrierten DEV-Variante.

Supabase Auth kann beim Verifizieren eines direkt angeforderten Recovery-Tokens
auch eine bisher unbestätigte E-Mail bestätigen. Das ist ein Nachweis des
Mailbesitzes, aber kein Nachweis einer vorherigen separaten Signup-Bestätigung.
Der App-Versandpfad erlaubt nur schon bestätigte Adressen. Direkte Auth-Aufrufe
lassen sich mit dieser Variante nicht auf diese Einschränkung begrenzen.
**Administratorfreigabe und RLS bleiben in beiden Fällen unverändert zwingend.**

## Quellen

- [Auth-Rate-Limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Integrierter SMTP-Versand](https://supabase.com/docs/guides/auth/auth-smtp)
- [Send Email Hook ersetzt SMTP](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- [Passwort-Recovery und Token-Hash](https://supabase.com/docs/guides/auth/passwords)
- [Auth: Recovery-Verifikation](https://github.com/supabase/auth/blob/master/internal/api/verify.go)

## Architektur, Einstellungen und Aktivierung

- GitHub Pages bleibt statisch; kein Next.js-Server und kein geheimen Schlüssel
  enthaltender Build. `password-recovery` läuft ausschließlich im bestehenden
  Supabase DEV. Seine serverseitigen Projekt-/Anon-/Service-Credentials stammen
  aus den verwalteten Edge-Runtime-Variablen; keine neuen Client-Secrets.
- `verify_jwt=false` ist nur für den ausdrücklich öffentlichen Self-Service und
  den einmaligen PKCE-Austausch nötig. Der Admin-Zweig prüft `auth.getUser` über
  die Auth-API und die exakte aktuelle GLOBAL_ADMIN-Rolle in der geschützten RPC.
  CORS ist kein Berechtigungsnachweis.
- Zusätzlich höchstens 30 **globale** öffentliche Endpoint-Anfragen in
  rollierenden fünf Minuten, atomar auch für den Austausch. Das ist absichtlich
  konservativer als eine IP-Grenze; keine unzuverlässigen Client-IP-Header werden
  vertraut oder gespeichert. Admin: höchstens fünf reservierte Anfragen pro
  verifiziertem Auslöser/fünf Minuten. Auths eigene IP-/Projektgrenzen bleiben
  aktiv; die Auth-Aufrufe der Edge Function teilen deren Egress-IP.
- Additive Migration 025 ergänzt Reservierungen, private kurzlebige
  PKCE-Verifier, den globalen Intake und eng berechtigte RPCs. Keine Änderung
  an bestehenden Auth-Konten, Passwörtern, Rollen oder Fachdatentabellen.
- Verifier werden beim Austausch **vor** dem Auth-Aufruf atomar entfernt.
  Ein verbrauchter, falscher oder abgelaufener Code benötigt einen neuen Link;
  keine automatische Wiederholung. Bei eindeutig abgelehntem Versand wird
  der Verifier entfernt. Abgelaufene unbenutzte Zeilen werden bei der nächsten
  Verifier-Anlage bereinigt; die API erlaubt ihren Zugriff nie nach 60 Minuten.
  Keine dauerhafte Speicherung von Passwort oder Mail-Token im Browser/Audit.
- Keine Auth-Mailvorlagen, SMTP-Anbieter, Leak-Prüfung, Domain-Hooks,
  E-Mail-Bestätigung, sichere E-Mail-Änderung oder bestehende Passwortregeln
  abschalten/ändern. Die App bleibt mit 12 Zeichen strenger als der bestehende
  DEV-Server mit 6 Zeichen. Bereits vorhandene Passwörter bleiben unverändert.

Erforderliche Redirect-Allowlist, ausschließlich im bestehenden DEV:

```text
https://n00b31.github.io/feuerwehr-odenthal-app/auth/callback/
https://n00b31.github.io/feuerwehr-odenthal-app/auth/recovery/
https://n00b31.github.io/feuerwehr-odenthal-app/auth/recovery/?**
```

Die erste URL erhalten. Die beiden Recovery-Einträge erlauben genau die
statische Recovery-Seite einschließlich der serverseitig erzeugten Anfrage-ID.
Kein Wildcard-Host, keine externe `next`-URL und keine Demo-Redirects.
Vor dem Benutzermerge ist die neue Pages-Route noch nicht veröffentlicht.
Erst nach erfolgreichem Main-Deployment und geprüftem `release.json` manuell
Mail-Links anfordern. Edge-/Schema-Installation ist kein Frontend-Deployment.

## Manuelle Abnahme mit ausdrücklich autorisiertem Testkonto

Diese Schritte sind vorbereitet, **keine Behauptung eines echten Mailtests**:

1. DEV 0.6.1 und den Merge-Commit in `release.json` nach Benutzermerge prüfen;
   alte PWA kontrolliert aktualisieren, keinen laufenden Entwurf verwerfen.
2. Für neue Registrierung zuerst unterschiedliche, dann identische gültige
   Passwörter testen. Nur die ausdrücklich erlaubte Testadresse verwenden.
3. „Passwort vergessen?“ für ein bestehendes, bereits verifiziertes,
   für integrierten SMTP erlaubtes Testkonto einmal anfordern. Maximal zwei
   Projektmails/Stunde beachten; keine Serien-/automatischen Mailtests.
4. Den Standard-Mail-Link in einem frischen privaten Empfängerbrowser öffnen.
   URL-Parameter müssen nach dem Austausch entfernt sein. Neues Passwort zweimal
   eingeben, zunächst absichtlich ungleich. Keine Feuerwehrdaten vor Abschluss.
5. Speichern, Bestätigung und lokale Abmeldung prüfen; anschließend mit dem neuen
   Passwort anmelden. Pending bleibt pending, freigegeben bleibt freigegeben.
   Altes Passwort darf nicht mehr funktionieren. Das ist eine echte, bewusste
   Passwortänderung und benötigt die ausdrückliche Freigabe des Kontoinhabers.
6. GLOBAL_ADMIN kann denselben Ablauf für genau dieses autorisierte Konto
   initiieren. MEMBER, UNIT_ADMIN, FUNCTION_ADMIN und FIRE_CHIEF haben dafür
   weder UI noch gültige RPC-Berechtigung. Audit-Auslöser, Ziel, Zeit und
   Versandresultat prüfen; keine Passwörter oder Reset-Tokens.
7. Verbrauchten/abgelaufenen Link, Abbruch, eigenes Browser-Refresh,
   PWA-Hintergrundprüfung und native iPhone-/Android-PWA zusätzlich prüfen.
   SDK-/Browser-Fixtures ersetzen diese echten Gerätetests nicht.

Die zusätzlichen App-Grenzen werden in synthetischen SQL-/Parallelitätstests
geprüft, nicht durch unnötige echte DEV-Mails. Die direkte Auth-API wird
ausdrücklich **nicht** als durch diese Grenze abgesichert abgenommen.

## Testzuordnung

| Anforderung | Nachweis / Grenze |
|---|---|
| 1–3 Registrierung und geltende App-Passwortregeln | Unit-Schema + reale statische Formularbedienung mit synthetischen APIs |
| 4 Callback/BasePath/PKCE | statische Recovery-Route, SDK-Callback und serverseitige S256-Protocol-Fixture |
| 5 zweimal neues Passwort | Schema + SDK-Browserablauf |
| 6 Freigabe bleibt erforderlich | SQL-Pending/keine Rollen und Browser-Pending nach erneutem Login |
| 7 keine öffentliche Kontoauskunft | gleiche HTTP-Status-/Antworttexte für bekannt/unbekannt/unverifiziert/limitiert/SMTP-Fehler |
| 8–10 60 Minuten, drei/24h, Parallelität | additive SQL-Tests und echte zwei PostgreSQL-Verbindungen; nur App-Pfad |
| 11 direkte Auth-API | offene, vom Projektverantwortlichen akzeptierte Einschränkung oben |
| 12–13 Admin-Grenzen | echte SQL-Rollen für alle fünf Rollen + serverseitige Auth-/RPC-Fixtures |
| 14 keine Secrets im Frontend/Audit | Backend-Isolation, explizite Auditfelder, Browser-Speicher- und Exportprüfung |
| 15 Regressionen | bestehende Auth-/Fachregel-, DEV-/Demo- und RLS-Suiten |
| 16 Static Export | bestehender Pages-Build mit eigener Recovery-HTML-Datei |
