"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { publicPath } from "@/config/app";
import { getAppMode } from "@/config/mode";
import { currentRelease, readAvailableRelease, releaseUrl, type Release } from "@/config/release";

function subscribe(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => { window.removeEventListener("online", notify); window.removeEventListener("offline", notify); };
}
export function PwaStatus() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const [error, setError] = useState("");
  const [versionError, setVersionError] = useState("");
  const [available, setAvailable] = useState<Release | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  useEffect(() => {
    let active = true;
    let checking = false;
    const abort = new AbortController();
    const cleanups: (() => void)[] = [];
    async function check() {
      if (!currentRelease || checking || document.hidden || !navigator.onLine) return;
      checking = true;
      const request = new AbortController();
      const stop = () => request.abort();
      abort.signal.addEventListener("abort", stop);
      const timeout = window.setTimeout(stop, 10_000);
      try {
        const url = new URL(publicPath("/release.json"), location.origin);
        url.searchParams.set("check", Date.now().toString());
        const response = await fetch(url, { cache: "no-store", credentials: "omit", signal: request.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const next = readAvailableRelease(await response.json(), currentRelease);
        if (active) { setAvailable(next); setVersionError(""); }
      } catch (cause) {
        if (active) setVersionError(`Versionsprüfung fehlgeschlagen: ${cause instanceof Error ? cause.message : "Unbekannter Fehler"}. Deine Ansicht wird nicht neu geladen.`);
      } finally { checking = false; window.clearTimeout(timeout); abort.signal.removeEventListener("abort", stop); }
    }
    if ("serviceWorker" in navigator && window.isSecureContext) {
      const script = new URL(publicPath("/sw.js"), location.origin);
      if (currentRelease) script.searchParams.set("release", currentRelease.buildId);
      void navigator.serviceWorker.register(script.href, { scope: publicPath("/"), updateViaCache: "none" }).then((value) => {
        if (!active) return;
        registration.current = value;
        const update = () => { if (active) setWaiting(!!value.waiting); };
        const found = () => {
          const worker = value.installing;
          if (worker) {
            worker.addEventListener("statechange", update);
            cleanups.push(() => worker.removeEventListener("statechange", update));
          }
          update();
        };
        value.addEventListener("updatefound", found);
        cleanups.push(() => value.removeEventListener("updatefound", found));
        found();
      }).catch((cause: unknown) => {
        if (active) setError(`PWA-Vorbereitung fehlgeschlagen: ${cause instanceof Error ? cause.message : "Service Worker nicht verfügbar."}`);
      });
    }
    const visible = () => { if (!document.hidden) void check(); };
    const checkNow = () => { void check(); };
    const timer = window.setInterval(checkNow, 300_000);
    window.addEventListener("focus", checkNow);
    window.addEventListener("online", checkNow);
    document.addEventListener("visibilitychange", visible);
    void check();
    return () => {
      active = false; abort.abort(); window.clearInterval(timer);
      window.removeEventListener("focus", checkNow);
      window.removeEventListener("online", checkNow);
      document.removeEventListener("visibilitychange", visible);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);
  async function update() {
    if (updating) return;
    if (!window.confirm("Jetzt auf die neue Version wechseln? Ungespeicherte Eingaben gehen dabei verloren. Wähle Abbrechen und speichere zuerst deine Entwürfe.")) return;
    setUpdating(true);
    try {
      const worker = registration.current?.waiting;
      if (worker) await new Promise<void>((resolve, reject) => {
        const target = worker;
        let settled = false;
        function finish(error?: Error) {
          if (settled) return;
          settled = true; window.clearTimeout(timeout);
          target.removeEventListener("statechange", changed);
          if (error) reject(error); else resolve();
        }
        function changed() {
          if (target.state === "activated") finish();
          else if (target.state === "redundant") finish(new Error("Service Worker wurde während der Aktualisierung ersetzt. Bitte erneut versuchen."));
        }
        const timeout = window.setTimeout(() => finish(new Error("Service-Worker-Aktivierung hat das Zeitlimit überschritten.")), 10_000);
        target.addEventListener("statechange", changed);
        try { target.postMessage({ type: "ACTIVATE_UPDATE" }); }
        catch (cause) { finish(cause instanceof Error ? cause : new Error("Service Worker konnte nicht aktiviert werden.")); }
        changed();
      });
      window.location.assign(releaseUrl(window.location.href, available?.buildId ?? currentRelease?.buildId ?? Date.now().toString()));
    } catch (cause) {
      setError(`Aktualisierung fehlgeschlagen: ${cause instanceof Error ? cause.message : "Unbekannter Fehler"}. Deine Ansicht bleibt geöffnet.`);
    } finally { setUpdating(false); }
  }
  return <>
    <div className="release-status" aria-label="Anwendungsversion"><small>{currentRelease
      ? `${currentRelease.mode === "demo" ? "Demo" : currentRelease.version} · Commit ${currentRelease.gitSha.slice(0, 12)} · Build ${currentRelease.buildId}${currentRelease.sourceDirty ? " · uncommittierter Arbeitsstand" : ""}`
      : "Lokaler Entwicklungsbuild ohne Pages-Release-Nachweis"}</small></div>
    {(available || waiting) && <div className="notice release-update" role="status">
      <p><strong>Neue Version verfügbar</strong>{available && ` · ${available.version} · Commit ${available.gitSha.slice(0, 12)}`}<br />
        Deine aktuelle Ansicht bleibt geöffnet. Speichere zuerst deine Eingaben; erst nach deiner Bestätigung wird neu geladen.</p>
      <button className="button secondary" disabled={updating} onClick={() => void update()}>{updating ? "Aktualisierung vorbereiten …" : "Jetzt aktualisieren"}</button>
    </div>}
    {error && <div className="notice error" role="alert">{error}</div>}
    {versionError && <div className="notice error" role="alert">{versionError}</div>}
    {!online && <div className="notice" role="status">{getAppMode() === "demo"
      ? "Du bist offline. Bereits geladene Ansichten können lokal weiterarbeiten. Neue Seitenaufrufe benötigen einen erreichbaren App-Server; keine vollständige Offline-App."
      : "Du bist offline. DEV gewährt keine Offline-Freigabe; geschützte Inhalte benötigen eine erreichbare Supabase-Verbindung."}</div>}
  </>;
}
