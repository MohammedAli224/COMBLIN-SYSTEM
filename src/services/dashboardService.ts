import { supabase } from "@/lib/supabaseClient";
import type { Department } from "@/types/models";

/** One day in the submission trend. day is a UTC calendar date, YYYY-MM-DD. */
export interface TrendPoint {
  day: string;
  total: number;
}

/**
 * Anonymous versus identified submissions.
 *
 * incomplete is the count of rows carrying only some of the three identifying
 * fields. Those predate the all-or-none check constraint, which was added NOT
 * VALID, so they can still exist and are reported rather than hidden.
 */
export interface IdentityBreakdown {
  identified: number;
  anonymous: number;
  incomplete: number;
}

export interface DashboardMetrics {
  feedbackTotal: number;
  feedbackThisMonth: number;
  activeSurveys: number;
  responsesTotal: number;
  byDepartment: Record<Department, number>;
  /**
   * Dense daily series, oldest first, including days with no submissions as an
   * explicit zero. Absent if the database has not run the migration that adds
   * it, so consumers must treat it as optional.
   */
  feedbackByDay?: TrendPoint[];
  identity?: IdentityBreakdown;
  /** Length of the trend window, so the label cannot drift from the series. */
  windowDays?: number;
}

/**
 * All dashboard counters come from one admin-guarded RPC.
 *
 * This used to be five direct queries from the browser, two of which counted
 * the feedback table. Direct SELECT is now revoked on feedback and on
 * survey_responses, so a single RPC replaces them. The month boundary is
 * computed in UTC inside the function, matching what the browser did, so the
 * figure does not shift with the server's timezone.
 *
 * The RPC also returns the trend and identity breakdown the analytics section
 * renders, for the same reason: neither is readable from the client.
 */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const { data, error } = await supabase.rpc("admin_get_dashboard_metrics");
  if (error) throw error;
  return data as DashboardMetrics;
}
