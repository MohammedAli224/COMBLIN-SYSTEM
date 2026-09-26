import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Department } from "@/types/models";
import type { IdentityBreakdown, TrendPoint } from "@/services/dashboardService";

/**
 * Charts for the dashboard's analytics section.
 *
 * Hand drawn in SVG and divs rather than pulled from a charting library. The
 * project has no chart dependency and adding one for two charts would put a
 * sizeable bundle in front of a page whose data arrives from a single RPC.
 *
 * The trend is drawn in a fixed left to right coordinate space and marked
 * dir="ltr" even inside the RTL layout. A time axis that reverses with the text
 * direction is harder to read, and showing one mirrored chart next to unmirrored
 * ones in the same screen is worse than picking one convention and keeping it.
 */

/* -------------------------------------------------------------------------- */
/*  Feedback over time                                                         */
/* -------------------------------------------------------------------------- */

const WIDTH = 720;
const HEIGHT = 212;
const PAD = { top: 14, right: 10, bottom: 26, left: 32 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;
const BASELINE = PAD.top + PLOT_H;

/**
 * Rounds an axis maximum up to a 1, 2 or 5 times a power of ten, so the grid
 * lines land on values a reader recognises instead of on the raw peak.
 */
function niceMax(value: number) {
  if (value <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

export function FeedbackTrendChart({ series, windowDays }: { series: TrendPoint[]; windowDays: number }) {
  const { t, i18n } = useTranslation();
  const gradientId = useId();

  const total = useMemo(() => series.reduce((sum, point) => sum + point.total, 0), [series]);
  const peak = useMemo(
    () => series.reduce<TrendPoint | null>((best, point) => (!best || point.total > best.total ? point : best), null),
    [series],
  );

  // An empty series means the migration that adds it has not been run yet, and
  // an all zero series means the period genuinely had no submissions. Both read
  // as an empty chart rather than a crash or a flat line pinned to the axis.
  if (series.length === 0 || total === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{t("admin.trendEmpty")}</p>;
  }

  const max = niceMax(peak?.total ?? 1);
  const step = series.length > 1 ? PLOT_W / (series.length - 1) : 0;
  const points = series.map((point, index) => ({
    x: PAD.left + (series.length > 1 ? index * step : PLOT_W / 2),
    y: BASELINE - (point.total / max) * PLOT_H,
  }));

  const peakIndex = peak ? series.findIndex((point) => point.day === peak.day) : -1;
  const peakPoint = peakIndex >= 0 ? points[peakIndex] : null;

  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const area = `${line} L${points[points.length - 1].x.toFixed(2)} ${BASELINE} L${points[0].x.toFixed(2)} ${BASELINE} Z`;

  // An odd maximum has no clean midpoint, so it gets two grid lines rather
  // than one at a fractional value.
  const ticks = max % 2 === 0 ? [0, max / 2, max] : [0, max];

  const labelIndices = Array.from(
    new Set(
      Array.from({ length: Math.min(5, series.length) }, (_, index, all) =>
        Math.round((index * (series.length - 1)) / Math.max(1, all.length - 1)),
      ),
    ),
  );

  const formatDay = (day: string) =>
    new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(`${day}T00:00:00Z`),
    );

  const label = t("admin.trendChartLabel", { days: windowDays, total });

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={label}
        dir="ltr"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.28" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => {
          const y = BASELINE - (tick / max) * PLOT_H;
          return (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y}
                y2={y}
                stroke="hsl(var(--border))"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize={10} fill="hsl(var(--muted-foreground))">
                {tick}
              </text>
            </g>
          );
        })}

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Marks the busiest day. Purely a reading aid: it carries no meaning
            beyond the value already shown by the y axis. */}
        {peakPoint && peakPoint.total > 0 && (
          <circle
            cx={peakPoint.x}
            cy={peakPoint.y}
            r={4}
            fill="hsl(var(--primary))"
            stroke="hsl(var(--card))"
            strokeWidth={2}
          />
        )}

        {labelIndices.map((index) => (
          <text
            key={series[index].day}
            x={points[index].x}
            y={HEIGHT - 8}
            textAnchor="middle"
            fontSize={10}
            fill="hsl(var(--muted-foreground))"
          >
            {formatDay(series[index].day)}
          </text>
        ))}
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Feedback by department                                                     */
/* -------------------------------------------------------------------------- */

const DEPARTMENTS: Department[] = ["critical", "floor", "ambulatory"];

/**
 * A single hue ramp rather than three distinct colours. These are three
 * departments, not a severity scale, so giving one of them a warning colour
 * would imply a judgement the data does not make.
 */
const DEPARTMENT_BARS = ["bg-primary", "bg-primary/70", "bg-primary/45"];

export function DepartmentBars({ counts, total }: { counts: Record<Department, number>; total: number }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...DEPARTMENTS.map((department) => counts[department] ?? 0));

  return (
    <div className="space-y-5">
      {DEPARTMENTS.map((department, index) => {
        const count = counts[department] ?? 0;
        const share = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={department} className="space-y-2">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{t(`feedback.departments.${department}`)}</span>
              <span className="flex items-baseline gap-2">
                <span className="font-bold tabular-nums">{count}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{share}%</span>
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${DEPARTMENT_BARS[index]}`}
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Identity breakdown                                                         */
/* -------------------------------------------------------------------------- */

export function IdentitySplit({ identity, total }: { identity: IdentityBreakdown; total: number }) {
  const { t } = useTranslation();
  const identified = identity?.identified ?? 0;
  const anonymous = identity?.anonymous ?? 0;
  const incomplete = identity?.incomplete ?? 0;

  if (total === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{t("common.noData")}</p>;
  }

  // The bar is built from the same numbers as the legend so the two can never
  // disagree. Partial rows get their own segment rather than being dropped:
  // they predate the all-or-none rule and hiding them would make the segments
  // add up to less than the real total for no visible reason.
  const segments = [
    { key: "identified", value: identified, className: "bg-primary", label: t("admin.identityIdentified") },
    { key: "anonymous", value: anonymous, className: "bg-muted-foreground/30", label: t("admin.anonymous") },
    ...(incomplete > 0
      ? [{ key: "incomplete", value: incomplete, className: "bg-amber-400", label: t("admin.identityIncomplete") }]
      : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((segment) =>
          segment.value > 0 ? (
            <div
              key={segment.key}
              className={`h-full transition-[width] duration-500 ${segment.className}`}
              style={{ width: `${(segment.value / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>

      <ul className="space-y-3">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2.5">
              <span className={`size-2.5 rounded-full ${segment.className}`} />
              <span className="font-medium">{segment.label}</span>
            </span>
            <span className="flex items-baseline gap-2">
              <span className="font-bold tabular-nums">{segment.value}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {Math.round((segment.value / total) * 100)}%
              </span>
            </span>
          </li>
        ))}
      </ul>

      {incomplete > 0 && <p className="text-xs leading-5 text-muted-foreground">{t("admin.identityIncompleteNote")}</p>}
    </div>
  );
}
