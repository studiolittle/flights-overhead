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
      className="chip flex h-8 w-8 items-center justify-center p-0"
    >
      {/* Render nothing distinguishing until mounted to avoid a hydration
          mismatch on the icon. */}
      {mounted && theme === "dark" ? (
        <Sun size={15} weight="bold" />
      ) : mounted ? (
        <Moon size={15} weight="bold" />
      ) : (
        <span className="block h-[15px] w-[15px]" />
      )}
    </button>
  );
}
