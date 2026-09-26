import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ResultBar } from "@/components/admin/ResultBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { percent, type QuestionBreakdown } from "@/lib/surveyResults";

const TYPE_LABEL: Record<QuestionBreakdown["question"]["type"], string> = {
  single_choice: "admin.singleChoice",
  multiple_choice: "admin.multipleChoice",
  rating: "admin.rating",
  yes_no: "admin.yesNo",
  free_text: "admin.freeText",
};

const VISIBLE_TEXTS = 5;

export function QuestionResultsCard({ breakdown }: { breakdown: QuestionBreakdown }) {
  const { t, i18n } = useTranslation();
  const [showAllTexts, setShowAllTexts] = useState(false);
  const isArabic = i18n.language === "ar";
  const { question, respondentCount } = breakdown;
  const title = isArabic ? question.title_ar : question.title_en;
  const isChoice = question.type === "single_choice" || question.type === "multiple_choice";

  // Single choice percentages are of respondents. Multiple choice percentages
  // are of all selections, because the two totals are different things and
  // showing respondent-based percentages there would make every bar look
  // partial.
  const denominator = question.type === "multiple_choice" ? breakdown.totalSelections : respondentCount;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle className="text-base leading-7">{title}</CardTitle>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary">
            {t(TYPE_LABEL[question.type])}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{t("admin.respondents", { total: respondentCount })}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {respondentCount === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.noAnswersYet")}</p>
        ) : isChoice ? (
          <>
            <div className="space-y-3">
              {question.options.map((option) => {
                const count = breakdown.choiceCounts[option.id] ?? 0;
                const share = percent(count, denominator);
                return (
                  <ResultBar
                    key={option.id}
                    label={isArabic ? option.label_ar : option.label_en}
                    value={count}
                    max={denominator}
                    caption={`${count} · ${share}%`}
                  />
                );
              })}
            </div>
            {question.type === "multiple_choice" && (
              <p className="text-xs text-muted-foreground">{t("admin.multipleChoiceNote")}</p>
            )}
          </>
        ) : question.type === "rating" ? (
          <>
            <p className="text-2xl font-bold">
              {breakdown.ratingAverage === null
                ? "—"
                : t("admin.averageRating", { value: breakdown.ratingAverage.toFixed(1) })}
            </p>
            <div className="space-y-3">
              {breakdown.ratingCounts
                .map((count, index) => ({ count, value: index + 1 }))
                .reverse()
                .map(({ count, value }) => (
                  <ResultBar
                    key={value}
                    label={t("survey.ratingLabel", { value })}
                    value={count}
                    max={Math.max(1, ...breakdown.ratingCounts)}
                    caption={String(count)}
                  />
                ))}
            </div>
          </>
        ) : question.type === "yes_no" ? (
          <div className="space-y-3">
            <ResultBar
              label={t("survey.yes")}
              value={breakdown.yesCount}
              max={respondentCount}
              caption={`${breakdown.yesCount} · ${percent(breakdown.yesCount, respondentCount)}%`}
            />
            <ResultBar
              label={t("survey.no")}
              value={breakdown.noCount}
              max={respondentCount}
              caption={`${breakdown.noCount} · ${percent(breakdown.noCount, respondentCount)}%`}
            />
          </div>
        ) : breakdown.texts.length === 0 ? (
          // A response that was only whitespace still counts as a respondent
          // but leaves nothing to show.
          <p className="text-sm text-muted-foreground">{t("admin.noAnswersYet")}</p>
        ) : (
          <>
            <ul className="space-y-2">
              {(showAllTexts ? breakdown.texts : breakdown.texts.slice(0, VISIBLE_TEXTS)).map((text) => (
                <li key={text} className="rounded-xl bg-muted/50 p-3 text-sm leading-7">
                  {text}
                </li>
              ))}
            </ul>
            {breakdown.texts.length > VISIBLE_TEXTS && (
              <Button variant="ghost" size="sm" onClick={() => setShowAllTexts((current) => !current)}>
                {showAllTexts ? t("admin.showLess") : t("admin.showMore", { total: breakdown.texts.length })}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
