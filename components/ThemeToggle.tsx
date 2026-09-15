"use client";

import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "@phosphor-icons/react/dist/ssr";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeToggle() {
  const manual = useRef(false);
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
    const sync = () => {
      if (manual.current) return;
      const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Toronto", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
      const next = hour >= 7 && hour < 19 ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    sync();
    const timer = setInterval(sync, 30_000);
    document.addEventListener("visibilitychange", sync);
    return () => { cancelAnimationFrame(id); clearInterval(timer); document.removeEventListener("visibilitychange", sync); };
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    manual.current = true;
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
      className="relative grid h-[30px] w-[52px] shrink-0 grid-cols-2 items-center rounded-full border border-line-strong bg-surface-2 px-[3px] transition-colors hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-ink"
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
          className={`pointer-events-none absolute left-[3px] grid h-[18px] w-[18px] place-items-center rounded-full bg-accent text-on-accent ${
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
