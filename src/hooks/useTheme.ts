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
    swatch: "linear-gradient(135deg, #dfeee4 0%, #385e43 100%)",
    themeColor: "#F5F5F1",
  },
  {
    id: "beige",
    label: "Бежева",
    swatch: "linear-gradient(135deg, #f1e6d8 0%, #825d3e 100%)",
    themeColor: "#F7F3ED",
  },
  {
    id: "rose",
    label: "Рожева",
    swatch: "linear-gradient(135deg, #f6dce6 0%, #944d66 100%)",
    themeColor: "#F9F4F6",
  },
  {
    id: "lavender",
    label: "Фіолетова",
    swatch: "linear-gradient(135deg, #e7dff6 0%, #634d8e 100%)",
    themeColor: "#F6F4FA",
  },
  {
    id: "sky",
    label: "Блакитна",
    swatch: "linear-gradient(135deg, #d8e9f7 0%, #376085 100%)",
    themeColor: "#F3F6FA",
  },
];

export const DARK_PALETTES: readonly PaletteOption<DarkPalette>[] = [
  {
    id: "forest",
    label: "Зелена",
    swatch: "linear-gradient(135deg, #121714 0%, #9ec4a6 100%)",
    themeColor: "#0F1311",
  },
  {
    id: "obsidian",
    label: "Чорна",
    swatch: "linear-gradient(135deg, #0b0c0e 0%, #d4d8de 100%)",
    themeColor: "#0A0B0D",
  },
  {
    id: "midnight",
    label: "Синя",
    swatch: "linear-gradient(135deg, #0f141c 0%, #92bae0 100%)",
    themeColor: "#0C1017",
  },
  {
    id: "plum",
    label: "Фіолетова",
    swatch: "linear-gradient(135deg, #14121a 0%, #bca6e4 100%)",
    themeColor: "#100F15",
  },
  {
    id: "espresso",
    label: "Тепла",
    swatch: "linear-gradient(135deg, #161310 0%, #d4b48f 100%)",
    themeColor: "#13110F",
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
