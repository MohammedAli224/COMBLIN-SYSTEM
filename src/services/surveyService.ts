import { supabase } from "@/lib/supabaseClient";
import type { Survey, SurveyAnswerPayload, SurveyDraft } from "@/types/models";

export async function getPublishedSurvey(slug: string) {
  const { data, error } = await supabase.from("surveys").select("*, survey_questions(*, survey_options(*))").eq("slug", slug).eq("status", "published").maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const survey = data as Survey;
  survey.survey_questions?.sort((a, b) => a.position - b.position);
  survey.survey_questions?.forEach((question) => question.survey_options?.sort((a, b) => a.position - b.position));
  return survey;
}

export async function submitSurveyResponse(surveyId: string, employeeCode: string, answers: SurveyAnswerPayload[]) {
  const { data, error } = await supabase.rpc("submit_survey_response", { p_survey_id: surveyId, p_employee_code: employeeCode || null, p_answers: answers });
  if (error) throw error;
  return data as string;
}

export async function getAdminSurveys() {
  const { data, error } = await supabase.from("surveys").select("*, survey_responses(count)").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((survey) => ({ ...survey, response_count: survey.survey_responses?.[0]?.count ?? 0 })) as Survey[];
}

export async function createSurvey(draft: SurveyDraft, userId: string) {
  const { data: survey, error } = await supabase.from("surveys").insert({ title_ar: draft.title_ar.trim(), title_en: draft.title_en.trim(), description_ar: draft.description_ar.trim() || null, description_en: draft.description_en.trim() || null, slug: draft.slug.trim().toLowerCase(), response_policy: draft.response_policy, created_by: userId }).select().single();
  if (error) throw error;
  try {
    for (const [position, question] of draft.questions.entries()) {
      const { data: createdQuestion, error: questionError } = await supabase.from("survey_questions").insert({ survey_id: survey.id, type: question.type, title_ar: question.title_ar.trim(), title_en: question.title_en.trim(), is_required: question.is_required, position }).select().single();
      if (questionError) throw questionError;
      if (question.type === "single_choice" || question.type === "multiple_choice") {
        const options = question.options.map((option, optionPosition) => ({ question_id: createdQuestion.id, label_ar: option.label_ar.trim(), label_en: option.label_en.trim(), position: optionPosition }));
        const { error: optionsError } = await supabase.from("survey_options").insert(options);
        if (optionsError) throw optionsError;
      }
    }
    return survey as Survey;
  } catch (creationError) {
    await supabase.from("surveys").delete().eq("id", survey.id);
    throw creationError;
  }
}

export async function updateSurveyStatus(id: string, status: "published" | "closed") {
  const { error } = await supabase.from("surveys").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
