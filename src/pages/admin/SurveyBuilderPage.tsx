import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createSurvey, getAdminSurvey, updateSurvey } from "@/services/surveyService";
import { errorMessage } from "@/lib/utils";
import type { QuestionDraft, QuestionType, Survey, SurveyDraft } from "@/types/models";

const blankQuestion = (): QuestionDraft => ({
  type: "single_choice",
  title_ar: "",
  title_en: "",
  is_required: true,
  options: [{ label_ar: "", label_en: "" }, { label_ar: "", label_en: "" }],
});

const blankDraft = (): SurveyDraft => ({
  title_ar: "",
  title_en: "",
  description_ar: "",
  description_en: "",
  slug: "",
  response_policy: "open",
  questions: [blankQuestion()],
});

const choiceTypes: QuestionType[] = ["single_choice", "multiple_choice"];
const questionTypes: QuestionType[] = ["single_choice", "multiple_choice", "rating", "yes_no", "free_text"];
const typeKeys: Record<QuestionType, string> = {
  single_choice: "admin.singleChoice",
  multiple_choice: "admin.multipleChoice",
  rating: "admin.rating",
  yes_no: "admin.yesNo",
  free_text: "admin.freeText",
};

/**
 * Existing survey to editor state. The ids are carried through so the save
 * updates those rows instead of replacing them, which is what keeps recorded
 * answers attached to the question they were given for.
 */
function toDraft(survey: Survey): SurveyDraft {
  return {
    title_ar: survey.title_ar,
    title_en: survey.title_en,
    description_ar: survey.description_ar ?? "",
    description_en: survey.description_en ?? "",
    slug: survey.slug,
    response_policy: survey.response_policy,
    questions: (survey.survey_questions ?? []).map((question) => ({
      id: question.id,
      type: question.type,
      title_ar: question.title_ar,
      title_en: question.title_en,
      is_required: question.is_required,
      options: (question.survey_options ?? []).map((option) => ({
        id: option.id,
        label_ar: option.label_ar,
        label_en: option.label_en,
      })),
    })),
  };
}

/**
 * Maps a database rejection onto a translation key.
 *
 * The two "has answers" cases are the ones that need explaining rather than
 * just reporting: the admin asked for something the database refused in order
 * to protect responses that already exist.
 *
 * The RPC signals every rejection as a bare token in the exception message, so
 * these are substring tests rather than an exact match. The ordering matters
 * only in that the specific tokens have to be tested ahead of the generic
 * validation fallback below.
 */
function saveErrorKey(message: string): string {
  if (message.includes("question_has_answers")) return "admin.questionHasAnswers";
  if (message.includes("option_has_answers")) return "admin.optionHasAnswers";
  if (message.includes("not_authorized")) return "auth.notAuthorized";
  if (message.includes("too_few_options")) return "admin.tooFewOptions";
  if (message.includes("invalid_") || message.includes("_not_in_")) return "admin.formInvalid";
  return "common.error";
}

/**
 * Builder for both creating and editing a survey.
 *
 * Mounted at /admin/surveys/new and /admin/surveys/:id/edit. The presence of
 * the route id decides which, so the two flows share one form instead of
 * drifting apart.
 */
export default function SurveyBuilderPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { t } = useTranslation();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<SurveyDraft>(blankDraft);
  const [responseCount, setResponseCount] = useState(0);
  const [loading, setLoading] = useState(isEdit);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    getAdminSurvey(id)
      .then((survey) => {
        if (!active) return;
        if (!survey) {
          setLoadFailed(true);
          return;
        }
        setDraft(toDraft(survey));
        setResponseCount(survey.response_count ?? 0);
      })
      .catch((loadError) => {
        console.error("getAdminSurvey failed:", loadError);
        if (active) setLoadFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    // Without the guard, navigating between two edit routes can resolve the
    // first request last and overwrite the second survey's form.
    return () => {
      active = false;
    };
  }, [id]);

  const updateQuestion = (index: number, update: Partial<QuestionDraft>) =>
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...update } : question,
      ),
    }));

  /**
   * Every option edit goes through the functional form. Building the new options
   * array out of `draft` would capture the value from the render that created
   * the handler, so two updates landing in the same batch would have the second
   * overwrite the first instead of building on it.
   */
  const updateOptions = (
    questionIndex: number,
    change: (options: QuestionDraft["options"]) => QuestionDraft["options"],
  ) =>
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, index) =>
        index === questionIndex ? { ...question, options: change(question.options) } : question,
      ),
    }));

  const updateOption = (
    questionIndex: number,
    optionIndex: number,
    field: "label_ar" | "label_en",
    value: string,
  ) =>
    updateOptions(questionIndex, (options) =>
      options.map((option, index) => (index === optionIndex ? { ...option, [field]: value } : option)),
    );

  const addOption = (questionIndex: number) =>
    updateOptions(questionIndex, (options) => [...options, { label_ar: "", label_en: "" }]);

  const removeOption = (questionIndex: number, optionIndex: number) =>
    updateOptions(questionIndex, (options) => options.filter((_, index) => index !== optionIndex));

  const valid = Boolean(
    draft.title_ar.trim() &&
      draft.title_en.trim() &&
      draft.questions.length > 0 &&
      draft.questions.every(
        (question) =>
          question.title_ar.trim() &&
          question.title_en.trim() &&
          (!choiceTypes.includes(question.type) ||
            (question.options.length >= 2 &&
              question.options.every((option) => option.label_ar.trim() && option.label_en.trim()))),
      ),
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!valid) {
      setError(t("admin.formInvalid"));
      return;
    }
    if (!id && !session) {
      setError(t("common.error"));
      return;
    }
    setSaving(true);
    try {
      if (id) {
        await updateSurvey(id, draft);
      } else if (session) {
        await createSurvey(draft, session.user.id);
      }
      navigate("/admin/surveys");
    } catch (saveError) {
      console.error("survey save failed:", saveError);
      setError(t(saveErrorKey(errorMessage(saveError))));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="p-8 text-muted-foreground">{t("common.loading")}</p>;
  }

  if (loadFailed) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Button asChild variant="ghost" size="icon">
          <Link to="/admin/surveys" aria-label={t("common.back")}>
            <ArrowLeft className="size-5 rtl:rotate-180" />
          </Link>
        </Button>
        <p role="alert" className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
          {t("admin.surveyNotFound")}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/admin/surveys" aria-label={t("common.back")}>
            <ArrowLeft className="size-5 rtl:rotate-180" />
          </Link>
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{t(isEdit ? "admin.editSurvey" : "admin.newSurvey")}</h2>
          <p className="text-sm text-muted-foreground">
            {t(isEdit ? "admin.editSurveyIntro" : "admin.surveyIntro")}
          </p>
        </div>
      </div>

      {isEdit && responseCount > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {t("admin.editWithResponses", { total: responseCount })}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.surveyDetails")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label={t("admin.surveyTitleAr")}>
            <Input value={draft.title_ar} onChange={(e) => setDraft({ ...draft, title_ar: e.target.value })} dir="rtl" />
          </Field>
          <Field label={t("admin.surveyTitleEn")}>
            <Input value={draft.title_en} onChange={(e) => setDraft({ ...draft, title_en: e.target.value })} dir="ltr" />
          </Field>
          <Field label={t("admin.surveyDescriptionAr")}>
            <Textarea value={draft.description_ar} onChange={(e) => setDraft({ ...draft, description_ar: e.target.value })} dir="rtl" />
          </Field>
          <Field label={t("admin.surveyDescriptionEn")}>
            <Textarea value={draft.description_en} onChange={(e) => setDraft({ ...draft, description_en: e.target.value })} dir="ltr" />
          </Field>
          <Field label={t("admin.responsePolicy")}>
            <select
              className="h-11 w-full rounded-lg border bg-card px-3"
              value={draft.response_policy}
              onChange={(e) => setDraft({ ...draft, response_policy: e.target.value as SurveyDraft["response_policy"] })}
            >
              <option value="open">{t("survey.openParticipation")}</option>
              <option value="one_per_employee">{t("survey.onePerEmployee")}</option>
            </select>
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold">{t("admin.questions")}</h3>
        <Button type="button" variant="outline" size="sm" onClick={() => setDraft({ ...draft, questions: [...draft.questions, blankQuestion()] })}>
          <Plus className="size-4" />
          {t("admin.addQuestion")}
        </Button>
      </div>

      {draft.questions.map((question, questionIndex) => (
        <Card key={question.id ?? questionIndex}>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{questionIndex + 1}</CardTitle>
            {draft.questions.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("admin.remove")}
                onClick={() =>
                  setDraft({ ...draft, questions: draft.questions.filter((_, index) => index !== questionIndex) })
                }
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t("admin.questionAr")}>
                <Input value={question.title_ar} onChange={(e) => updateQuestion(questionIndex, { title_ar: e.target.value })} dir="rtl" />
              </Field>
              <Field label={t("admin.questionEn")}>
                <Input value={question.title_en} onChange={(e) => updateQuestion(questionIndex, { title_en: e.target.value })} dir="ltr" />
              </Field>
              <Field label={t("admin.questionType")}>
                <select
                  className="h-11 w-full rounded-lg border bg-card px-3"
                  value={question.type}
                  onChange={(e) => updateQuestion(questionIndex, { type: e.target.value as QuestionType })}
                >
                  {questionTypes.map((type) => (
                    <option value={type} key={type}>
                      {t(typeKeys[type])}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-3 self-end rounded-lg border p-3 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={question.is_required}
                  onChange={(e) => updateQuestion(questionIndex, { is_required: e.target.checked })}
                  className="size-4 accent-[hsl(var(--primary))]"
                />
                {t("common.required")}
              </label>
            </div>

            {choiceTypes.includes(question.type) && (
              <div className="space-y-3">
                <Label>{t("admin.options")}</Label>
                {question.options.map((option, optionIndex) => (
                  <div key={option.id ?? optionIndex} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <Input
                      value={option.label_ar}
                      onChange={(e) => updateOption(questionIndex, optionIndex, "label_ar", e.target.value)}
                      placeholder={t("admin.optionAr")}
                      dir="rtl"
                    />
                    <Input
                      value={option.label_en}
                      onChange={(e) => updateOption(questionIndex, optionIndex, "label_en", e.target.value)}
                      placeholder={t("admin.optionEn")}
                      dir="ltr"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("admin.remove")}
                      disabled={question.options.length <= 2}
                      onClick={() => removeOption(questionIndex, optionIndex)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => addOption(questionIndex)}>
                  <Plus className="size-4" />
                  {t("admin.addOption")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="safe-bottom flex justify-end">
        <Button type="submit" size="lg" disabled={saving || !valid}>
          <Save className="size-4" />
          {saving
            ? t(isEdit ? "admin.savingSurvey" : "admin.creatingSurvey")
            : t(isEdit ? "admin.saveSurvey" : "admin.createSurvey")}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
