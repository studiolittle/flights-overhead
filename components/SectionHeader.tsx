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
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
      <div className="flex items-center gap-2.5">
        {icon && (
          <span aria-hidden="true" className="flex shrink-0 text-accent-ink">
            {icon}
          </span>
        )}
        <h2 id={id} className="type-heading text-[length:var(--type-1)] text-ink">
          {title}
        </h2>
      </div>
      {aside && (
        <span className="text-[length:var(--type-0)] tracking-normal text-ink-faint">
          {aside}
        </span>
      )}
    </div>
  );
}
