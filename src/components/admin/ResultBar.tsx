interface ResultBarProps {
  label: string;
  value: number;
  max: number;
  /** Preformatted trailing text, usually a count and a percentage. */
  caption: string;
}

/**
 * A single labelled bar. Uses the native progress element, the same approach as
 * the department breakdown on the analytics page, so the two views match.
 */
export function ResultBar({ label, value, max, caption }: ResultBarProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate">{label}</span>
        <span className="shrink-0 font-semibold tabular-nums">{caption}</span>
      </div>
      <progress
        className="h-2 w-full overflow-hidden rounded-full accent-[hsl(var(--primary))]"
        max={Math.max(1, max)}
        value={value}
      />
    </div>
  );
}
