"use client";

import { useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authErrorMessage, emailSchema, passwordPairSchema } from "@/auth/validation";
import { recoveryRequestMessage, requestPasswordRecovery } from "@/auth/recovery-client";
import { PageHeading } from "./ui";

export function PasswordFields({ password, confirmation, onPassword, onConfirmation, disabled }: {
  password: string; confirmation: string; onPassword: (value: string) => void;
  onConfirmation: (value: string) => void; disabled: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return <>
    <p className="muted text-sm" id="password-requirements">12 bis 128 Zeichen. Keine vorgeschriebenen Zeichenklassen. Ein langes, einmaliges Passwort verwenden.</p>
    <label>Passwort<input type={visible ? "text" : "password"} autoComplete="new-password" value={password}
      onChange={(e) => onPassword(e.target.value)} required minLength={12} maxLength={128} disabled={disabled} aria-describedby="password-requirements" /></label>
    <label>Passwort wiederholen<input type={visible ? "text" : "password"} autoComplete="new-password" value={confirmation}
      onChange={(e) => onConfirmation(e.target.value)} required maxLength={128} disabled={disabled} aria-describedby="password-requirements" /></label>
    <button type="button" className="button secondary" aria-pressed={visible} disabled={disabled}
      onClick={() => setVisible(!visible)}>{visible ? "Passwörter verbergen" : "Passwörter anzeigen"}</button>
  </>;
}

export function ForgotPasswordForm({ client, onBack }: { client: SupabaseClient; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (working.current) return;
    setMessage(""); setError("");
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    working.current = true; setBusy(true);
    try {
      await requestPasswordRecovery(client, { mode: "self", email: parsed.data.toLowerCase() });
      setMessage(recoveryRequestMessage);
    } catch (cause) { setError(authErrorMessage(cause)); }
    finally { working.current = false; setBusy(false); }
  }
  return <section className="card section-card auth-card">
    <PageHeading eyebrow="SUPABASE DEV" title="Passwort vergessen" description="Die Wiederherstellung ändert keine Administratorfreigabe und keine Rollen." />
    <form className="form-grid" onSubmit={(event) => void submit(event)}>
      <label>Feuerwehr-E-Mail<input type="email" autoComplete="email" required disabled={busy} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <button className="button" disabled={busy}>{busy ? "Anfrage läuft …" : "Wiederherstellung anfordern"}</button>
    </form>
    {message && <p className="notice" role="status">{message}</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    <button className="button secondary" disabled={busy} onClick={onBack}>Zur Anmeldung</button>
    <p className="muted text-sm">Kein automatischer Versand-Retry. Die zusätzlichen App-Grenzen gelten nicht für direkte Aufrufe der Supabase-Auth-API.</p>
  </section>;
}

export function RecoveryPasswordForm({ client, userId, onExit, onBusy }: {
  client: SupabaseClient; userId: string; onExit: (saved: boolean) => Promise<void>; onBusy: (busy: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (working.current) return;
    setError("");
    const parsed = passwordPairSchema.safeParse({ password, passwordConfirmation: confirmation });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    working.current = true; setBusy(true); onBusy(true);
    try {
      const verified = await client.auth.getUser();
      if (verified.error) throw verified.error;
      if (verified.data.user.id !== userId || !verified.data.user.email_confirmed_at) {
        throw Object.assign(new Error("Recovery identity changed"), { code: "recovery_invalid" });
      }
      const { data, error } = await client.auth.updateUser({ password: parsed.data.password });
      if (error) throw error;
      if (data.user.id !== userId) throw Object.assign(new Error("Unexpected recovery identity"), { code: "recovery_invalid" });
      setPassword(""); setConfirmation("");
      await onExit(true);
    } catch (cause) { setError(authErrorMessage(cause)); }
    finally { setPassword(""); setConfirmation(""); working.current = false; setBusy(false); onBusy(false); }
  }
  return <section className="card section-card auth-card">
    <PageHeading eyebrow="VERIFIZIERTE WIEDERHERSTELLUNG" title="Neues Passwort setzen" description="Nur für das über den einmaligen Mail-Link verifizierte eigene Konto. Keine Freigabe oder Rollenänderung." />
    <form className="form-grid" onSubmit={(event) => void submit(event)}>
      <PasswordFields password={password} confirmation={confirmation} onPassword={setPassword} onConfirmation={setConfirmation} disabled={busy} />
      <button className="button" disabled={busy}>{busy ? "Passwort wird geändert …" : "Neues Passwort speichern"}</button>
    </form>
    {error && <p className="notice error" role="alert">{error}</p>}
    <button className="button secondary" disabled={busy} onClick={() => { setPassword(""); setConfirmation(""); void onExit(false); }}>Abbrechen und Sitzung entfernen</button>
  </section>;
}
