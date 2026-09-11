"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "@phosphor-icons/react/dist/ssr";

type Theme = "light" | "dark";

const KEY = "fo.theme";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeToggle() {
  // The blocking script in layout.tsx set data-theme before paint; mirror it
  // once mounted so the switch reflects reality and hydration stays clean.
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    setTheme(currentTheme());
    setMounted(true);
    // Enable the slide transition only after the knob has painted in place,
    // so it does not animate from the wrong side on first load.
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
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

  const isDark = mounted && theme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={`Dark mode ${isDark ? "on" : "off"}`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      onClick={toggle}
      className="relative grid h-[26px] w-[52px] shrink-0 grid-cols-2 items-center border border-line-strong bg-surface-2 px-[3px]"
    >
      {/* Dim end markers; the knob covers the active one. */}
      <Sun
        size={13}
        weight="bold"
        className="justify-self-center text-ink-faint"
      />
      <Moon
        size={13}
        weight="bold"
        className="justify-self-center text-ink-faint"
      />

      {mounted && (
        <span
          aria-hidden
          className={`pointer-events-none absolute left-[3px] grid h-[18px] w-[18px] place-items-center bg-accent text-on-accent ${
            animate ? "transition-transform duration-200 ease-out" : ""
          }`}
          style={{ transform: `translate(${isDark ? 26 : 0}px, -50%)`, top: "50%" }}
        >
          {isDark ? (
            <Moon size={12} weight="bold" />
          ) : (
            <Sun size={12} weight="bold" />
          )}
        </span>
      )}
    </button>
  );
}
