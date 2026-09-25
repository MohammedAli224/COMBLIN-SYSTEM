import { useEffect, useState } from "react";
import { Image, MessageSquareText, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFeedback, getFeedbackImageUrl } from "@/services/feedbackService";
import type { FeedbackRecord } from "@/types/models";

export default function FeedbackInboxPage() {
  const { t, i18n } = useTranslation();
  const [feedback, setFeedback] = useState<FeedbackRecord[]>([]);
  const [selected, setSelected] = useState<FeedbackRecord | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void getFeedback().then(setFeedback).catch(() => setError(true)).finally(() => setLoading(false)); }, []);
  const openAttachment = async (path: string) => { try { const url = await getFeedbackImageUrl(path); window.open(url, "_blank", "noopener,noreferrer"); } catch { setError(true); } };
  const formatDate = (value: string) => new Intl.DateTimeFormat(i18n.language === "ar" ? "ar" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

  return <div className="space-y-6"><div><h2 className="text-2xl font-bold">{t("admin.feedbackInbox")}</h2><p className="mt-1 text-muted-foreground">{t("admin.inboxIntro")}</p></div>{error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{t("common.error")}</p>}{loading ? <p className="text-muted-foreground">{t("common.loading")}</p> : feedback.length === 0 ? <Card><CardContent className="p-10 text-center"><MessageSquareText className="mx-auto mb-3 size-9 text-muted-foreground" /><p>{t("admin.noFeedback")}</p></CardContent></Card> : <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]"><Card className="overflow-hidden"><div className="divide-y">{feedback.map((item) => <button key={item.id} onClick={() => setSelected(item)} className={`w-full p-4 text-start transition hover:bg-muted/50 sm:p-5 ${selected?.id === item.id ? "bg-secondary/60" : ""}`}><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary">{item.department ? t(`feedback.departments.${item.department}`) : t("common.notSpecified")}</span><span className="text-xs text-muted-foreground">{formatDate(item.created_at)}</span></div><p className="line-clamp-2 text-sm leading-6">{item.description}</p></button>)}</div></Card><Card className="h-fit xl:sticky xl:top-24">{selected ? <><CardHeader><CardTitle>{t("admin.description")}</CardTitle><p className="text-xs text-muted-foreground">{formatDate(selected.created_at)}</p></CardHeader><CardContent className="space-y-5"><p className="whitespace-pre-wrap text-sm leading-7">{selected.description}</p><div className="rounded-xl bg-muted/50 p-4"><p className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground"><UserRound className="size-4" />{t("admin.identity")}</p><p className="text-sm">{selected.nurse_name || selected.employee_code ? [selected.nurse_name, selected.employee_code].filter(Boolean).join(" · ") : t("admin.anonymous")}</p></div>{selected.attachment_path && <Button variant="outline" className="w-full" onClick={() => void openAttachment(selected.attachment_path!)}><Image className="size-4" />{t("admin.viewImage")}</Button>}</CardContent></> : <CardContent className="p-10 text-center text-sm text-muted-foreground">{t("admin.recentFeedback")}</CardContent>}</Card></div>}</div>;
}
