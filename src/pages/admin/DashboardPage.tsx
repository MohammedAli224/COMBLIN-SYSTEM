import { useEffect, useState } from "react";
import { ClipboardCheck, FileText, MessageSquareText, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { getDashboardMetrics, type DashboardMetrics } from "@/services/dashboardService";

export default function DashboardPage() {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { void getDashboardMetrics().then(setMetrics).catch(() => setError(true)); }, []);
  const cards = [
    { label: t("admin.totalFeedback"), value: metrics?.feedbackTotal, icon: MessageSquareText },
    { label: t("admin.thisMonth"), value: metrics?.feedbackThisMonth, icon: TrendingUp },
    { label: t("admin.activeSurveys"), value: metrics?.activeSurveys, icon: ClipboardCheck },
    { label: t("admin.totalResponses"), value: metrics?.responsesTotal, icon: FileText },
  ];
  return <div className="space-y-6"><div><h2 className="text-2xl font-bold">{t("admin.welcome")}</h2><p className="mt-1 text-muted-foreground">{t("admin.overview")}</p></div>{error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{t("common.error")}</p>}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, icon: Icon }) => <Card key={label}><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold">{value ?? "—"}</p></div><span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary"><Icon className="size-5" /></span></CardContent></Card>)}</div></div>;
}
