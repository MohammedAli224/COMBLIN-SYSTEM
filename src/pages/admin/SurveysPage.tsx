import { useEffect, useState } from "react";
import { ClipboardList, ExternalLink, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminSurveys, updateSurveyStatus } from "@/services/surveyService";
import type { Survey } from "@/types/models";

export default function SurveysPage() {
  const { t, i18n } = useTranslation();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [error, setError] = useState(false);
  const load = async () => { try { setSurveys(await getAdminSurveys()); } catch { setError(true); } };
  useEffect(() => { void load(); }, []);
  const setStatus = async (survey: Survey) => { try { await updateSurveyStatus(survey.id, survey.status === "published" ? "closed" : "published"); await load(); } catch { setError(true); } };
  const isArabic = i18n.language === "ar";
  return <div className="space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-2xl font-bold">{t("admin.surveyManagement")}</h2><p className="mt-1 text-muted-foreground">{t("admin.surveyIntro")}</p></div><Button asChild><Link to="/admin/surveys/new"><Plus className="size-4" />{t("admin.newSurvey")}</Link></Button></div>{error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{t("common.error")}</p>}{surveys.length === 0 ? <Card><CardContent className="p-10 text-center"><ClipboardList className="mx-auto mb-3 size-9 text-muted-foreground" /><p>{t("admin.noSurveys")}</p></CardContent></Card> : <div className="grid gap-4 lg:grid-cols-2">{surveys.map((survey) => <Card key={survey.id}><CardContent className="p-5"><div className="flex items-start justify-between gap-4"><div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${survey.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{t(`admin.${survey.status}`)}</span><h3 className="mt-3 text-lg font-bold">{isArabic ? survey.title_ar : survey.title_en}</h3><p className="mt-1 text-sm text-muted-foreground">{t(survey.response_policy === "open" ? "survey.openParticipation" : "survey.onePerEmployee")}</p></div><div className="text-center"><p className="text-2xl font-bold">{survey.response_count ?? 0}</p><p className="text-xs text-muted-foreground">{t("admin.totalResponses")}</p></div></div><div className="mt-5 flex flex-wrap gap-2"><Button size="sm" variant={survey.status === "published" ? "outline" : "default"} onClick={() => void setStatus(survey)}>{survey.status === "published" ? t("common.close") : t("admin.publishSurvey")}</Button>{survey.status === "published" && <Button asChild size="sm" variant="ghost"><a href={`/survey/${survey.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />{t("admin.openSurvey")}</a></Button>}</div></CardContent></Card>)}</div>}</div>;
}
