import { useRef, useState, type FormEvent } from "react";
import { CheckCircle2, ImagePlus, LockKeyhole, Send, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PublicHeader } from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitFeedback } from "@/services/feedbackService";
import type { Department } from "@/types/models";

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxImageBytes = 5 * 1024 * 1024;

export default function FeedbackPage() {
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState<Department | "">("");
  const [nurseName, setNurseName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setDescription(""); setDepartment(""); setNurseName(""); setEmployeeCode(""); setImage(null); setError(""); setSubmitted(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleImage = (file?: File) => {
    if (!file) return;
    if (!allowedImageTypes.includes(file.type) || file.size > maxImageBytes) { setError(t("feedback.invalidImage")); return; }
    setImage(file); setError("");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!description.trim()) { setError(t("feedback.descriptionRequired")); return; }
    setSubmitting(true);
    try {
      await submitFeedback({ description, department, nurseName, employeeCode, image });
      setSubmitted(true);
    } catch {
      setError(t("feedback.submitFailed"));
    } finally { setSubmitting(false); }
  };

  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,hsl(var(--secondary)),transparent_35%)]">
    <PublicHeader />
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      {submitted ? <Card className="overflow-hidden text-center"><div className="h-2 bg-primary" /><CardContent className="px-6 py-12 sm:px-12"><span className="mx-auto mb-6 grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 className="size-8" /></span><h1 className="text-2xl font-bold">{t("feedback.successTitle")}</h1><p className="mx-auto mt-3 max-w-md text-muted-foreground">{t("feedback.successBody")}</p><Button className="mt-8 w-full sm:w-auto" onClick={reset}>{t("feedback.another")}</Button></CardContent></Card> : <>
        <div className="mb-6"><p className="mb-2 text-sm font-semibold text-primary">{t("feedback.eyebrow")}</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("feedback.title")}</h1><p className="mt-3 max-w-xl leading-7 text-muted-foreground">{t("feedback.intro")}</p></div>
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-primary/15 bg-secondary/65 p-4 text-sm text-secondary-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0" /><p>{t("feedback.privacy")}</p></div>
        <Card><CardHeader><CardTitle>{t("nav.feedback")}</CardTitle></CardHeader><CardContent><form className="space-y-6" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2"><Label htmlFor="description">{t("feedback.description")} <span className="text-destructive">*</span></Label><Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("feedback.descriptionPlaceholder")} maxLength={5000} required /><p className="text-end text-xs text-muted-foreground">{description.length}/5000</p></div>
          <div className="space-y-2"><Label htmlFor="department">{t("feedback.department")} <span className="font-normal text-muted-foreground">({t("common.optional")})</span></Label><select id="department" className="h-11 w-full rounded-lg border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={department} onChange={(e) => setDepartment(e.target.value as Department | "")}><option value="">{t("feedback.selectDepartment")}</option><option value="critical">{t("feedback.departments.critical")}</option><option value="floor">{t("feedback.departments.floor")}</option><option value="ambulatory">{t("feedback.departments.ambulatory")}</option></select></div>
          <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="name">{t("feedback.name")} <span className="font-normal text-muted-foreground">({t("common.optional")})</span></Label><Input id="name" value={nurseName} onChange={(e) => setNurseName(e.target.value)} maxLength={150} /></div><div className="space-y-2"><Label htmlFor="employeeCode">{t("feedback.employeeCode")} <span className="font-normal text-muted-foreground">({t("common.optional")})</span></Label><Input id="employeeCode" value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} maxLength={80} dir="ltr" /></div></div>
          <div className="space-y-2"><Label htmlFor="image">{t("feedback.attachment")} <span className="font-normal text-muted-foreground">({t("common.optional")})</span></Label><input ref={fileInput} id="image" type="file" className="sr-only" accept={allowedImageTypes.join(",")} onChange={(e) => handleImage(e.target.files?.[0])} />{image ? <div className="flex items-center justify-between rounded-xl border bg-muted/50 p-3"><span className="truncate text-sm">{image.name}</span><Button type="button" variant="ghost" size="icon" aria-label={t("feedback.removeImage")} onClick={() => { setImage(null); if (fileInput.current) fileInput.current.value = ""; }}><X className="size-4" /></Button></div> : <button type="button" className="flex w-full flex-col items-center rounded-xl border border-dashed p-6 text-center transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => fileInput.current?.click()}><ImagePlus className="mb-2 size-6 text-primary" /><span className="text-sm font-semibold text-primary">{t("feedback.chooseImage")}</span><span className="mt-1 text-xs text-muted-foreground">{t("feedback.attachmentHelp")}</span></button>}</div>
          {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={submitting}><Send className="size-4" />{submitting ? t("feedback.submitting") : t("feedback.submit")}</Button>
        </form></CardContent></Card>
      </>}
    </main>
  </div>;
}
