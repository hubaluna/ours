import { useEffect, useState } from "react";
import type { Theme } from "../lib/types";
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("ours-theme");
    return saved === "light" || saved === "dark" ? saved : "system";
  });
  useEffect(() => {
    const query = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && query.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", dark ? "#171D1A" : "#F7F6F3");
    };
    apply();
    localStorage.setItem("ours-theme", theme);
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [theme]);
  return { theme, setTheme };
}
