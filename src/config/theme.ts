import { APP } from "./app";

export type ThemePreference = "system" | "light" | "dark";
export const THEME_STORAGE_KEY = `${APP.storageKey}-theme`;
export const isThemePreference = (value: string | null): value is ThemePreference =>
  value === "system" || value === "light" || value === "dark";

export const themePreferenceScript = `(() => {
  try {
    const saved = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    const param = new URLSearchParams(location.search).get("scoutTheme");
    const preference = param === "light" || param === "dark" ? param : saved;
    const theme = preference === "light" || preference === "dark"
      ? preference : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
  } catch (error) {
    console.warn("Darstellungseinstellung konnte nicht gelesen werden.", error);
  }
})();`;
