import { AlertTriangle, BrainCircuit, FileText, Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SEVERITY_STYLES, type AiInsights, type DepartmentAlert, type ThemeCluster } from "@/lib/aiInsights";

/**
 * The AI insights hub, the primary workspace on the dashboard.
 *
 * It is the reason the application exists, so it sits directly under the KPI
 * row and takes the full width, with the operational charts demoted to a
 * supporting section below it.
 *
 * Every card here renders an explicit empty state, because there is no
 * pipeline behind them. That is a deliberate choice over skeleton placeholders:
 * a shimmering skeleton reads as "loading, results incoming", which would keep
 * promising data that does not exist. An empty state that says what the card
 * will eventually hold is honest, and it doubles as the design the pipeline
 * has to satisfy.
 */
export function AiInsightsHub({ insights }: { insights?: AiInsights | null }) {
  const { t } = useTranslation();
  const summary = insights?.summary ?? null;
  const themes = insights?.themes ?? [];
  const alerts = insights?.alerts ?? [];

  return (
    <section aria-labelledby="ai-hub-heading" className="space-y-4">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <BrainCircuit className="size-6" />
            </span>
            <div className="min-w-0">
              <h3 id="ai-hub-heading" className="text-xl font-bold">
                {t("admin.aiHubTitle")}
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("admin.aiHubIntro")}</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">
            {t("admin.aiHubStatus")}
          </span>
        </div>
      </div>

      {/* Full width: the summary is prose, and prose set at half width is hard
          to read. */}
      <SummaryCard summary={summary} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ThemesCard themes={themes} />
        <AlertsCard alerts={alerts} />
      </div>

      <p className="text-xs text-muted-foreground">{t("admin.aiDeferred")}</p>
    </section>
  );
}

function SummaryCard({ summary }: { summary: string | null }) {
  const { t } = useTranslation();
  return (
    <Card className="ring-1 ring-inset ring-primary/15">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <FileText className="size-4 text-primary" />
          {t("admin.aiSummaryTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {summary ? (
          // Rendered as text, never as HTML. The summary is generated output,
          // so it is untrusted input and dangerouslySetInnerHTML is not an
          // option here even when the pipeline lands.
          <p className="whitespace-pre-line text-sm leading-7">{summary}</p>
        ) : (
          <Pending message={t("admin.aiSummaryBody")} tall />
        )}
      </CardContent>
    </Card>
  );
}

function ThemesCard({ themes }: { themes: ThemeCluster[] }) {
  const { t } = useTranslation();
  return (
    <Card className="h-full ring-1 ring-inset ring-primary/15">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Layers className="size-4 text-primary" />
          {t("admin.aiThemesTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {themes.length === 0 ? (
          <Pending message={t("admin.aiThemesBody")} />
        ) : (
          <ul className="space-y-2.5">
            {themes.map((theme) => (
              <li
                key={theme.id}
                className="flex items-center justify-between gap-3 rounded-xl border p-3"
              >
                <span className="min-w-0 truncate text-sm font-medium">{theme.label}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs tabular-nums text-muted-foreground">{theme.mentions}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLES[theme.severity]}`}
                  >
                    {t(`admin.severity.${theme.severity}`)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AlertsCard({ alerts }: { alerts: DepartmentAlert[] }) {
  const { t } = useTranslation();
  return (
    <Card className="h-full ring-1 ring-inset ring-primary/15">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <AlertTriangle className="size-4 text-primary" />
          {t("admin.aiAlertsTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <Pending message={t("admin.aiAlertsBody")} />
        ) : (
          <ul className="space-y-2.5">
            {alerts.map((alert) => (
              <li key={alert.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">
                    {alert.department
                      ? t(`feedback.departments.${alert.department}`)
                      : t("admin.aiHospitalWide")}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLES[alert.severity]}`}
                  >
                    {t(`admin.severity.${alert.severity}`)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{alert.message}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Placeholder for a card with nothing to show. Dashed and muted so it reads as
 * an empty slot rather than as content that failed to load.
 */
function Pending({ message, tall = false }: { message: string; tall?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center rounded-xl border border-dashed bg-muted/20 px-4 text-center ${
        tall ? "py-16" : "py-10"
      }`}
    >
      <p className="text-sm leading-6 text-muted-foreground">{message}</p>
    </div>
  );
}
