"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { publicPath } from "@/config/app";

function subscribe(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => { window.removeEventListener("online", notify); window.removeEventListener("offline", notify); };
}
export function PwaStatus() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const [error, setError] = useState("");
  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register(publicPath("/sw.js"), { scope: publicPath("/") }).catch((error: unknown) => setError(`PWA-Vorbereitung fehlgeschlagen: ${error instanceof Error ? error.message : "Service Worker nicht verfügbar."}`));
    }
  }, []);
  if (error) return <div className="notice" role="alert">{error}</div>;
  return !online ? <div className="notice" role="status">Du bist offline. Bereits geladene Ansichten können lokal weiterarbeiten. Neue Seitenaufrufe benötigen einen erreichbaren App-Server; keine vollständige Offline-App.</div> : null;
}
