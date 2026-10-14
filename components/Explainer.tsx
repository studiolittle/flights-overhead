"use client";

import { useId, useState, type ReactNode } from "react";
import { Minus, Plus } from "@phosphor-icons/react/dist/ssr";

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
        className={`inline-flex min-h-11 items-center whitespace-nowrap text-[length:var(--type-0)] font-medium text-accent-ink underline-offset-4 hover:underline ${FOCUS}`}
      >
        {open ? "Show less" : "Learn more"}
      </button>
      {open && (
        <span className="mt-2 block rounded-lg bg-surface-2 px-3 py-2.5 text-[length:var(--type-small)] leading-relaxed text-ink-dim">
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
  live = false,
  blurb,
  more,
}: {
  label: string;
  /** How the term appears in the app, shown as a small chip. */
  example?: string;
  /** The chip shows a flight on the board right now, not a stock example. */
  live?: boolean;
  blurb: ReactNode;
  more: ReactNode;
}) {
  return (
    <div className="border-t border-line py-3.5 first:border-t-0 first:pt-1">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="text-[length:var(--type-0)] tracking-normal text-ink-faint">
          {label}
        </span>
        {example && (
          <span
            className={`border bg-surface-2 px-1.5 py-0.5 text-[length:var(--type-0)] leading-tight tracking-normal ${
              live ? "border-accent text-accent-ink" : "border-line text-ink-dim"
            }`}
          >
            {example}
          </span>
        )}
      </div>
      <div className="mt-1.5 text-[length:var(--type-small)] leading-relaxed text-ink-dim">
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
  defaultOpen = false,
}: {
  title: string;
  summary: string;
  children: ReactNode;
  /** Start expanded, for the topic people reach for most. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className="border-t border-line first:border-t-0">
      {/* A heading per topic, so screen readers can jump between them. */}
      <h3>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`flex w-full items-center justify-between gap-4 py-3.5 text-left ${FOCUS}`}
      >
        <span className="min-w-0">
          <span className="block text-[length:var(--type-2)] font-semibold leading-tight text-ink">
            {title}
          </span>
          <span className="mt-1 block text-[length:var(--type-0)] leading-snug text-ink-dim">
            {summary}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="flex shrink-0 text-accent-ink"
        >
          {open ? <Minus size={18} weight="bold" /> : <Plus size={18} weight="bold" />}
        </span>
      </button>
      </h3>
      <div id={panelId} hidden={!open} className="pb-4">
        {children}
      </div>
    </div>
  );
}
