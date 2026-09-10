"use client";

import { useState, type ReactNode } from "react";

/**
 * The "Learn more" disclosure used across the flight card. Renders an inline
 * toggle that flows at the end of a blurb, and an indented panel below it when
 * open. Place it inside a block element (a <div>), never a <p>: the open panel
 * is a block.
 */
export function LearnMore({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {" "}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="whitespace-nowrap text-[11px] uppercase tracking-[0.12em] text-accent-ink hover:underline"
      >
        {open ? "Show less –" : "Learn more +"}
      </button>
      {open && (
        <span className="mt-2 block border-l-2 border-line-strong pl-3 text-[13px] leading-relaxed text-ink-dim">
          {children}
        </span>
      )}
    </>
  );
}

/**
 * One explained field: a label, an optional raw value, a one-line plain
 * description, and the "Learn more" toggle. Stacks in a rule-separated list.
 */
export function FieldRow({
  label,
  value,
  tone,
  blurb,
  more,
}: {
  label: string;
  value?: string;
  tone?: string;
  blurb: ReactNode;
  more: ReactNode;
}) {
  return (
    <div className="border-t border-line py-3.5 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-2.5">
        <span className="text-[11.5px] tracking-[0.18em] text-ink-faint">
          {label}
        </span>
        {value != null && (
          <span
            className="text-[17px] leading-none"
            style={{ color: tone ?? "var(--color-ink)" }}
          >
            {value}
          </span>
        )}
      </div>
      <div className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">
        {blurb}
        <LearnMore>{more}</LearnMore>
      </div>
    </div>
  );
}

/** A titled block of {@link FieldRow}s, matching the card's other sections. */
export function ExplainerSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-line pt-4">
      <p className="text-[11.5px] tracking-[0.18em] text-ink-faint">{title}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
