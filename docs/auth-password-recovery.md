# Auth-Hotfix: Passwortbestätigung und Wiederherstellung

## SMTP-Nachprüfung vom 11.11.2026

Der Verantwortliche hat Custom SMTP im DEV aktiviert. Die folgenden historischen
Abschnitte dokumentieren weiterhin den ursprünglichen integrierten Versand.
Custom SMTP hebt die zusätzlichen atomaren App-Grenzen nicht auf; die
dokumentierte Lücke bei direkten Auth-API-Aufrufen bleibt ebenfalls bestehen.

Auf ausdrücklichen Wunsch werden diese App-Grenzen mit der additiven Migration
`20261111004100_password_recovery_limits.sql` auf **3 Anfragen pro Adresse in
rollierenden 60 Minuten und 5 in rollierenden 24 Stunden** erhöht, gemeinsam für
Self-Service und GLOBAL_ADMIN. Alle Ergebnisse zählen; Zeitfenster laufen weiter
ab Abschluss eines Versuchs. Eine noch offene Reservierung blockiert weiterhin
parallele Anfragen derselben Adresse. Atomarer Advisory-Lock, Adminschutz
(höchstens 5 administrative Anfragen in 5 Minuten), Freigaberegeln und
Funktionsberechtigungen bleiben unverändert. Bestehende Historie wird weder
gelöscht noch zurückgesetzt. Die Migration 025 bleibt unverändert. Dies ändert
keine projektweiten Supabase-, SMTP- oder anderen Auth-Mail-Limits.

Die Änderung ist im ausschließlich geprüften DEV-Projekt
`orxinqhhbtjpkzwlfaxq` installiert: Supabase-Historie
`20261111151507 / dev_041_password_recovery_limits`. Funktionskörper und
vollständige gespeicherte Migration stimmen per LF-normalisierten Hashes mit
der versionierten Datei überein. SECURITY DEFINER, leerer Search-Path und ACL
blieben unverändert; die private Funktion bleibt für anon, authenticated und
service_role nicht direkt ausführbar. Alle vier vorhandenen Recovery-
Protokolle sind nach Anzahl und Inhalts-Hash unverändert. Kein Testkonto,
Passwort, reservierter Versand oder echter Mailversand wurde dafür erzeugt.
[PostgreSQL-/Upgrade-/RLS-/Zwei-Verbindungs-CI 43045657797](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/43045657797)
war vor der Installation erfolgreich, einschließlich tatsächlicher Ablehnung
der vierten Stunden- und sechsten Tagesanfrage nach Abschluss des jeweils
letzten zulässigen parallelen Versuchs.

Die tatsächlich bereitgestellte `password-recovery`-Edge-Function (Version 2)
brach auch den Auth-Mailaufruf nach acht Sekunden ab. Zwei autorisierte
Testanfragen endeten im App-Protokoll nach ungefähr 8,3 Sekunden als `unknown`.
Auth protokollierte ungefähr 10,2 beziehungsweise 10,3 Sekunden und HTTP 200.
Eine zusätzliche read-only Prüfung ergab für beide Testkonten keinen
gespeicherten `auth.users.recovery_sent_at`. Der Verantwortliche bestätigte
keinen Maileingang. **Damit sind weder abgeschlossener Recovery-Versand noch
SMTP-Zustellung bewiesen; HTTP 200 im Auth-Log genügt nicht.** Ein Abbruch der
HTTP-Verbindung kann einen laufenden Auth-Vorgang beeinflussen; die genaue
Auswirkung auf diese SMTP-Versuche ist ohne weitere Versanddiagnose unbewiesen.
Die App darf deshalb nicht als Ursache ausgeschlossen werden.

Ein synthetischer Test des echten Handlers reproduziert eine um 10,3 Sekunden
verzögerte Auth-Antwort einschließlich des tatsächlich übergebenen AbortSignals:
vor der Korrektur Abbruch nach acht Sekunden und `unknown`, statt die Antwort
abzuwarten. Es werden keine echten Supabase-/SMTP-Aufrufe oder Mails verwendet.

Die Korrektur begrenzt ausschließlich den Mailaufruf nun auf **30 Sekunden**.
RPC-, Identitäts- und PKCE-Austausch-Timeouts bleiben bei acht Sekunden.
Kein automatischer Retry, keine Lockerung von Versandlimits, Freigabe, Rollen,
PKCE oder Redirects. Ein nicht rechtzeitig bestätigter Versand bleibt `unknown`;
der Verifier bleibt für einen eventuell doch zugestellten Link erhalten.
Interne feste Diagnosecodes unterscheiden `auth_mail_timeout`,
`auth_mail_transport_failed` und die bisherige HTTP-Ablehnung
`auth_mail_rejected`, ohne Mailadresse, Token, Endpoint-Parameter oder
Upstream-Fehlermeldungen auszugeben. Die öffentliche Self-Service-Antwort bleibt
absichtlich konto-neutral; die veraltete pauschale Zwei-Mails/Stunde-Angabe wird
durch den Hinweis auf App-, Auth- und Anbietergrenzen ersetzt.

Die automatischen Regressionen prüfen die verzögerte Annahme mit realer
Wartezeit, den tatsächlichen Signalabbruch mit beschleunigtem Test-Deadline-Timer,
Timeout-/Transportfehler für Self-Service und Administration sowie unveränderte
konto-neutrale Antworten ohne automatische Wiederholungen. Browserprüfungen
verwenden ausschließlich abgefangene synthetische Auth-Endpunkte und bestätigen
keinen realen SMTP-Versand.

**Rollout/Abnahme:** Eine Quellcodekorrektur allein ändert die gehostete
Edge-Function nicht. Vor einem erneuten autorisierten Einzelversuch muss die
geprüfte Backend-Korrektur separat im DEV bereitgestellt sein; das Pages-
Deployment aktualisiert nur den Frontend-Hinweis. Der Timeoutfix braucht keine
Datenbankmigration; für die gesondert beauftragte Änderung auf 3/5 ist Migration
041 erforderlich. Kein manuelles Zurücksetzen von Reservierungen. Erst nach Ablauf
der jeweiligen Reservierungsgrenze genau eine Testmail anfordern, App-Ergebnis,
Auth-Verlauf und SMTP-Annahme/Queue-ID korrelieren und den Postfacheingang vom
Empfänger bestätigen lassen. Die längere Wartezeit behebt den bewiesenen
vorzeitigen Abbruch, **beweist aber nicht**, dass damit das gesamte
Zustellproblem behoben ist. Kein weiterer echter Versand und keine
Passwortänderung durch die hier beschriebenen synthetischen Prüfungen.

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
   ursprünglich eine reservierte Anfrage pro normalisierter Adresse in
   60 Minuten und drei in rollierenden 24 Stunden; Migration 041 erhöht dies
   auf drei in 60 Minuten und fünf in rollierenden 24 Stunden. Auch fehlgeschlagene oder unklare
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

**Die App-Grenzen (mit Migration 041: 3 Anfragen/Stunde und 5/24 Stunden)
sind nicht für das gesamte Supabase-Projekt garantiert.** Ein direkter Aufruf von
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
- Ein manuelles Browser-Reload während der Passwortbearbeitung verwirft die
  flüchtige Recovery-Freigabe und die Eingaben. Eine gespeicherte normale
  Auth-Sitzung allein öffnet das Passwortformular nicht erneut; dafür ist ein
  neuer zulässiger Mail-Link erforderlich. Automatische Hintergrundprüfungen
  und ein bloß angebotener PWA-Versionswechsel lassen das Formular erhalten.
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
| 8–10 drei/60 Minuten, fünf/24h, Parallelität (Migration 041) | SQL-Tests einschließlich vierter/sechster Ablehnung und echte zwei PostgreSQL-Verbindungen am letzten freien Slot; nur App-Pfad |
| 11 direkte Auth-API | offene, vom Projektverantwortlichen akzeptierte Einschränkung oben |
| 12–13 Admin-Grenzen | echte SQL-Rollen für alle fünf Rollen + serverseitige Auth-/RPC-Fixtures |
| 14 keine Secrets im Frontend/Audit | Backend-Isolation, explizite Auditfelder, Browser-Speicher- und Exportprüfung |
| 15 Regressionen | bestehende Auth-/Fachregel-, DEV-/Demo- und RLS-Suiten |
| 16 Static Export | bestehender Pages-Build mit eigener Recovery-HTML-Datei |

## Installations- und Prüfnachweis vom 08.11.2026

Der implementierte Auth-Hotfix ist DEV **0.6.1**, auf eigenständigem Branch
`fix/auth-password-recovery`. Kein automatischer Merge und keine Veröffentlichung
der unabhängigen Demo. Der Funktionsstand wurde als Commit
`323fea3ab39cb354ed528b62b954beff2fd511fd` geprüft; spätere reine
Dokumentationscommits ändern diesen Nachweis nicht.

| Prüfung | Tatsächliches Ergebnis |
|---|---|
| Unit-/Fachregel-/Release-/Worker-Tests | 136 bestanden |
| DEV-Browserregression mit echten SDK-Methoden und abgefangenen synthetischen APIs | 53 bestanden, einschließlich Standard-Mail-PKCE, neuem Passwort und erneuter Pending-Anmeldung |
| Lokale Demo-Browserregression, ohne Demo-Repository zu ändern | 19 bestanden |
| Unkonfigurierter statischer DEV-Build | bleibt gesperrt; 1 Browsertest bestanden |
| TypeScript, ESLint, Deno-Edge-Typecheck | erfolgreich |
| PostgreSQL 17 mit allen Migrationen und RLS-Regressionen | erfolgreich |
| Echte parallele PostgreSQL-Verbindungen | Stundenlimit, rollierendes Tageslimit und einmaliger PKCE-Verifier erfolgreich geprüft |
| Reales DEV-Pages-Exportartefakt | saubere DEV-Konfiguration, statische Recovery-Route; 68 Textdateien ohne Secret-Key, privilegierten JWT, Fixture-Passwort oder synthetische Konfiguration |
| Mail-/Kontoveränderungen | **0 Testmails; keine Konten oder Passwörter geändert** |

- [Datenbank-/Parallelitäts-CI 42494289558](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42494289558)
  war vor Installation erfolgreich.
- [Pages-/SDK-/Demo-/Real-DEV-Export-CI 42494624905](https://github.com/n00b31/feuerwehr-odenthal-app/actions/runs/42494624905)
  war erfolgreich; der Deploy-Job auf diesem Feature-Branch wurde ausdrücklich
  nicht ausgeführt. Das saubere Artefakt enthält obigen vollständigen Commit,
  `sourceDirty: false`, `/feuerwehr-odenthal-app` und DEV 0.6.1.
- Migration `ff_025_password_recovery` ist im bestehenden Supabase DEV als
  Version `20261108152733` installiert. Nach automatischem Abbruch der
  Connector-Bestätigung hat der Projektverantwortliche ausdrücklich die
  Installation im sichtbaren SQL-Editor autorisiert. Die gepinnte, geprüfte
  GitHub-Quelldatei wurde vor Ausführung per SHA-256 verifiziert und mit ihrem
  Migrationseintrag atomar installiert.
  Kanonische LF-Quell-Prüfsumme:
  `275e37ec83743dcd8f8597a2af8f34b6096a9b6d70c1dcbdbeded050524a5c43`.
  Die sieben tatsächlich installierten Funktionskörper stimmen mit den
  lokalen Quell-Prüfsummen überein; RLS, leerer `search_path` und enge
  EXECUTE-/Tabellenrechte wurden im DEV-Katalog nachgewiesen.
- Edge Function `password-recovery` ist **ACTIVE, Version 1**.
  Bundle-Prüfsumme:
  `90fac679d80638280609c12e086f640b7c2b33a0b38b0fd429629855f98b612d`.
  Die verwalteten Runtime-Credentials wurden nicht ausgelesen. Reale HTTP-Proben
  bestätigen Readiness, Pages-CORS, abgewiesene Fremd-Origin, ungültige Domain,
  fehlende Adminidentität, fehlenden PKCE-Nachweis und die bedingte Antwort für
  eine zuvor als nicht vorhanden geprüfte Adresse. Dabei wurde kein
  Auth-Mailversand aufgerufen; alle Antworten waren `no-store`.
- Die beiden Recovery-Redirects sind im DEV-Dashboard gespeichert.
  Integriertes SMTP, Auth-Mailvorlagen und Passwort-/Verifizierungsregeln
  bleiben unverändert. Keine zusätzlichen Einstellungen erforderlich.
- Vor-/Nachvergleich bestätigt unveränderte neun Auth-Konten, Profile,
  Rollen, Einheitsmitgliedschaften und Termine sowie unverändert 107
  Auditeinträge. Recovery-Reservierungen und private Verifier bleiben leer.
  Die tatsächlich vorhandenen nichtglobalen MEMBER-/UNIT_ADMIN-Zuordnungen
  wurden zusätzlich in einer zurückgerollten DEV-Transaktion abgewiesen;
  FUNCTION_ADMIN und FIRE_CHIEF wurden mit isolierten SQL-Fixtures geprüft.

**Noch offen:** der bewusst manuelle Benutzermerge, anschließend der Nachweis des
veröffentlichten Main-Commits sowie ein ausdrücklich autorisierter echter
Mail-/Passwortwechseltest und native iPhone-/Android-PWA-Abnahme. Ein grüner
synthetischer Test ist keine Bestätigung von Mailzustellung oder echter
Geräteabnahme. Die dokumentierte direkte Auth-API-Lücke bleibt bestehen.
