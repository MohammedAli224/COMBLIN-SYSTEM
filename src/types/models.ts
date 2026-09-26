export type Department = "critical" | "floor" | "ambulatory";
export type ResponsePolicy = "one_per_employee" | "open";
export type SurveyStatus = "draft" | "published" | "closed";
export type QuestionType = "single_choice" | "multiple_choice" | "rating" | "yes_no" | "free_text";

export interface FeedbackRecord {
  id: string;
  description: string;
  department: Department | null;
  name: string | null;
  /**
   * The employee's own code, stored as typed so management can read it and
   * follow up. Null on anonymous submissions. Contrast with the survey code,
   * which is a de-duplication key and stays hashed.
   */
  employee_code: string | null;
  attachment_path: string | null;
  created_at: string;
}

export interface SurveyResponse {
  id: string;
  survey_id: string;
  employee_code_hash: string | null;
  created_at: string;
}

export interface SurveyOption { id: string; question_id: string; label_ar: string; label_en: string; position: number; }
export interface SurveyQuestion { id: string; survey_id: string; type: QuestionType; title_ar: string; title_en: string; is_required: boolean; position: number; survey_options: SurveyOption[]; }
export interface Survey { id: string; title_ar: string; title_en: string; description_ar: string | null; description_en: string | null; slug: string; response_policy: ResponsePolicy; status: SurveyStatus; created_at: string; survey_questions?: SurveyQuestion[]; response_count?: number; }
/**
 * Ids are optional because the same shape serves both flows: create sends none,
 * so every question and option is inserted, while edit sends the existing ids
 * so matching rows are updated in place. Recreating a question instead would
 * orphan the survey_answers rows that point at it.
 */
export interface QuestionDraft {
  id?: string;
  type: QuestionType;
  title_ar: string;
  title_en: string;
  is_required: boolean;
  options: Array<{ id?: string; label_ar: string; label_en: string }>;
}
export interface SurveyDraft { title_ar: string; title_en: string; description_ar: string; description_en: string; slug: string; response_policy: ResponsePolicy; questions: QuestionDraft[]; }
export interface SurveyAnswerPayload { questionId: string; optionIds?: string[]; rating?: number; booleanValue?: boolean; textValue?: string; }
