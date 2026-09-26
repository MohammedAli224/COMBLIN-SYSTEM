import { supabase } from "@/lib/supabaseClient";
import { hashEmployeeCode } from "@/lib/utils";
import type { SurveyResultsPayload } from "@/lib/surveyResults";
import type { Survey, SurveyAnswerPayload, SurveyDraft, QuestionType } from "@/types/models";

export async function getPublishedSurvey(slug: string) {
  const { data, error } = await supabase.from("surveys").select("*, survey_questions(*, survey_options(*))").eq("slug", slug).eq("status", "published").maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const survey = data as Survey;
  sortSurvey(survey);
  return survey;
}

/**
 * The employee code is only collected, hashed, and enforced for surveys whose
 * response_policy is "one_per_employee". Open surveys pass null and are
 * inserted with no employee identifier at all.
 */
export async function submitSurveyResponse(surveyId: string, employeeCode: string | null, answers: SurveyAnswerPayload[]) {
  const employeeCodeHash = employeeCode ? await hashEmployeeCode(employeeCode) : null;
  const { data, error } = await supabase.rpc("submit_survey_response", { p_survey_id: surveyId, p_employee_code_hash: employeeCodeHash, p_answers: answers });
  if (error) throw error;
  return data as string;
}

/**
 * Response count per survey id.
 *
 * This cannot be a PostgREST embed any more. Direct SELECT on
 * survey_responses was revoked in 20260926008000, and embedding
 * survey_responses(count) needs that privilege, so the admin panel reads the
 * counts through a SECURITY DEFINER RPC instead. A survey with no responses
 * comes back as 0 rather than being absent.
 */
export async function getSurveyResponseCounts() {
  const { data, error } = await supabase.rpc("admin_get_survey_response_counts");
  if (error) throw error;
  return (data ?? {}) as Record<string, number>;
}

export async function getAdminSurveys() {
  // The two reads are independent, so they go out together rather than paying
  // for two round trips in sequence.
  const [surveysResult, counts] = await Promise.all([
    supabase.from("surveys").select("*").order("created_at", { ascending: false }),
    getSurveyResponseCounts(),
  ]);
  if (surveysResult.error) throw surveysResult.error;
  // No sortSurvey call here on purpose: this query does not embed the
  // questions, and the list view does not render them.
  return ((surveysResult.data ?? []) as Survey[]).map((survey) => ({
    ...survey,
    response_count: counts[survey.id] ?? 0,
  }));
}

function generateShortSlug() {
  return crypto.randomUUID().split("-")[0];
}

export async function getPublishedSurveys() {
  const { data, error } = await supabase.from("surveys").select("*, survey_questions(*, survey_options(*))").eq("status", "published").order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Survey[]).map((survey) => {
    sortSurvey(survey);
    return survey;
  });
}

export async function createSurvey(draft: SurveyDraft, userId: string) {
  const slug = draft.slug.trim().toLowerCase() || generateShortSlug();
  const { data: survey, error } = await supabase.from("surveys").insert({ title_ar: draft.title_ar.trim(), title_en: draft.title_en.trim(), description_ar: draft.description_ar.trim() || null, description_en: draft.description_en.trim() || null, slug, response_policy: draft.response_policy, created_by: userId }).select().single();
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
    // Best effort, and deliberately not allowed to replace the real error: a
    // half-created draft is recoverable by an admin, losing the reason the
    // builder actually failed is not. This goes through the RPC because direct
    // deletes are revoked on every table in the survey chain.
    //
    // supabase.rpc resolves with { error } rather than throwing, so the failure
    // has to be read off the result instead of caught.
    const { error: cleanupError } = await supabase.rpc("admin_delete_survey", { p_survey_id: survey.id });
    if (cleanupError) console.error("createSurvey rollback failed:", cleanupError);
    throw creationError;
  }
}

export interface SurveyDeletionResult {
  questions: number;
  options: number;
  responses: number;
  answers: number;
}

/**
 * Permanently remove a survey and everything hanging off it. Restricted to
 * administrators by the RPC, which re-checks admin_users against auth.uid()
 * rather than trusting the client-side route guard.
 */
export async function deleteSurvey(surveyId: string) {
  const { data, error } = await supabase.rpc("admin_delete_survey", { p_survey_id: surveyId });
  if (error) throw error;
  return (data ?? { questions: 0, options: 0, responses: 0, answers: 0 }) as SurveyDeletionResult;
}

export interface SurveyUpdateResult {
  questionsAdded: number;
  questionsUpdated: number;
  questionsRemoved: number;
  optionsAdded: number;
  optionsUpdated: number;
  optionsRemoved: number;
}

/**
 * Load one survey with its questions, options, and response count, in any
 * status, for the builder. Returns null when the id does not exist.
 *
 * The count is not decoration: the edit form uses it to explain that a survey
 * with responses cannot have its question structure changed, because the RPC
 * refuses a save that would orphan a recorded answer.
 */
export async function getAdminSurvey(id: string) {
  const [surveyResult, counts] = await Promise.all([
    supabase.from("surveys").select("*, survey_questions(*, survey_options(*))").eq("id", id).maybeSingle(),
    getSurveyResponseCounts(),
  ]);
  if (surveyResult.error) throw surveyResult.error;
  if (!surveyResult.data) return null;
  const survey = surveyResult.data as Survey;
  sortSurvey(survey);
  return { ...survey, response_count: counts[id] ?? 0 };
}

function sortSurvey(survey: Survey) {
  survey.survey_questions?.sort((a, b) => a.position - b.position);
  survey.survey_questions?.forEach((question) => question.survey_options?.sort((a, b) => a.position - b.position));
}

/**
 * Apply an edit to an existing survey.
 *
 * Sends the full desired state; the RPC reconciles towards it inside one
 * transaction. Questions and options carry their existing ids so unchanged
 * rows are updated in place. Anything the admin removed is deleted server
 * side, and the RPC refuses the whole edit if that would orphan a recorded
 * answer, so a partial save is not possible.
 *
 * The slug is not sent: it is the public URL and renaming it would break links
 * that have already been shared.
 *
 * Returns the counts the database actually applied, so a caller that wants to
 * report the real outcome can, rather than assuming the save matched what was
 * on screen.
 */
export async function updateSurvey(surveyId: string, draft: SurveyDraft) {
  const isChoice = (type: QuestionType) => type === "single_choice" || type === "multiple_choice";
  const { data, error } = await supabase.rpc("admin_update_survey", {
    p_survey_id: surveyId,
    p_survey: {
      title_ar: draft.title_ar.trim(),
      title_en: draft.title_en.trim(),
      description_ar: draft.description_ar.trim() || null,
      description_en: draft.description_en.trim() || null,
      response_policy: draft.response_policy,
    },
    // No position is sent. The RPC renumbers questions and options from the
    // array order, so array order is the only thing that decides sequence.
    p_questions: draft.questions.map((question) => ({
      id: question.id ?? null,
      type: question.type,
      title_ar: question.title_ar.trim(),
      title_en: question.title_en.trim(),
      is_required: question.is_required,
      // Options are only meaningful for choice types. Sending an empty list for
      // the others is what lets the RPC drop the leftovers when a question is
      // converted away from single or multiple choice.
      options: isChoice(question.type)
        ? question.options.map((option) => ({
            id: option.id ?? null,
            label_ar: option.label_ar.trim(),
            label_en: option.label_en.trim(),
          }))
        : [],
    })),
  });
  if (error) throw error;
  return (data ?? {
    questionsAdded: 0,
    questionsUpdated: 0,
    questionsRemoved: 0,
    optionsAdded: 0,
    optionsUpdated: 0,
    optionsRemoved: 0,
  }) as SurveyUpdateResult;
}

export async function updateSurveyStatus(id: string, status: "published" | "closed") {
  const { error } = await supabase.from("surveys").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

/**
 * Aggregate results for one survey. Restricted to administrators by the RPC,
 * so this is the only supported way to read responses.
 */
export async function getSurveyResults(surveyId: string) {
  const { data, error } = await supabase.rpc("admin_get_survey_results", { p_survey_id: surveyId });
  if (error) throw error;
  return data as SurveyResultsPayload;
}
