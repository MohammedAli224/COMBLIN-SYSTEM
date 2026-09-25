import { HeartPulse } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
export function PublicHeader() { const { t } = useTranslation(); return <header className="border-b bg-card/95"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><HeartPulse className="size-5" /></span><div><p className="text-xs font-medium text-muted-foreground">{t("common.hospital")}</p><p className="text-sm font-bold sm:text-base">{t("common.appName")}</p></div></div><LanguageSwitcher /></div></header>; }
