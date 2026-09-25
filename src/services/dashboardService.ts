import { supabase } from "@/lib/supabaseClient";
import type { Department } from "@/types/models";

export interface DashboardMetrics { feedbackTotal: number; feedbackThisMonth: number; activeSurveys: number; responsesTotal: number; byDepartment: Record<Department, number>; }

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [feedback, month, surveys, responses, departments] = await Promise.all([
    supabase.from("feedback").select("id", { count: "exact", head: true }),
    supabase.from("feedback").select("id", { count: "exact", head: true }).gte("created_at", monthStart.toISOString()),
    supabase.from("surveys").select("id", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("survey_responses").select("id", { count: "exact", head: true }),
    supabase.from("feedback").select("department"),
  ]);
  const firstError = [feedback.error, month.error, surveys.error, responses.error, departments.error].find(Boolean);
  if (firstError) throw firstError;
  const byDepartment: Record<Department, number> = { critical: 0, floor: 0, ambulatory: 0 };
  departments.data?.forEach(({ department }) => { if (department && department in byDepartment) byDepartment[department as Department] += 1; });
  return { feedbackTotal: feedback.count ?? 0, feedbackThisMonth: month.count ?? 0, activeSurveys: surveys.count ?? 0, responsesTotal: responses.count ?? 0, byDepartment };
}
