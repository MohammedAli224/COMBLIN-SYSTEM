export type Department = "critical" | "floor" | "ambulatory";
export type ResponsePolicy = "one_per_employee" | "open";
export type SurveyStatus = "draft" | "published" | "closed";
export type QuestionType = "single_choice" | "multiple_choice" | "rating" | "yes_no" | "free_text";

export interface FeedbackRecord {
  id: string;
  description: string;
  department: Department | null;
  nurse_name: string | null;
  employee_code: string | null;
  attachment_path: string | null;
  created_at: string;
}

export interface SurveyOption { id: string; question_id: string; label_ar: string; label_en: string; position: number; }
export interface SurveyQuestion { id: string; survey_id: string; type: QuestionType; title_ar: string; title_en: string; is_required: boolean; position: number; survey_options: SurveyOption[]; }
export interface Survey { id: string; title_ar: string; title_en: string; description_ar: string | null; description_en: string | null; slug: string; response_policy: ResponsePolicy; status: SurveyStatus; created_at: string; survey_questions?: SurveyQuestion[]; response_count?: number; }
export interface QuestionDraft { type: QuestionType; title_ar: string; title_en: string; is_required: boolean; options: Array<{ label_ar: string; label_en: string }>; }
export interface SurveyDraft { title_ar: string; title_en: string; description_ar: string; description_en: string; slug: string; response_policy: ResponsePolicy; questions: QuestionDraft[]; }
export interface SurveyAnswerPayload { questionId: string; optionIds?: string[]; rating?: number; booleanValue?: boolean; textValue?: string; }
