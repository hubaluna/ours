import { useEffect, useState } from "react";
import type { DarkPalette, LightPalette, Theme } from "../lib/types";

export interface PaletteOption<T extends string> {
  id: T;
  label: string;
  swatch: string;
  themeColor: string;
}

export const LIGHT_PALETTES: readonly PaletteOption<LightPalette>[] = [
  {
    id: "sage",
    label: "Зелена",
    swatch: "linear-gradient(135deg, #dceee2 0%, #385e43 100%)",
    themeColor: "#F4F3EE",
  },
  {
    id: "beige",
    label: "Бежева",
    swatch: "linear-gradient(135deg, #f3e4cf 0%, #825b3a 100%)",
    themeColor: "#F6F1E9",
  },
  {
    id: "rose",
    label: "Рожева",
    swatch: "linear-gradient(135deg, #f9d8e5 0%, #9b4865 100%)",
    themeColor: "#F9F2F4",
  },
  {
    id: "lavender",
    label: "Фіолетова",
    swatch: "linear-gradient(135deg, #e6daf7 0%, #634a94 100%)",
    themeColor: "#F5F2FA",
  },
  {
    id: "sky",
    label: "Блакитна",
    swatch: "linear-gradient(135deg, #d2e6f8 0%, #335f87 100%)",
    themeColor: "#F1F5F9",
  },
];

export const DARK_PALETTES: readonly PaletteOption<DarkPalette>[] = [
  {
    id: "forest",
    label: "Зелена",
    swatch: "linear-gradient(135deg, #1b2f24 0%, #b0d4b7 100%)",
    themeColor: "#111713",
  },
  {
    id: "obsidian",
    label: "Чорна",
    swatch: "linear-gradient(135deg, #0b0c0e 0%, #dde1e7 100%)",
    themeColor: "#0A0B0D",
  },
  {
    id: "midnight",
    label: "Синя",
    swatch: "linear-gradient(135deg, #122238 0%, #9ec9f5 100%)",
    themeColor: "#0D1420",
  },
  {
    id: "plum",
    label: "Фіолетова",
    swatch: "linear-gradient(135deg, #241936 0%, #ccb2f5 100%)",
    themeColor: "#14101C",
  },
  {
    id: "espresso",
    label: "Тепла",
    swatch: "linear-gradient(135deg, #292018 0%, #e3c19b 100%)",
    themeColor: "#171310",
  },
];

function isLightPalette(v: string | null): v is LightPalette {
  return LIGHT_PALETTES.some((p) => p.id === v);
}

function isDarkPalette(v: string | null): v is DarkPalette {
  return DARK_PALETTES.some((p) => p.id === v);
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("ours-theme");
    return saved === "light" || saved === "dark" ? saved : "system";
  });
  const [lightPalette, setLightPalette] = useState<LightPalette>(() => {
    const saved = localStorage.getItem("ours-palette-light");
    return isLightPalette(saved) ? saved : "sage";
  });
  const [darkPalette, setDarkPalette] = useState<DarkPalette>(() => {
    const saved = localStorage.getItem("ours-palette-dark");
    return isDarkPalette(saved) ? saved : "forest";
  });
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => {
    if (theme === "dark") return "dark";
    if (theme === "light") return "light";
    return typeof window !== "undefined" &&
      matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  useEffect(() => {
    const query = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && query.matches);
      const activeMode = dark ? "dark" : "light";
      const activePalette = dark ? darkPalette : lightPalette;
      const metaColor = dark
        ? (DARK_PALETTES.find((p) => p.id === darkPalette)?.themeColor ??
          "#111713")
        : (LIGHT_PALETTES.find((p) => p.id === lightPalette)?.themeColor ??
          "#F4F3EE");

      setResolvedTheme(activeMode);
      document.documentElement.dataset.theme = activeMode;
      document.documentElement.dataset.palette = activePalette;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", metaColor);
    };
    apply();
    localStorage.setItem("ours-theme", theme);
    localStorage.setItem("ours-palette-light", lightPalette);
    localStorage.setItem("ours-palette-dark", darkPalette);
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [theme, lightPalette, darkPalette]);

  return {
    theme,
    setTheme,
    resolvedTheme,
    lightPalette,
    setLightPalette,
    darkPalette,
    setDarkPalette,
  };
}
