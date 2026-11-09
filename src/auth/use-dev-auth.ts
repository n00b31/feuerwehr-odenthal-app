"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicPath } from "@/config/app";
import { authErrorMessage } from "./validation";
import { exchangeAuthCallback, readAuthCallback } from "./callback";
import { readAccess, readDevData, type Access, type DevData } from "@/data/supabase-repository";

type Screen =
  | { phase: "loading" | "signed-out" }
  | { phase: "error"; error: string }
  | { phase: "blocked"; access: Access }
  | { phase: "recovery"; userId: string }
  | { phase: "active"; access: Access; data: DevData | null };

let callbackExchange: Promise<string | null> | undefined;
export function resetAuthCallback() { callbackExchange = undefined; }
function completeCallback(client: SupabaseClient) {
  if (callbackExchange) return callbackExchange;
  const url = new URL(window.location.href);
  const callback = readAuthCallback(url);
  if (callback.kind === "none"
    && ![publicPath("/auth/callback"), publicPath("/auth/recovery")].includes(url.pathname.replace(/\/$/, ""))) return Promise.resolve(null);
  // Remove one-time credentials before requesting data or allowing outbound links.
  window.history.replaceState(null, "", url.pathname);
  if (callback.kind === "none") return Promise.resolve(null);
  callbackExchange = exchangeAuthCallback(client, callback);
  return callbackExchange;
}

export function useDevAuth(client: SupabaseClient | null, needsWorkspace = true) {
  const [screen, setScreen] = useState<Screen>({ phase: "loading" });
  const [revision, setRevision] = useState(0);
  const epoch = useRef(0);
  const identity = useRef<string | null>(null);
  const recovery = useRef<string | null>(null);
  const phase = useRef(screen.phase);
  useEffect(() => { phase.current = screen.phase; }, [screen.phase]);
  const refresh = useCallback(() => {
    epoch.current++;
    // Revalidation must not unmount the authorized, same-user workspace.
    setScreen((current) => current.phase === "active" || current.phase === "blocked" || current.phase === "signed-out" || current.phase === "recovery"
      ? current : { phase: "loading" });
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!client) return;
    // Keep callbacks synchronous: awaiting Auth methods here can deadlock the SDK.
    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) recovery.current = session.user.id;
      if (event === "SIGNED_OUT" || (session && identity.current !== null && session.user.id !== identity.current)) {
        epoch.current++;
        identity.current = null;
        if (event === "SIGNED_OUT") recovery.current = null;
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
        const callbackUser = await completeCallback(connection);
        if (!isCurrent()) return;
        if (callbackUser) recovery.current = callbackUser;
        const { data, error } = await connection.auth.getSession();
        if (error) throw error;
        if (!data.session) {
          if (isCurrent()) { identity.current = null; recovery.current = null; setScreen({ phase: "signed-out" }); }
          return;
        }
        const verified = await connection.auth.getUser();
        if (verified.error) throw verified.error;
        if (recovery.current) {
          if (verified.data.user.id !== recovery.current || !verified.data.user.email_confirmed_at
            || !verified.data.user.email || !/^[^@\s]+@feuerwehr-odenthal\.de$/i.test(verified.data.user.email)) {
            throw Object.assign(new Error("Recovery identity mismatch"), { code: "recovery_invalid" });
          }
          if (isCurrent()) {
            identity.current = verified.data.user.id;
            setScreen({ phase: "recovery", userId: verified.data.user.id });
          }
          return;
        }
        const access = await readAccess(connection);
        if (!isCurrent()) return;
        if (access.user_id !== verified.data.user.id) throw new Error("Identität stimmt nicht überein.");
        identity.current = access.user_id;
        if (!access.access_granted) {
          setScreen({ phase: "blocked", access });
          return;
        }
        const protectedData = needsWorkspace ? await readDevData(connection, access) : null;
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
  }, [client, revision, needsWorkspace]);

  return { screen, refresh, clear: () => { epoch.current++; identity.current = null; recovery.current = null; setScreen({ phase: "loading" }); } };
}
