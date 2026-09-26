/**
 * Remembers which one_per_employee surveys this browser has already answered,
 * so their cards can be hidden from the available list.
 *
 * Scope of this module, stated plainly because it is easy to over-trust:
 *
 *   This is a convenience, not a security control. It lives in one browser on
 *   one device. Clearing site data brings the card back, and a submission from
 *   another device is not reflected. Anyone determined to retake a survey can
 *   get the form back at any time.
 *
 *   The actual restriction is the unique index on
 *   survey_responses(survey_id, employee_code_hash) plus the duplicate check in
 *   submit_survey_response. That is enforced on the server and holds regardless
 *   of what this file says. Hiding the card removes the temptation, not the
 *   ability.
 *
 * Only surveys whose response_policy is one_per_employee are recorded. An open
 * survey may legitimately be answered more than once, so hiding it after one
 * submission would take away a capability the policy grants.
 */

const STORAGE_KEY = "nursing-pulse:completed-one-per-employee-surveys";

/**
 * Read the completed list defensively. localStorage throws in Safari private
 * mode and is simply absent during server rendering, and a corrupted value must
 * not break the page that renders the survey list.
 */
function readCompleted(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

export function hasCompletedSurvey(surveyId: string): boolean {
  return readCompleted().includes(surveyId);
}

export function markSurveyCompleted(surveyId: string): void {
  try {
    const completed = new Set(readCompleted());
    completed.add(surveyId);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...completed]));
  } catch {
    // Storage is unavailable. The submission still succeeded and the database
    // still refuses a second one, so failing quietly here is correct.
  }
}

/** Test and support hook: forget every recorded completion on this device. */
export function clearCompletedSurveys(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}
