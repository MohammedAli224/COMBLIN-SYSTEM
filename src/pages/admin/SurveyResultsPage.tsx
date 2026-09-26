import { useEffect, useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { QuestionResultsCard } from "@/components/admin/QuestionResultsCard";
import { Card, CardContent } from "@/components/ui/card";
import { buildBreakdowns, type SurveyResultsPayload } from "@/lib/surveyResults";
import { getAdminSurveys, getSurveyResults } from "@/services/surveyService";
import type { Survey } from "@/types/models";

export default function SurveyResultsPage() {
  const { t, i18n } = useTranslation();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [surveyId, setSurveyId] = useState("");
  const [results, setResults] = useState<SurveyResultsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [error, setError] = useState(false);
  const isArabic = i18n.language === "ar";
  // Read as a string so it is a stable dependency; the searchParams object
  // itself is recreated on every render and would re-run the effect forever.
  const [searchParams] = useSearchParams();
  const requestedId = searchParams.get("survey");

  useEffect(() => {
    void getAdminSurveys()
      .then((rows) => {
        setSurveys(rows);
        const target =
          (requestedId ? rows.find((survey) => survey.id === requestedId) : undefined) ??
          // Otherwise open on the most recent survey that has responses, so
          // the page is not empty on arrival.
          rows.find((survey) => (survey.response_count ?? 0) > 0) ??
          rows[0];
        if (target) setSurveyId(target.id);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [requestedId]);

  useEffect(() => {
    if (!surveyId) return;
    let cancelled = false;
    setLoadingResults(true);
    void getSurveyResults(surveyId)
      .then((data) => {
        if (cancelled) return;
        setResults(data);
        setError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setResults(null);
      })
      .finally(() => { if (!cancelled) setLoadingResults(false); });
    return () => { cancelled = true; };
  }, [surveyId]);

  const breakdowns = useMemo(() => (results ? buildBreakdowns(results) : []), [results]);
  const selectedSurvey = surveys.find((survey) => survey.id === surveyId);
  const answeredQuestions = breakdowns.filter((entry) => entry.respondentCount > 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t("admin.resultsTitle")}</h2>
        <p className="mt-1 text-muted-foreground">{t("admin.resultsIntro")}</p>
      </div>

      {surveys.length > 0 && (
        <div className="max-w-md">
          <label htmlFor="results-survey" className="mb-2 block text-sm font-semibold">
            {t("admin.selectSurvey")}
          </label>
          <select
            id="results-survey"
            value={surveyId}
            onChange={(event) => setSurveyId(event.target.value)}
            className="h-11 w-full rounded-lg border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {surveys.map((survey) => (
              <option key={survey.id} value={survey.id}>
                {isArabic ? survey.title_ar : survey.title_en} ({survey.response_count ?? 0})
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{t("common.error")}</p>}

      {loading || loadingResults ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : surveys.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <BarChart3 className="mx-auto mb-3 size-9 text-muted-foreground" />
            <p>{t("admin.noSurveys")}</p>
          </CardContent>
        </Card>
      ) : !results ? null : results.total_responses === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <BarChart3 className="mx-auto mb-3 size-9 text-muted-foreground" />
            <p>{t("admin.noResults")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label={t("admin.totalResponses")} value={results.total_responses} />
            <StatTile label={t("admin.questionsCount")} value={breakdowns.length} />
            <StatTile label={t("admin.questionsAnswered")} value={answeredQuestions} />
          </div>

          {breakdowns.map((breakdown) => (
            <QuestionResultsCard key={breakdown.question.id} breakdown={breakdown} />
          ))}
        </>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-5 text-center">
        <p className="text-3xl font-bold tabular-nums">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
