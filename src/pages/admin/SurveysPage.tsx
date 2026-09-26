import { useEffect, useRef, useState } from "react";
import { BarChart3, ClipboardList, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { deleteSurvey, getAdminSurveys, updateSurveyStatus } from "@/services/surveyService";
import { errorMessage } from "@/lib/utils";
import type { Survey } from "@/types/models";

export default function SurveysPage() {
  const { t, i18n } = useTranslation();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  // Holds a ready-to-render string rather than a boolean, so a permission
  // failure can say something more useful than "something went wrong".
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Which survey is mid-confirmation, and which one is being removed. Kept
  // apart so the confirm strip does not reopen on the row that is deleting.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Synchronous guard: a disabled button cannot stop a second click that lands
  // before React commits the re-render.
  const deletingRef = useRef(false);

  const load = async () => {
    try {
      setSurveys(await getAdminSurveys());
      setError("");
    } catch (loadError) {
      console.error("getAdminSurveys failed:", loadError);
      setError(t("common.error"));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const setStatus = async (survey: Survey) => {
    try {
      await updateSurveyStatus(survey.id, survey.status === "published" ? "closed" : "published");
      await load();
    } catch (statusError) {
      console.error("updateSurveyStatus failed:", statusError);
      setError(t("common.error"));
    }
  };

  const confirmDelete = async (survey: Survey) => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeletingId(survey.id);
    try {
      const result = await deleteSurvey(survey.id);
      setConfirmingId(null);
      setError("");
      // Report what the server actually removed rather than the count that was
      // on screen, which may have been stale.
      setNotice(t("admin.surveyDeleted", { responses: result.responses, questions: result.questions }));
      await load();
    } catch (deleteError) {
      console.error("admin_delete_survey failed:", deleteError);
      const message = errorMessage(deleteError);
      setError(t(message.includes("not_authorized") ? "admin.deleteNotAuthorized" : "common.error"));
      setConfirmingId(null);
    } finally {
      deletingRef.current = false;
      setDeletingId(null);
    }
  };

  const isArabic = i18n.language === "ar";

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold">{t("admin.surveyManagement")}</h2>
          <p className="mt-1 text-muted-foreground">{t("admin.surveyIntro")}</p>
        </div>
        <Button asChild>
          <Link to="/admin/surveys/new">
            <Plus className="size-4" />
            {t("admin.newSurvey")}
          </Link>
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
          {notice}
        </p>
      )}

      {surveys.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <ClipboardList className="mx-auto mb-3 size-9 text-muted-foreground" />
            <p>{t("admin.noSurveys")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {surveys.map((survey) => {
            const isDeleting = deletingId === survey.id;
            const isConfirming = confirmingId === survey.id;
            return (
              <Card key={survey.id} className={isDeleting ? "opacity-60" : undefined}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          survey.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {t(`admin.${survey.status}`)}
                      </span>
                      <h3 className="mt-3 text-lg font-bold">{isArabic ? survey.title_ar : survey.title_en}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t(survey.response_policy === "open" ? "survey.openParticipation" : "survey.onePerEmployee")}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{survey.response_count ?? 0}</p>
                      <p className="text-xs text-muted-foreground">{t("admin.totalResponses")}</p>
                    </div>
                  </div>

                  {isConfirming && (
                    <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                      <p className="text-sm font-semibold text-destructive">{t("admin.deleteSurveyConfirm")}</p>
                      <p className="mt-1 text-xs leading-6 text-muted-foreground">
                        {(survey.response_count ?? 0) > 0
                          ? t("admin.deleteSurveyWithResponses", { total: survey.response_count ?? 0 })
                          : t("admin.deleteSurveyNoResponses")}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="destructive" disabled={isDeleting} onClick={() => void confirmDelete(survey)}>
                          {isDeleting ? t("common.loading") : t("admin.deleteSurveyConfirmAction")}
                        </Button>
                        <Button size="sm" variant="outline" disabled={isDeleting} onClick={() => setConfirmingId(null)}>
                          {t("common.cancel")}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={survey.status === "published" ? "outline" : "default"}
                      disabled={isDeleting}
                      onClick={() => void setStatus(survey)}
                    >
                      {survey.status === "published" ? t("common.close") : t("admin.publishSurvey")}
                    </Button>
                    {survey.status === "published" && (
                      <Button asChild size="sm" variant="ghost">
                        <Link to={`/survey/${survey.slug}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="size-4" />
                          {t("admin.openSurvey")}
                        </Link>
                      </Button>
                    )}
                    <Button asChild size="sm" variant="ghost">
                      <Link to={`/admin/surveys/${survey.id}/edit`}>
                        <Pencil className="size-4" />
                        {t("admin.editSurvey")}
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <Link to={`/admin/results?survey=${survey.id}`}>
                        <BarChart3 className="size-4" />
                        {t("admin.viewResults")}
                      </Link>
                    </Button>
                    {!isConfirming && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={isDeleting}
                        onClick={() => setConfirmingId(survey.id)}
                      >
                        <Trash2 className="size-4" />
                        {t("admin.deleteSurvey")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
