import { supabase } from "@/lib/supabaseClient";
import type { Department, FeedbackRecord } from "@/types/models";

export interface FeedbackSubmission { description: string; department: Department | ""; nurseName: string; employeeCode: string; image: File | null; }

async function uploadImage(image: File) {
  const extension = image.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `public/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("feedback-images").upload(path, image, { contentType: image.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function submitFeedback(input: FeedbackSubmission) {
  const attachmentPath = input.image ? await uploadImage(input.image) : null;
  const { data, error } = await supabase.rpc("submit_feedback", {
    p_description: input.description,
    p_department: input.department || null,
    p_nurse_name: input.nurseName || null,
    p_employee_code: input.employeeCode || null,
    p_attachment_path: attachmentPath,
  });
  if (error) {
    if (attachmentPath) await supabase.storage.from("feedback-images").remove([attachmentPath]);
    throw error;
  }
  return data as string;
}

export async function getFeedback() {
  const { data, error } = await supabase.from("feedback").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data as FeedbackRecord[];
}

export async function getFeedbackImageUrl(path: string) {
  const { data, error } = await supabase.storage.from("feedback-images").createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}
