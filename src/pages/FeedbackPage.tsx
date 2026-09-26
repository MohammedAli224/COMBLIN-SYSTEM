import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, ClipboardList, ImagePlus, Loader2, LockKeyhole, Send, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ErrorToast } from "@/components/ErrorToast";
import { PublicHeader } from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getPublishedSurveys } from "@/services/surveyService";
import { submitFeedback } from "@/services/feedbackService";
import { hasCompletedSurvey } from "@/lib/completedSurveys";
import type { Department, Survey } from "@/types/models";

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxImageBytes = 5 * 1024 * 1024;
const minDescriptionLength = 10;
const maxDescriptionLength = 1000;

export default function FeedbackPage() {
  const { t, i18n } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);
  // Synchronous guard: the disabled button alone cannot stop a second click
  // that lands before React commits the re-render.
  const submittingRef = useRef(false);
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState<Department | "">("");
  const [name, setName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [publishedSurveys, setPublishedSurveys] = useState<Survey[]>([]);

  useEffect(() => {
    void getPublishedSurveys().then(setPublishedSurveys).catch(() => {});
  }, []);

  const reset = () => {
    setDescription("");
    setDepartment("");
    setName("");
    setEmployeeCode("");
    setImage(null);
    setError("");
    setSubmitted(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  const rejectImage = (message: string) => {
    setImage(null);
    setError(message);
    // Clearing the input lets the nurse re-select the same file after fixing it.
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleImage = (file?: File) => {
    if (!file) return;
    if (!allowedImageTypes.includes(file.type)) {
      rejectImage(t("feedback.invalidImageType"));
      return;
    }
    if (file.size > maxImageBytes) {
      rejectImage(t("feedback.imageTooLarge"));
      return;
    }
    setImage(file);
    setError("");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) return;
    setError("");

    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      setError(t("feedback.descriptionRequired"));
      return;
    }
    if (trimmedDescription.length < minDescriptionLength) {
      setError(t("feedback.descriptionTooShort"));
      return;
    }
    if (trimmedDescription.length > maxDescriptionLength) {
      setError(t("feedback.descriptionTooLong"));
      return;
    }
    // Re-check the attachment in case state was set before a limit changed.
    if (image && (!allowedImageTypes.includes(image.type) || image.size > maxImageBytes)) {
      rejectImage(t("feedback.invalidImage"));
      return;
    }
    // All three identity fields or none. The database rejects a partial set
    // too, but stopping here saves the round trip and gives a clearer message.
    if (identityFilled > 0 && identityFilled < identityFieldCount) {
      setError(t("feedback.identityIncomplete"));
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("offline");
      await submitFeedback({ description: trimmedDescription, department, name, employeeCode, image });
      setSubmitted(true);
    } catch (submissionError) {
      const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
      // Supabase surfaces network failures as TypeError "Failed to fetch".
      const isNetworkError = isOffline || submissionError instanceof TypeError;
      setError(t(isNetworkError ? "feedback.offline" : "feedback.submitFailed"));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const dismissError = useCallback(() => setError(""), []);
  const descriptionLength = description.trim().length;
  const descriptionTooShort = descriptionLength > 0 && descriptionLength < minDescriptionLength;

  // Identity is all-or-nothing. 0 filled means anonymous, 3 means identified,
  // and anything in between is refused by both the form and the database.
  const identityFieldCount = 3;
  const identityFilled = [name.trim(), department, employeeCode.trim()].filter(Boolean).length;
  const identityPartial = identityFilled > 0 && identityFilled < identityFieldCount;

  // A one_per_employee survey this browser has already answered is hidden from
  // the list. Open surveys always stay, since answering twice is allowed.
  // The server still rejects a repeat; this only removes the card.
  const availableSurveys = useMemo(
    () => publishedSurveys.filter((survey) => survey.response_policy !== "one_per_employee" || !hasCompletedSurvey(survey.id)),
    [publishedSurveys],
  );

  const isArabic = i18n.language === "ar";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,hsl(var(--secondary)),transparent_35%)]">
      <PublicHeader />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        {availableSurveys.length > 0 && (
          <section className="mb-8 overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b bg-secondary/40 px-6 py-4">
              <ClipboardList className="size-5 text-primary" />
              <h2 className="text-lg font-bold">{t("survey.availableSurveys")}</h2>
            </div>
            <div className="grid gap-4 p-6 sm:grid-cols-2">
              {availableSurveys.map((survey) => {
                const title = isArabic ? survey.title_ar : survey.title_en;
                const descriptionText = isArabic ? survey.description_ar : survey.description_en;
                return (
                  <div key={survey.id} className="flex flex-col rounded-xl border bg-muted/30 p-5">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                        {t(survey.response_policy === "open" ? "survey.openParticipation" : "survey.onePerEmployee")}
                      </span>
                    </div>
                    <h3 className="text-base font-bold">{title}</h3>
                    {descriptionText && <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{descriptionText}</p>}
                    <div className="mt-auto pt-4">
                      <Button asChild className="w-full">
                        <Link to={`/survey/${survey.slug}`}>
                          {t("survey.takeSurvey")}
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        {submitted ? (
          <Card className="overflow-hidden text-center">
            <div className="h-2 bg-primary" />
            <CardContent className="px-6 py-12 sm:px-12">
              <span className="mx-auto mb-6 grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="size-8" />
              </span>
              <h1 className="text-2xl font-bold">{t("feedback.successTitle")}</h1>
              <p className="mx-auto mt-3 max-w-md text-muted-foreground">{t("feedback.successBody")}</p>
              <Button className="mt-8 w-full sm:w-auto" onClick={reset}>
                {t("feedback.another")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-6">
              <p className="mb-2 text-sm font-semibold text-primary">{t("feedback.eyebrow")}</p>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("feedback.title")}</h1>
              <p className="mt-3 max-w-xl leading-7 text-muted-foreground">{t("feedback.intro")}</p>
            </div>
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-primary/15 bg-secondary/65 p-4 text-sm text-secondary-foreground">
              <LockKeyhole className="mt-0.5 size-4 shrink-0" />
              <p>{t("feedback.privacy")}</p>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>{t("nav.feedback")}</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-6" onSubmit={handleSubmit} noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="description">
                      {t("feedback.description")} <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t("feedback.descriptionPlaceholder")}
                      minLength={minDescriptionLength}
                      maxLength={maxDescriptionLength}
                      aria-invalid={descriptionTooShort || undefined}
                      aria-describedby="description-counter"
                      required
                    />
                    <p
                      id="description-counter"
                      className={`text-end text-xs ${descriptionTooShort ? "font-semibold text-destructive" : "text-muted-foreground"}`}
                    >
                      {t("feedback.characterCount", { count: descriptionLength })}
                    </p>
                  </div>
                  <fieldset className="space-y-4 rounded-xl border border-dashed bg-muted/25 p-4">
                    <legend className="px-1 text-sm font-bold">{t("feedback.identitySection")}</legend>
                    <p className="text-xs leading-6 text-muted-foreground">{t("feedback.identityHelp")}</p>

                    <div className="space-y-2">
                      <Label htmlFor="name">{t("feedback.name")}</Label>
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={150}
                        autoComplete="name"
                        aria-invalid={identityPartial || undefined}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="employeeCode">{t("feedback.employeeCode")}</Label>
                      <Input
                        id="employeeCode"
                        value={employeeCode}
                        onChange={(e) => setEmployeeCode(e.target.value)}
                        maxLength={64}
                        autoComplete="off"
                        dir="ltr"
                        aria-invalid={identityPartial || undefined}
                      />
                      <p className="text-xs leading-6 text-muted-foreground">{t("feedback.employeeCodePrivacy")}</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="department">{t("feedback.department")}</Label>
                      <select
                        id="department"
                        className="h-11 w-full rounded-lg border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value as Department | "")}
                        aria-invalid={identityPartial || undefined}
                      >
                        <option value="">{t("feedback.selectDepartment")}</option>
                        <option value="critical">{t("feedback.departments.critical")}</option>
                        <option value="floor">{t("feedback.departments.floor")}</option>
                        <option value="ambulatory">{t("feedback.departments.ambulatory")}</option>
                      </select>
                    </div>
                  </fieldset>
                  <div className="space-y-2">
                    <Label htmlFor="image">
                      {t("feedback.attachment")} <span className="font-normal text-muted-foreground">({t("common.optional")})</span>
                    </Label>
                    <input ref={fileInput} id="image" type="file" className="sr-only" accept={allowedImageTypes.join(",")} onChange={(e) => handleImage(e.target.files?.[0])} />
                    {image ? (
                      <div className="flex items-center justify-between rounded-xl border bg-muted/50 p-3">
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-sm">{image.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {(image.size / (1024 * 1024)).toFixed(2)} MB / 5 MB
                          </span>
                        </span>
                        <Button type="button" variant="ghost" size="icon" aria-label={t("feedback.removeImage")} onClick={() => { setImage(null); if (fileInput.current) fileInput.current.value = ""; }}>
                          <X className="size-4" />
                        </Button>
                      </div>
                    ) : (
                      <button type="button" className="flex w-full flex-col items-center rounded-xl border border-dashed p-6 text-center transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => fileInput.current?.click()}>
                        <ImagePlus className="mb-2 size-6 text-primary" />
                        <span className="text-sm font-semibold text-primary">{t("feedback.chooseImage")}</span>
                        <span className="mt-1 text-xs text-muted-foreground">{t("feedback.attachmentHelp")}</span>
                      </button>
                    )}
                  </div>
                  <ErrorToast message={error || null} onDismiss={dismissError} dismissLabel={t("feedback.dismiss")} />
                  <Button type="submit" className="w-full" size="lg" disabled={submitting} aria-busy={submitting}>
                    {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    {submitting ? t("feedback.submitting") : t("feedback.submit")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}