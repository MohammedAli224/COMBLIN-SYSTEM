import { useEffect, useMemo, useRef, useState } from "react";
import { Image, MessageSquareText, Trash2, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteFeedback, deleteFeedbackBulk, getFeedback, getFeedbackImageUrl, type FeedbackRange } from "@/services/feedbackService";
import type { FeedbackRecord } from "@/types/models";

const RANGE_OPTIONS: { value: FeedbackRange; label: string }[] = [
  { value: "24h", label: "admin.range24h" },
  { value: "week", label: "admin.rangeWeek" },
  { value: "month", label: "admin.rangeMonth" },
  { value: "all", label: "admin.rangeAll" },
];

export default function FeedbackInboxPage() {
  const { t, i18n } = useTranslation();
  const [range, setRange] = useState<FeedbackRange>("all");
  const [feedback, setFeedback] = useState<FeedbackRecord[]>([]);
  const [selected, setSelected] = useState<FeedbackRecord | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [confirmingBulk, setConfirmingBulk] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const bulkDeletingRef = useRef(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getFeedback(range)
      .then((rows) => {
        if (cancelled) return;
        setFeedback(rows);
        // A narrower window can drop the open record. Close the panel rather
        // than showing details for something no longer in the list.
        setSelected((current) => (current && rows.some((row) => row.id === current.id) ? current : null));
        // Selection only ever covers what the admin can see. Without this, a
        // selection made before a filter change would still delete records
        // that are no longer listed, which is not what "Delete Selected" says.
        setChecked((current) => {
          const visible = new Set(rows.map((row) => row.id));
          const next = new Set([...current].filter((id) => visible.has(id)));
          return next.size === current.size ? current : next;
        });
        setConfirmingBulk(false);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  // Selection is reconciled to the visible list on every fetch, so comparing
  // sizes is enough to know whether everything on screen is ticked.
  const allVisibleChecked = feedback.length > 0 && checked.size === feedback.length;

  useEffect(() => {
    // React has no prop for the indeterminate state, so it is set on the node.
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = checked.size > 0 && !allVisibleChecked;
    }
  }, [checked.size, allVisibleChecked]);

  const toggleOne = (id: string) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirmingBulk(false);
  };

  const toggleAll = () => {
    setChecked((current) => (current.size === feedback.length ? new Set() : new Set(feedback.map((row) => row.id))));
    setConfirmingBulk(false);
  };

  const clearSelection = () => {
    setChecked(new Set());
    setConfirmingBulk(false);
  };

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const openAttachment = async (path: string) => {
    try {
      const url = await getFeedbackImageUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError(true);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(false);
    try {
      await deleteFeedback(id);
      setFeedback((rows) => rows.filter((row) => row.id !== id));
      setChecked((current) => {
        if (!current.has(id)) return current;
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      setSelected((current) => (current?.id === id ? null : current));
      setPendingDeleteId(null);
      setNotice(t("admin.feedbackDeleted"));
    } catch {
      setError(true);
      setPendingDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...checked];
    if (ids.length === 0 || bulkDeletingRef.current) return;

    // Synchronous guard, matching submittingRef in FeedbackPage: two clicks
    // dispatched before the re-render would both pass a state check.
    bulkDeletingRef.current = true;
    setBulkDeleting(true);
    setError(false);
    try {
      const deleted = await deleteFeedbackBulk(ids);
      if (deleted === 0) {
        // Nothing matched. The rows were already gone, so the list and the
        // selection are refreshed from the server rather than guessed at.
        setError(true);
        setChecked(new Set());
        setConfirmingBulk(false);
        const rows = await getFeedback(range);
        setFeedback(rows);
        return;
      }
      const removed = new Set(ids);
      setFeedback((rows) => rows.filter((row) => !removed.has(row.id)));
      setChecked(new Set());
      setConfirmingBulk(false);
      setSelected((current) => (current && removed.has(current.id) ? null : current));
      setNotice(t("admin.feedbackDeletedCount", { total: deleted }));
    } catch {
      setError(true);
      setConfirmingBulk(false);
    } finally {
      bulkDeletingRef.current = false;
      setBulkDeleting(false);
    }
  };

  // Built once per language. Constructing a formatter per call is expensive,
  // and every row re-renders on each checkbox toggle.
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === "ar" ? "ar" : "en", { dateStyle: "medium", timeStyle: "short" }),
    [i18n.language],
  );

  const formatDate = (value: string) => dateFormatter.format(new Date(value));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t("admin.feedbackInbox")}</h2>
        <p className="mt-1 text-muted-foreground">{t("admin.inboxIntro")}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("admin.filterByPeriod")}>
          {RANGE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={range === option.value ? "default" : "outline"}
              aria-pressed={range === option.value}
              onClick={() => setRange(option.value)}
            >
              {t(option.label)}
            </Button>
          ))}
        </div>
        {!loading && feedback.length > 0 && (
          <p className="text-sm text-muted-foreground">{t("admin.showingCount", { total: feedback.length })}</p>
        )}
      </div>

      {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{t("common.error")}</p>}
      {notice && (
        <p role="status" aria-live="polite" className="rounded-lg bg-primary/10 p-3 text-sm text-primary">
          {notice}
        </p>
      )}

      {!loading && feedback.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/40 p-3">
          {confirmingBulk ? (
            <>
              <p className="flex-1 text-sm font-semibold text-destructive">
                {t("admin.deleteSelectedConfirm", { total: checked.size })}
              </p>
              <Button type="button" size="sm" variant="destructive" disabled={bulkDeleting} onClick={() => void handleBulkDelete()}>
                {bulkDeleting ? t("common.loading") : t("admin.deleteConfirmAction")}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={bulkDeleting} onClick={() => setConfirmingBulk(false)}>
                {t("common.cancel")}
              </Button>
            </>
          ) : (
            <>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleChecked}
                  onChange={toggleAll}
                  className="size-4 accent-primary"
                />
                {t("admin.selectAll")}
              </label>
              {checked.size > 0 && (
                <>
                  <span className="text-sm text-muted-foreground">{t("admin.selectedCount", { total: checked.size })}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={clearSelection}>
                    {t("admin.clearSelection")}
                  </Button>
                </>
              )}
              <div className="ms-auto">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={checked.size === 0 || bulkDeleting}
                  onClick={() => setConfirmingBulk(true)}
                >
                  <Trash2 className="size-4" />
                  {t("admin.deleteSelected")} ({checked.size})
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : feedback.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <MessageSquareText className="mx-auto mb-3 size-9 text-muted-foreground" />
            <p>{range === "all" ? t("admin.noFeedback") : t("admin.noFeedbackInRange")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <Card className="overflow-hidden">
            <div className="divide-y">
              {feedback.map((item) => {
                const isPending = pendingDeleteId === item.id;
                const isDeleting = deletingId === item.id;
                const isChecked = checked.has(item.id);
                return (
                  <div key={item.id} className={selected?.id === item.id ? "bg-secondary/60" : undefined}>
                    <div className="flex items-start gap-3 p-4 transition hover:bg-muted/50 sm:p-5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOne(item.id)}
                        aria-label={t("admin.selectFeedback", { date: formatDate(item.created_at) })}
                        className="mt-1 size-4 shrink-0 cursor-pointer accent-primary"
                      />
                      {/* A sibling of the checkbox, not a parent: nesting a
                          button inside a button is invalid HTML. */}
                      <button
                        type="button"
                        onClick={() => setSelected(item)}
                        aria-pressed={selected?.id === item.id}
                        className="flex-1 text-start"
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {item.department && (
                              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary">
                                {t(`feedback.departments.${item.department}`)}
                              </span>
                            )}
                            {item.employee_code && (
                              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                                {t("admin.identified")}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{formatDate(item.created_at)}</span>
                        </div>
                        <p className="line-clamp-2 text-sm leading-6">{item.description}</p>
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-border/50 px-3 py-2">
                      {isPending ? (
                        <>
                          <p className="flex-1 text-xs font-semibold text-destructive">{t("admin.deleteConfirm")}</p>
                          <Button type="button" size="sm" variant="destructive" disabled={isDeleting} onClick={() => void handleDelete(item.id)}>
                            {isDeleting ? t("common.loading") : t("admin.deleteConfirmAction")}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" disabled={isDeleting} onClick={() => setPendingDeleteId(null)}>
                            {t("common.cancel")}
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setPendingDeleteId(item.id)}
                        >
                          <Trash2 className="size-4" />
                          {t("admin.deleteFeedback")}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="h-fit xl:sticky xl:top-24">
            {selected ? (
              <>
                <CardHeader>
                  <CardTitle>{t("admin.description")}</CardTitle>
                  <p className="text-xs text-muted-foreground">{formatDate(selected.created_at)}</p>
                </CardHeader>
                <CardContent className="space-y-5">
                  <p className="whitespace-pre-wrap text-sm leading-7">{selected.description}</p>
                  <div className="rounded-xl bg-muted/50 p-4">
                    <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <UserRound className="size-4" />
                      {t("admin.identity")}
                    </p>
                    {selected.name ? (
                      /* All three fields are set together or not at all, so
                         name is a sufficient test for an identified sender. */
                      <dl className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-xs text-muted-foreground">{t("admin.name")}</dt>
                          <dd className="font-semibold">{selected.name}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">{t("admin.employeeCode")}</dt>
                          {/* Codes are latin, so this stays left to right inside
                              the right to left panel. */}
                          <dd dir="ltr" className="text-start font-mono font-semibold">
                            {/* Rows written before this column existed carry a
                                name and department with no code at all, so an
                                absent code is a real state, not an empty one. */}
                            {selected.employee_code || t("common.notProvided")}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">{t("admin.department")}</dt>
                          <dd className="font-semibold">
                            {selected.department ? t(`feedback.departments.${selected.department}`) : t("common.notSpecified")}
                          </dd>
                        </div>
                      </dl>
                    ) : (
                      <p className="text-sm">{t("admin.anonymous")}</p>
                    )}
                  </div>
                  {selected.attachment_path && (
                    <Button variant="outline" className="w-full" onClick={() => void openAttachment(selected.attachment_path!)}>
                      <Image className="size-4" />
                      {t("admin.viewImage")}
                    </Button>
                  )}
                </CardContent>
              </>
            ) : (
              <CardContent className="p-10 text-center text-sm text-muted-foreground">{t("admin.recentFeedback")}</CardContent>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
