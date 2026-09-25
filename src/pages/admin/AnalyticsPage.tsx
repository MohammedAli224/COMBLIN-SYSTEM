import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardMetrics, type DashboardMetrics } from "@/services/dashboardService";
import type { Department } from "@/types/models";

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  useEffect(() => { void getDashboardMetrics().then(setMetrics); }, []);
  const departments: Department[] = ["critical", "floor", "ambulatory"];
  const maximum = Math.max(1, ...(metrics ? Object.values(metrics.byDepartment) : [1]));

  return <div className="space-y-6">
    <div><h2 className="text-2xl font-bold">{t("admin.analyticsTitle")}</h2><p className="mt-1 text-muted-foreground">{t("admin.analyticsIntro")}</p></div>
    <Card><CardHeader><CardTitle>{t("admin.byDepartment")}</CardTitle></CardHeader><CardContent className="space-y-5">{departments.map((department) => {
      const count = metrics?.byDepartment[department] ?? 0;
      return <div key={department}><div className="mb-2 flex justify-between text-sm"><span>{t(`feedback.departments.${department}`)}</span><span className="font-bold">{count}</span></div><progress className="h-2 w-full overflow-hidden rounded-full accent-[hsl(var(--primary))]" max={maximum} value={count} /></div>;
    })}</CardContent></Card>
    <div className="flex items-center gap-3 rounded-xl border border-dashed bg-muted/35 p-4 text-sm text-muted-foreground"><Sparkles className="size-5 text-primary" /><span>{t("admin.aiDeferred")}</span></div>
  </div>;
}
