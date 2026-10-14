import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

const CHANGE_EVENT = "botlog:theme";

/** Shows `theme` now and remembers it in this browser for the next page load. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "lime") delete root.dataset.theme;
  else root.dataset.theme = theme;
  // Lime is dark, so components' dark: styles apply only there.
  root.classList.toggle("dark", theme === "lime");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode or blocked storage: the theme still applies, it just isn't remembered here.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

const currentTheme = (): Theme => (document.documentElement.dataset.theme === "sandpaper" ? "sandpaper" : "lime");

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/** The theme on screen right now. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => "lime");
}
