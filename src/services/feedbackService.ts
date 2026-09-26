import { supabase } from "@/lib/supabaseClient";
import type { Department, FeedbackRecord } from "@/types/models";

export interface FeedbackSubmission {
  description: string;
  department: Department | "";
  name: string;
  employeeCode: string;
  image: File | null;
}

async function uploadImage(image: File) {
  const extension = image.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `public/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("feedback-images").upload(path, image, { contentType: image.type, upsert: false });
  if (error) throw error;
  return path;
}

/**
 * Two modes, and the database rejects anything in between.
 *
 *   anonymous  - all three identity fields are sent as null.
 *   identified - name, department, and employee code are all sent together.
 *
 * The employee code is sent as typed, not hashed. Hashing was the previous
 * behaviour, on the reasoning that a code nobody can read is harmless if the
 * database leaks. That was reversed: management needs to identify the sender to
 * act on the complaint and follow up. The protection now rests on the table
 * being unreadable through REST, not on the value being unreadable, so the
 * admin read path is the admin_get_feedback RPC rather than a direct select.
 */
export async function submitFeedback(input: FeedbackSubmission) {
  const attachmentPath = input.image ? await uploadImage(input.image) : null;
  const name = input.name.trim() || null;
  const department = input.department || null;

  const { data, error } = await supabase.rpc("submit_feedback", {
    p_description: input.description,
    p_department: department,
    p_name: name,
    p_employee_code: input.employeeCode.trim() || null,
    p_attachment_path: attachmentPath,
  });
  if (error) {
    // Never leave an orphaned attachment behind on a rejected submission.
    if (attachmentPath) await supabase.storage.from("feedback-images").remove([attachmentPath]);
    throw error;
  }
  return data as string;
}

export type FeedbackRange = "24h" | "week" | "month" | "all";

const RANGE_MS: Record<Exclude<FeedbackRange, "all">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  // A rolling 30 days, not a calendar month, so the window does not jump.
  month: 30 * 24 * 60 * 60 * 1000,
};

function rangeStart(range: FeedbackRange): string | null {
  if (range === "all") return null;
  return new Date(Date.now() - RANGE_MS[range]).toISOString();
}

/**
 * Inbox read. Goes through the admin_get_feedback RPC because direct SELECT on
 * the feedback table is revoked: it now holds readable employee codes, so the
 * table is only reachable by a caller the database recognises as an admin.
 */
export async function getFeedback(range: FeedbackRange = "all") {
  const { data, error } = await supabase.rpc("admin_get_feedback", {
    p_since: rangeStart(range),
  });
  if (error) throw error;
  return (data ?? []) as FeedbackRecord[];
}

export async function deleteFeedback(id: string) {
  const { error } = await supabase.rpc("delete_feedback", { p_id: id });
  if (error) throw error;
}

export async function deleteFeedbackBulk(ids: string[]): Promise<number> {
  const { data, error } = await supabase.rpc("delete_feedback_bulk", { p_ids: ids });
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

export async function getFeedbackImageUrl(path: string) {
  const { data, error } = await supabase.storage.from("feedback-images").createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}
