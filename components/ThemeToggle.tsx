"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "@phosphor-icons/react/dist/ssr";

type Theme = "light" | "dark";

const KEY = "fo.theme";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  // The blocking script in layout.tsx already set data-theme; mirror it once
  // mounted so the button reflects the real state and hydration stays clean.
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(currentTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the choice just will not persist.
    }
    setTheme(next);
  }

  const goingTo = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${goingTo} mode`}
      title={`Switch to ${goingTo} mode`}
      /* grid, not flex: a flex child SVG takes its main-axis size from the
         width attribute, ignoring the CSS size. grid places it cleanly. */
      className="chip grid h-10 w-10 place-items-center p-0"
    >
      {/* Render a neutral box until mounted to avoid a hydration mismatch. */}
      {mounted && theme === "dark" ? (
        <Sun size={22} weight="bold" />
      ) : mounted ? (
        <Moon size={22} weight="bold" />
      ) : (
        <span className="block h-[22px] w-[22px]" />
      )}
    </button>
  );
}
