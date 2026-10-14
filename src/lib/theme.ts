import type { THEMES } from "@/lib/api/profile";

export type Theme = (typeof THEMES)[number];

/** Where the browser remembers the last theme, so it applies before the page paints. */
export const THEME_STORAGE_KEY = "botlog-theme";

/**
 * Runs in <head> before the first paint: switches <html> from the default (Lime, dark) to the
 * theme this browser last used. The profile stays the source of truth; ThemeSync corrects
 * this after sign-in if it changed on another device.
 */
export const THEME_SCRIPT = `try{if(localStorage.getItem("${THEME_STORAGE_KEY}")==="sandpaper"){var d=document.documentElement;d.dataset.theme="sandpaper";d.classList.remove("dark")}}catch(e){}`;
