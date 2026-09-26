import { useEffect, useState } from "react";
import { ClipboardCheck, FileText, MessageSquareText, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiInsightsHub } from "@/components/admin/AiInsightsHub";
import {
  DepartmentBars,
  FeedbackTrendChart,
  IdentitySplit,
} from "@/components/admin/AnalyticsCharts";
import { getDashboardMetrics, type DashboardMetrics } from "@/services/dashboardService";

/**
 * The single admin landing page, in priority order.
 *
 *   1. KPI row. Orientation only, four numbers to answer "is anything wrong".
 *   2. AI insights hub. The reason the application exists, so it sits directly
 *      under the KPI row and takes the full width. Its prominence comes from
 *      the gradient panel, the primary-tinted icon and the primary ring on its
 *      cards rather than from a larger heading: the welcome banner above stays
 *      the largest text on the page, and a section should not outrank its own
 *      page title. Its cards also out-title the analytics cards below.
 *   3. Operational analytics. Supporting evidence for the insights above, not
 *      the headline. Deliberately the quietest section on the page.
 *
 * This absorbs what used to be the separate Analytics route, and the insight
 * placeholder that used to sit at the bottom, which is now the centrepiece.
 */
export default function DashboardPage() {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    void getDashboardMetrics()
      .then(setMetrics)
      .catch((loadError) => {
        console.error("getDashboardMetrics failed:", loadError);
        setError(true);
      });
  }, []);

  const statCards = [
    { label: t("admin.totalFeedback"), value: metrics?.feedbackTotal, icon: MessageSquareText },
    { label: t("admin.thisMonth"), value: metrics?.feedbackThisMonth, icon: TrendingUp },
    { label: t("admin.activeSurveys"), value: metrics?.activeSurveys, icon: ClipboardCheck },
    { label: t("admin.totalResponses"), value: metrics?.responsesTotal, icon: FileText },
  ];

  const feedbackTotal = metrics?.feedbackTotal ?? 0;
  const trendSeries = metrics?.feedbackByDay ?? [];
  const windowDays = metrics?.windowDays ?? 30;
  const trendTotal = trendSeries.reduce((sum, point) => sum + point.total, 0);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">{t("admin.welcome")}</h2>
        <p className="mt-1 text-muted-foreground">{t("admin.overview")}</p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {t("common.error")}
        </p>
      )}

      {/* 1. KPI row */}
      <section aria-label={t("admin.overview")} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-3xl font-bold tabular-nums">{value ?? "—"}</p>
              </div>
              <span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary">
                <Icon className="size-5" />
              </span>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* 2. AI insights hub, the primary workspace */}
      <AiInsightsHub />

      {/* 3. Operational analytics, supporting the insights above */}
      <section aria-labelledby="analytics-heading" className="space-y-4">
        <div>
          <h3 id="analytics-heading" className="text-lg font-semibold text-muted-foreground">
            {t("admin.analyticsTitle")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("admin.operationalIntro")}</p>
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold">{t("admin.trendTitle")}</CardTitle>
            <div className="text-end">
              <p className="text-2xl font-bold tabular-nums leading-none">{trendTotal}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("admin.trendPeriod", { days: windowDays })}</p>
            </div>
          </CardHeader>
          <CardContent>
            <FeedbackTrendChart series={trendSeries} windowDays={windowDays} />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">{t("admin.byDepartment")}</CardTitle>
            </CardHeader>
            <CardContent>
              <DepartmentBars
                counts={metrics?.byDepartment ?? { critical: 0, floor: 0, ambulatory: 0 }}
                total={feedbackTotal}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">{t("admin.identityBreakdown")}</CardTitle>
            </CardHeader>
            <CardContent>
              <IdentitySplit
                identity={metrics?.identity ?? { identified: 0, anonymous: 0, incomplete: 0 }}
                total={feedbackTotal}
              />
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
