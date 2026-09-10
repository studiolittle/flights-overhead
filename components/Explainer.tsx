"use client";

import { useId, useState, type ReactNode } from "react";

/** Visible keyboard focus for the text-style toggles below. */
const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink";

/**
 * The "Learn more" disclosure. Renders an inline toggle that flows at the end
 * of a blurb, and an indented panel below it when open. Place it inside a
 * block element (a <div>), never a <p>: the open panel is a block.
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
        className={`whitespace-nowrap text-[11px] uppercase tracking-[0.12em] text-accent-ink hover:underline ${FOCUS}`}
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
 * One glossary term: a label, an example of how it looks on the board, a
 * one-line plain description, and the "Learn more" toggle. Stacks in a
 * rule-separated list.
 */
export function FieldRow({
  label,
  example,
  blurb,
  more,
}: {
  label: string;
  /** How the term appears in the app, shown as a small chip. */
  example?: string;
  blurb: ReactNode;
  more: ReactNode;
}) {
  return (
    <div className="border-t border-line py-3.5 first:border-t-0 first:pt-1">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="text-[11.5px] tracking-[0.18em] text-ink-faint">
          {label}
        </span>
        {example && (
          <span className="border border-line bg-surface-2 px-1.5 py-0.5 text-[11.5px] leading-none tracking-[0.04em] text-ink-dim">
            {example}
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

/**
 * A collapsible topic in the Learning Centre. Closed, it is one line: the
 * topic and what it covers.
 */
export function GlossarySection({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="border-t border-line first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`flex w-full items-center justify-between gap-4 py-3.5 text-left ${FOCUS}`}
      >
        <span className="min-w-0">
          <span className="block text-[12.5px] tracking-[0.2em] text-ink">
            {title}
          </span>
          <span className="mt-1 block text-[12.5px] leading-snug text-ink-faint">
            {summary}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="shrink-0 text-[18px] leading-none text-accent-ink"
        >
          {open ? "–" : "+"}
        </span>
      </button>
      {open && (
        <div id={panelId} className="pb-4">
          {children}
        </div>
      )}
    </div>
  );
}
