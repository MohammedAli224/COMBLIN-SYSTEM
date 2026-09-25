import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, ClipboardList, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { PublicHeader } from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getPublishedSurvey, submitSurveyResponse } from "@/services/surveyService";
import type { Survey, SurveyAnswerPayload, SurveyQuestion } from "@/types/models";

type AnswerValue = string | string[] | number | boolean;

export default function SurveyPage() {
  const { slug = "" } = useParams();
  const { t, i18n } = useTranslation();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [employeeCode, setEmployeeCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const isArabic = i18n.language === "ar";

  useEffect(() => { void getPublishedSurvey(slug).then(setSurvey).catch(() => setError(t("common.error"))).finally(() => setLoading(false)); }, [slug, t]);

  const hasAnswer = (question: SurveyQuestion) => {
    const answer = answers[question.id];
    if (Array.isArray(answer)) return answer.length > 0;
    if (typeof answer === "string") return answer.trim().length > 0;
    return answer !== undefined;
  };

  const toPayload = (question: SurveyQuestion): SurveyAnswerPayload | null => {
    const value = answers[question.id];
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return null;
    if (question.type === "single_choice") return { questionId: question.id, optionIds: [value as string] };
    if (question.type === "multiple_choice") return { questionId: question.id, optionIds: value as string[] };
    if (question.type === "rating") return { questionId: question.id, rating: value as number };
    if (question.type === "yes_no") return { questionId: question.id, booleanValue: value as boolean };
    return { questionId: question.id, textValue: value as string };
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!survey) return;
    if (survey.response_policy === "one_per_employee" && !employeeCode.trim()) { setError(t("survey.employeeCodeRequired")); return; }
    if (survey.survey_questions?.some((question) => question.is_required && !hasAnswer(question))) { setError(t("survey.requiredQuestion")); return; }
    setSubmitting(true);
    try {
      const payload = (survey.survey_questions ?? []).map(toPayload).filter((answer): answer is SurveyAnswerPayload => answer !== null);
      await submitSurveyResponse(survey.id, employeeCode, payload);
      setSubmitted(true);
    } catch (submissionError) {
      const message = submissionError instanceof Error ? submissionError.message : "";
      setError(message.includes("duplicate_response") ? t("survey.duplicate") : t("common.error"));
    } finally { setSubmitting(false); }
  };

  if (loading) return <><PublicHeader /><main className="grid min-h-[70vh] place-items-center text-muted-foreground">{t("common.loading")}</main></>;
  if (!survey) return <><PublicHeader /><main className="mx-auto max-w-xl px-4 py-16"><Card><CardContent className="p-10 text-center"><ClipboardList className="mx-auto mb-4 size-10 text-muted-foreground" /><h1 className="text-xl font-bold">{t("survey.unavailable")}</h1>{error && <p className="mt-3 text-sm text-destructive">{error}</p>}</CardContent></Card></main></>;
  if (submitted) return <><PublicHeader /><main className="mx-auto max-w-xl px-4 py-16"><Card><CardContent className="p-10 text-center"><CheckCircle2 className="mx-auto mb-5 size-14 text-emerald-600" /><h1 className="text-2xl font-bold">{t("survey.submitted")}</h1><p className="mt-2 text-muted-foreground">{t("survey.submittedBody")}</p></CardContent></Card></main></>;

  return <div className="min-h-screen"><PublicHeader /><main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12"><div className="mb-7"><p className="mb-2 text-sm font-semibold text-primary">{t("survey.title")}</p><h1 className="text-3xl font-bold">{isArabic ? survey.title_ar : survey.title_en}</h1>{(isArabic ? survey.description_ar : survey.description_en) && <p className="mt-3 leading-7 text-muted-foreground">{isArabic ? survey.description_ar : survey.description_en}</p>}<p className="mt-3 text-xs font-semibold text-primary">{t(survey.response_policy === "open" ? "survey.openParticipation" : "survey.onePerEmployee")}</p></div><form onSubmit={handleSubmit} className="space-y-5">
    {survey.response_policy === "one_per_employee" && <Card><CardContent className="p-5"><Label htmlFor="surveyEmployeeCode">{t("survey.employeeCode")} <span className="text-destructive">*</span></Label><Input id="surveyEmployeeCode" className="mt-2" value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} dir="ltr" maxLength={80} required /><p className="mt-2 text-xs text-muted-foreground">{t("survey.employeeCodeRequired")}</p></CardContent></Card>}
    {(survey.survey_questions ?? []).map((question, index) => <QuestionField key={question.id} question={question} index={index} value={answers[question.id]} onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))} isArabic={isArabic} />)}
    {error && <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
    <Button type="submit" size="lg" className="w-full" disabled={submitting}><Send className="size-4" />{submitting ? t("common.loading") : t("survey.submit")}</Button>
  </form></main></div>;
}

function QuestionField({ question, index, value, onChange, isArabic }: { question: SurveyQuestion; index: number; value: AnswerValue | undefined; onChange: (value: AnswerValue) => void; isArabic: boolean }) {
  const { t } = useTranslation();
  const title = isArabic ? question.title_ar : question.title_en;
  const toggleMultiple = (optionId: string) => { const selected = Array.isArray(value) ? value : []; onChange(selected.includes(optionId) ? selected.filter((id) => id !== optionId) : [...selected, optionId]); };
  return <Card><CardContent className="p-5 sm:p-6"><fieldset><legend className="mb-4 font-bold"><span className="me-2 text-primary">{index + 1}.</span>{title} {question.is_required && <span className="text-destructive">*</span>}</legend>
    {question.type === "free_text" && <Textarea value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} placeholder={t("survey.freeTextPlaceholder")} maxLength={5000} />}
    {question.type === "rating" && <div className="flex flex-wrap gap-2">{[1, 2, 3, 4, 5].map((rating) => <button type="button" key={rating} aria-label={t("survey.ratingLabel", { value: rating })} aria-pressed={value === rating} onClick={() => onChange(rating)} className={`grid size-11 place-items-center rounded-lg border font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${value === rating ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>{rating}</button>)}</div>}
    {question.type === "yes_no" && <div className="grid grid-cols-2 gap-3">{[true, false].map((choice) => <button type="button" key={String(choice)} aria-pressed={value === choice} onClick={() => onChange(choice)} className={`rounded-lg border p-3 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${value === choice ? "border-primary bg-secondary text-secondary-foreground" : "bg-card hover:bg-muted"}`}>{t(choice ? "survey.yes" : "survey.no")}</button>)}</div>}
    {(question.type === "single_choice" || question.type === "multiple_choice") && <div className="space-y-3">{question.type === "multiple_choice" && <p className="text-xs text-muted-foreground">{t("survey.multipleHint")}</p>}{question.survey_options.map((option) => { const checked = question.type === "single_choice" ? value === option.id : Array.isArray(value) && value.includes(option.id); return <label key={option.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${checked ? "border-primary bg-secondary/70" : "hover:bg-muted/50"}`}><input type={question.type === "single_choice" ? "radio" : "checkbox"} name={question.id} checked={checked} onChange={() => question.type === "single_choice" ? onChange(option.id) : toggleMultiple(option.id)} className="size-4 accent-[hsl(var(--primary))]" /><span>{isArabic ? option.label_ar : option.label_en}</span></label>; })}</div>}
  </fieldset></CardContent></Card>;
}
