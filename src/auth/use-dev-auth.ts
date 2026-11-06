"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicPath } from "@/config/app";
import { authErrorMessage } from "./validation";
import { readAccess, readDevData, type Access, type DevData } from "@/data/supabase-repository";

type Screen =
  | { phase: "loading" | "signed-out" }
  | { phase: "error"; error: string }
  | { phase: "blocked"; access: Access }
  | { phase: "active"; access: Access; data: DevData };

let callbackExchange: Promise<void> | undefined;
export function resetAuthCallback() { callbackExchange = undefined; }
function completeCallback(client: SupabaseClient) {
  if (callbackExchange) return callbackExchange;
  const url = new URL(window.location.href);
  if (url.pathname.replace(/\/$/, "") !== publicPath("/auth/callback")) return Promise.resolve();
  const code = url.searchParams.get("code");
  const failed = url.searchParams.has("error") || url.hash.includes("error=");
  // Remove one-time credentials before requesting data or allowing outbound links.
  window.history.replaceState(null, "", publicPath("/auth/callback/"));
  if (!code && !failed) return Promise.resolve();
  callbackExchange = (async () => {
    if (failed || !code) throw Object.assign(new Error("Bestätigung fehlgeschlagen."), { code: "flow_state_not_found" });
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw error;
  })();
  return callbackExchange;
}

export function useDevAuth(client: SupabaseClient | null) {
  const [screen, setScreen] = useState<Screen>({ phase: "loading" });
  const [revision, setRevision] = useState(0);
  const epoch = useRef(0);
  const identity = useRef<string | null>(null);
  const phase = useRef(screen.phase);
  useEffect(() => { phase.current = screen.phase; }, [screen.phase]);
  const refresh = useCallback(() => {
    epoch.current++;
    // Revalidation must not unmount the authorized, same-user workspace.
    setScreen((current) => current.phase === "active" || current.phase === "blocked" || current.phase === "signed-out"
      ? current : { phase: "loading" });
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!client) return;
    // Keep callbacks synchronous: awaiting Auth methods here can deadlock the SDK.
    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (session && identity.current !== null && session.user.id !== identity.current)) {
        epoch.current++;
        identity.current = null;
        setScreen({ phase: event === "SIGNED_OUT" ? "signed-out" : "loading" });
      }
      refresh();
    });
    const recheck = () => { if (phase.current !== "signed-out") refresh(); };
    window.addEventListener("focus", recheck);
    window.addEventListener("online", recheck);
    window.addEventListener("offline", recheck);
    const visible = () => { if (!document.hidden) recheck(); };
    document.addEventListener("visibilitychange", visible);
    const interval = window.setInterval(() => { if (!document.hidden) recheck(); }, 60_000);
    return () => {
      subscription.subscription.unsubscribe();
      window.removeEventListener("focus", recheck);
      window.removeEventListener("online", recheck);
      window.removeEventListener("offline", recheck);
      document.removeEventListener("visibilitychange", visible);
      window.clearInterval(interval);
    };
  }, [client, refresh]);

  useEffect(() => {
    if (!client) return;
    const connection = client;
    let current = true;
    const version = epoch.current;
    const isCurrent = () => current && version === epoch.current;
    async function load() {
      try {
        await completeCallback(connection);
        const { data, error } = await connection.auth.getSession();
        if (error) throw error;
        if (!data.session) {
          if (isCurrent()) { identity.current = null; setScreen({ phase: "signed-out" }); }
          return;
        }
        const verified = await connection.auth.getUser();
        if (verified.error) throw verified.error;
        const access = await readAccess(connection);
        if (!isCurrent()) return;
        if (access.user_id !== verified.data.user.id) throw new Error("Identität stimmt nicht überein.");
        identity.current = access.user_id;
        if (!access.access_granted) {
          setScreen({ phase: "blocked", access });
          return;
        }
        const protectedData = await readDevData(connection, access);
        // Recheck after the reads; a concurrent suspension must not leave the UI unlocked.
        const latest = await readAccess(connection);
        if (latest.user_id !== verified.data.user.id) throw new Error("Identität wurde während der Prüfung geändert.");
        if (isCurrent()) setScreen(latest.access_granted
          ? { phase: "active", access: latest, data: protectedData }
          : { phase: "blocked", access: latest });
      } catch (error) {
        if (isCurrent()) setScreen({ phase: "error", error: authErrorMessage(error) });
      }
    }
    void load();
    return () => { current = false; };
  }, [client, revision]);

  return { screen, refresh, clear: () => { epoch.current++; identity.current = null; setScreen({ phase: "loading" }); } };
}
