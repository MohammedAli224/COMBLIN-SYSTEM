import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const switchLanguage = async () => {
    const next = i18n.language === "ar" ? "en" : "ar";
    await i18n.changeLanguage(next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    localStorage.setItem("nursing-platform-language", next);
  };
  return <Button variant="ghost" size="sm" onClick={switchLanguage} aria-label={t("common.language")}><Languages className="size-4" />{t("common.language")}</Button>;
}
