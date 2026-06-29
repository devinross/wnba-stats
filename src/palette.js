// ---------------------------------------------------------------------------
// Theme palette (light + dark).
//
// Colors are kept in JS rather than only CSS variables because Recharts passes
// colors to SVG presentation attributes (stroke="...", fill="..."), where
// CSS var() does NOT resolve. `C` is a single live object that every component
// imports and reads as C.GOLD, C.PANEL, etc. On a theme switch we mutate `C`
// in place and bump React state, so the next render reads the new colors —
// including the charts. The page chrome (body background) is themed in CSS via
// a data-theme attribute so there's no flash before React mounts.
// ---------------------------------------------------------------------------

const DARK = {
  INK: "#0E0A14",
  PURPLE: "#552583",
  PURPLE_HI: "#7B4FB5",
  GOLD: "#FDB927",
  MUTE: "#9B8FB5",
  PANEL: "#171121",
  PANEL_2: "#1F1730",
  LINE: "#2C2240",
  TXT: "#EDE7F6",
  GOOD: "#5BD6A0",
  BAD: "#FF6B6B",
  ON_GOLD: "#14101D", // dark text/icons placed on a gold fill (both themes)
  LOSS_FG: "#FF8088", // softer red for "loss" text and error messages
  WIN_BG: "#1C3A2E",
  LOSS_BG: "#3A1C24",
  HOVER_FILL: "rgba(255,255,255,.04)", // chart hover overlay
  BG_IMAGE:
    "radial-gradient(1200px 600px at 80% -10%, rgba(85,37,131,.45), transparent 60%), radial-gradient(800px 500px at -10% 110%, rgba(253,185,39,.08), transparent 55%)",
};

const LIGHT = {
  INK: "#FAF9FE",
  PURPLE: "#552583",
  PURPLE_HI: "#6E46A6",
  GOLD: "#C98A00", // deeper gold so it reads on white (and dark text still sits on it)
  MUTE: "#6E6685",
  PANEL: "#FFFFFF",
  PANEL_2: "#F3F0FA",
  LINE: "#E5E0F0",
  TXT: "#1A1426",
  GOOD: "#1F9D6B",
  BAD: "#D64545",
  ON_GOLD: "#14101D",
  LOSS_FG: "#C53434",
  WIN_BG: "#DCF3E8",
  LOSS_BG: "#FBE3E3",
  HOVER_FILL: "rgba(0,0,0,.05)",
  BG_IMAGE:
    "radial-gradient(1200px 600px at 80% -10%, rgba(85,37,131,.07), transparent 60%), radial-gradient(800px 500px at -10% 110%, rgba(201,138,0,.06), transparent 55%)",
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
