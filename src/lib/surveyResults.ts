import type { QuestionType } from "@/types/models";

export interface ResultOption { id: string; position: number; label_ar: string; label_en: string; }

export interface ResultQuestion {
  id: string;
  type: QuestionType;
  position: number;
  title_ar: string;
  title_en: string;
  is_required: boolean;
  options: ResultOption[];
}

/** One entry per response, question, and chosen option. */
export interface ResultRow {
  response_id: string;
  question_id: string;
  option_id: string | null;
  rating: number | null;
  boolean_value: boolean | null;
  text_value: string | null;
}

export interface SurveyResultsPayload {
  total_responses: number;
  questions: ResultQuestion[];
  rows: ResultRow[];
}

export interface QuestionBreakdown {
  question: ResultQuestion;
  /** Distinct respondents, not answers. A multiple choice answer counts once. */
  respondentCount: number;
  /** Option id to the number of respondents that selected it. */
  choiceCounts: Record<string, number>;
  /** Index 0 holds the number of 1-star answers, through index 4 for 5 stars. */
  ratingCounts: number[];
  ratingAverage: number | null;
  yesCount: number;
  noCount: number;
  /** Distinct non-empty free text answers, in the order they were received. */
  texts: string[];
  /** Sum of all option selections. Exceeds respondentCount on multiple choice. */
  totalSelections: number;
}

const RATING_BUCKETS = 5;

export function buildBreakdowns(payload: SurveyResultsPayload): QuestionBreakdown[] {
  const breakdowns = new Map<string, QuestionBreakdown>();
  for (const question of payload.questions) {
    breakdowns.set(question.id, {
      question,
      respondentCount: 0,
      choiceCounts: {},
      ratingCounts: new Array<number>(RATING_BUCKETS).fill(0),
      ratingAverage: null,
      yesCount: 0,
      noCount: 0,
      texts: [],
      totalSelections: 0,
    });
  }

  // Respondents are tracked separately from selection counts. Counting rows
  // instead would inflate a multiple choice question, where one respondent
  // produces several rows.
  const respondents = new Map<string, Set<string>>();

  for (const row of payload.rows) {
    const entry = breakdowns.get(row.question_id);
    // An answer for a question that has since been deleted.
    if (!entry) continue;

    let seen = respondents.get(row.question_id);
    if (!seen) {
      seen = new Set<string>();
      respondents.set(row.question_id, seen);
    }
    seen.add(row.response_id);

    if (row.option_id) {
      entry.choiceCounts[row.option_id] = (entry.choiceCounts[row.option_id] ?? 0) + 1;
      entry.totalSelections += 1;
    }

    if (row.rating !== null && row.rating >= 1 && row.rating <= RATING_BUCKETS) {
      entry.ratingCounts[row.rating - 1] += 1;
    }

    // false is a real answer, so this cannot be a truthiness check.
    if (row.boolean_value !== null) {
      if (row.boolean_value) entry.yesCount += 1;
      else entry.noCount += 1;
    }

    const text = row.text_value?.trim();
    if (text && !entry.texts.includes(text)) entry.texts.push(text);
  }

  for (const [questionId, entry] of breakdowns) {
    entry.respondentCount = respondents.get(questionId)?.size ?? 0;
    const rated = entry.ratingCounts.reduce((sum, count) => sum + count, 0);
    entry.ratingAverage =
      rated === 0
        ? null
        : entry.ratingCounts.reduce((sum, count, index) => sum + count * (index + 1), 0) / rated;
  }

  return [...breakdowns.values()].sort((a, b) => a.question.position - b.question.position);
}

export function percent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}
