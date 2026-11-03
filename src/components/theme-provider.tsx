"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { isThemePreference, THEME_STORAGE_KEY, type ThemePreference } from "@/config/theme";

interface ThemeSnapshot {
  preference: ThemePreference;
  systemDark: boolean;
  ready: boolean;
  error: string;
}
const initial: ThemeSnapshot = { preference: "system", systemDark: false, ready: false, error: "" };
let snapshot = initial;
const listeners = new Set<() => void>();
function notify() { listeners.forEach((listener) => listener()); }
function loadPreference(allowQuery: boolean) {
  let preference: ThemePreference = "system";
  let error = "";
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(saved)) preference = saved;
    else if (saved !== null) error = "Die gespeicherte Darstellung ist ungültig. Bitte wähle sie erneut.";
  } catch {
    error = "Die Darstellung konnte nicht aus dem Browser-Speicher gelesen werden.";
  }
  const query = allowQuery ? new URLSearchParams(location.search).get("scoutTheme") : null;
  if (query === "light" || query === "dark") preference = query;
  snapshot = { preference, error, ready: true, systemDark: matchMedia("(prefers-color-scheme: dark)").matches };
  notify();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  loadPreference(true);
  const media = matchMedia("(prefers-color-scheme: dark)");
  function onSystemChange() {
    snapshot = { ...snapshot, systemDark: media.matches };
    notify();
  }
  function onStorage(event: StorageEvent) {
    if (event.key === THEME_STORAGE_KEY || event.key === null) loadPreference(false);
  }
  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}
const getSnapshot = () => snapshot;
const getServerSnapshot = () => initial;
function setPreference(preference: ThemePreference) {
  let error = "";
  try { localStorage.setItem(THEME_STORAGE_KEY, preference); }
  catch { error = "Die Darstellung wurde nur für diese Sitzung geändert. Speichern im Browser ist nicht möglich."; }
  snapshot = { ...snapshot, ready: true, preference, error };
  notify();
}
const ThemeContext = createContext<{
  preference: ThemePreference;
  resolved: "light" | "dark";
  setPreference: typeof setPreference;
  error: string;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const selected = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const resolved = selected.preference === "system" ? selected.systemDark ? "dark" : "light" : selected.preference;
  useEffect(() => {
    if (!selected.ready) return;
    document.documentElement.dataset.theme = resolved;
    const color = getComputedStyle(document.documentElement).getPropertyValue("--cp-bg").trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
  }, [resolved, selected.ready]);
  return <ThemeContext.Provider value={{ preference: selected.preference, resolved, setPreference, error: selected.error }}>{children}</ThemeContext.Provider>;
}
export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("Darstellungskontext fehlt.");
  return value;
}
