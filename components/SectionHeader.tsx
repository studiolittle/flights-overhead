import type { ReactNode } from "react";

/**
 * A section title bar, the same on every section of the page. The title is
 * the section's <h2>: give the section `aria-labelledby={id}` so screen
 * readers announce it by name.
 */
export function SectionHeader({
  id,
  title,
  icon,
  aside,
}: {
  id: string;
  title: string;
  /** Decorative: the title already says what the section is. */
  icon?: ReactNode;
  aside?: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
      <div className="flex items-center gap-2.5">
        {icon && (
          <span aria-hidden="true" className="flex shrink-0 text-accent-ink">
            {icon}
          </span>
        )}
        <h2 id={id} className="text-[15px] tracking-[0.28em] text-ink">
          {title}
        </h2>
      </div>
      {aside && (
        <span className="text-[11.5px] tracking-[0.2em] text-ink-faint">
          {aside}
        </span>
      )}
    </div>
  );
}
