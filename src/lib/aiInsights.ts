import type { Department } from "@/types/models";

/**
 * Contract for the AI insights pipeline.
 *
 * Nothing produces this yet. There is no model call anywhere in the project and
 * no RPC that returns it, so every field here is a proposal rather than a
 * settled shape. It exists so the dashboard's insights hub has a defined
 * structure to render, and so the pipeline has something concrete to fill in or
 * to argue with when it is built.
 *
 * Two rules that should survive whatever the final shape turns out to be:
 *
 *   1. The narrative summary is plain text. It must never be rendered as HTML.
 *      Model output is untrusted input, and a summary is the single field most
 *      likely to contain text a reader would want rendered, which is exactly
 *      what makes it the most attractive injection target.
 *   2. Severity is the admin's triage signal, so it stays a small closed set
 *      rather than a free-form label. An open string here would silently become
 *      unstyled, because the styling map has no entry for it.
 */

export type InsightSeverity = "low" | "medium" | "high";

/** Visual treatment per severity, decided here so the tags are consistent. */
export const SEVERITY_STYLES: Record<InsightSeverity, string> = {
  low: "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-800",
  high: "bg-destructive/10 text-destructive",
};

/** A group of related complaints the pipeline judged to be the same problem. */
export interface ThemeCluster {
  id: string;
  /** Short label for the cluster, already localised by whatever produced it. */
  label: string;
  /** How many submissions fall into this cluster. Drives the count tag. */
  mentions: number;
  severity: InsightSeverity;
}

/**
 * A signal worth interrupting someone about. department is null for a signal
 * that spans the whole hospital rather than one unit.
 */
export interface DepartmentAlert {
  id: string;
  department: Department | null;
  message: string;
  severity: InsightSeverity;
}

export interface AiInsights {
  /** Narrative synthesis. Null while there is nothing to synthesise. */
  summary: string | null;
  themes: ThemeCluster[];
  alerts: DepartmentAlert[];
  /** ISO timestamp, or null when the payload is a placeholder. */
  generatedAt: string | null;
}
