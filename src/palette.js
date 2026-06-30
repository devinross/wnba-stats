// ---------------------------------------------------------------------------
// Theme palette (light + dark).
//
// Colors are kept in JS rather than only CSS variables because Recharts passes
// colors to SVG presentation attributes (stroke="...", fill="..."), where
// CSS var() does NOT resolve. `C` is a single live object that every component
// imports and reads as C.ORANGE, C.PANEL, etc. On a theme switch we mutate `C`
// in place and bump React state, so the next render reads the new colors —
// including the charts. The page chrome (body background) is themed in CSS via
// a data-theme attribute so there's no flash before React mounts.
// ---------------------------------------------------------------------------

const DARK = {
  INK: "#0A0E16",
  BLUE: "#1F4E9C",
  BLUE_HI: "#4F8FD6",
  ORANGE: "#FB7A2B",
  MUTE: "#8B96AD",
  PANEL: "#121826",
  PANEL_2: "#1A2233",
  LINE: "#283344",
  TXT: "#E7ECF4",
  GOOD: "#5BD6A0",
  BAD: "#FF6B6B",
  ON_ORANGE: "#10131C", // dark text/icons placed on an orange fill (both themes)
  LOSS_FG: "#FF8088", // softer red for "loss" text and error messages
  WIN_BG: "#173A2E",
  LOSS_BG: "#3A1C24",
  HOVER_FILL: "rgba(255,255,255,.04)", // chart hover overlay
  BG_IMAGE:
    "radial-gradient(1200px 600px at 80% -10%, rgba(31,78,156,.40), transparent 60%), radial-gradient(800px 500px at -10% 110%, rgba(251,122,43,.08), transparent 55%)",
};

const LIGHT = {
  INK: "#F7F9FC",
  BLUE: "#1F4E9C",
  BLUE_HI: "#3F7AC2",
  ORANGE: "#D2590E", // deeper orange so it reads on white (and dark text still sits on it)
  MUTE: "#5F6B80",
  PANEL: "#FFFFFF",
  PANEL_2: "#EEF2F8",
  LINE: "#DDE4EF",
  TXT: "#141A26",
  GOOD: "#1F9D6B",
  BAD: "#D64545",
  ON_ORANGE: "#FFFFFF",
  LOSS_FG: "#C53434",
  WIN_BG: "#DCF3E8",
  LOSS_BG: "#FBE3E3",
  HOVER_FILL: "rgba(0,0,0,.05)",
  BG_IMAGE:
    "radial-gradient(1200px 600px at 80% -10%, rgba(31,78,156,.07), transparent 60%), radial-gradient(800px 500px at -10% 110%, rgba(210,89,14,.06), transparent 55%)",
};

export const PALETTES = { dark: DARK, light: LIGHT };

// The live palette object every component reads from.
export const C = { ...DARK };

let current = "dark";
export const currentTheme = () => current;

export function getInitialTheme() {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch (_) {}
  try {
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: light)").matches) {
      return "light";
    }
  } catch (_) {}
  return "dark";
}

export function applyTheme(theme) {
  current = theme === "light" ? "light" : "dark";
  Object.assign(C, PALETTES[current]); // mutate in place so existing imports see new values
  try {
    document.documentElement.setAttribute("data-theme", current);
  } catch (_) {}
  try {
    localStorage.setItem("theme", current);
  } catch (_) {}
  return current;
}

// Initialize at module load (before React renders).
applyTheme(getInitialTheme());
