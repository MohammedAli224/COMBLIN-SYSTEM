import { useState } from "react";
import { BarChart3, ClipboardList, HeartPulse, Inbox, LayoutDashboard, LogOut, Menu, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { to: "/admin", end: true, label: "nav.dashboard", icon: LayoutDashboard },
  { to: "/admin/feedback", end: false, label: "nav.inbox", icon: Inbox },
  { to: "/admin/surveys", end: false, label: "nav.surveys", icon: ClipboardList },
  { to: "/admin/analytics", end: false, label: "nav.analytics", icon: BarChart3 },
] as const;

export function AdminShell() {
  const { t } = useTranslation();
  const { session, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const current = links.find((link) => link.end ? location.pathname === link.to : location.pathname.startsWith(link.to));
  const sidebar = <div className="flex h-full flex-col"><div className="flex h-20 items-center gap-3 border-b px-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><HeartPulse className="size-5" /></span><p className="text-sm font-bold leading-tight">{t("common.appName")}</p><Button className="ms-auto lg:hidden" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={t("common.close")}><X className="size-5" /></Button></div><nav className="flex-1 space-y-1 p-3">{links.map(({ to, end, label, icon: Icon }) => <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)} className={({ isActive }) => cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition", isActive ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="size-5" />{t(label)}</NavLink>)}</nav><div className="border-t p-3"><p className="mb-2 truncate px-3 text-xs text-muted-foreground" dir="ltr">{session?.user.email}</p><Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={() => void signOut()}><LogOut className="size-4" />{t("nav.signOut")}</Button></div></div>;
  return <div className="min-h-screen bg-background"><aside className="fixed inset-y-0 start-0 z-40 hidden w-64 border-e bg-card lg:block">{sidebar}</aside>{open && <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-foreground/30" onClick={() => setOpen(false)} aria-label={t("common.close")} /><aside className="absolute inset-y-0 start-0 w-72 bg-card shadow-xl">{sidebar}</aside></div>}<div className="lg:ms-64"><header className="sticky top-0 z-30 flex h-16 items-center border-b bg-card/95 px-4 backdrop-blur sm:px-6"><Button className="me-3 lg:hidden" variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={t("nav.dashboard")}><Menu className="size-5" /></Button><h1 className="font-bold">{current ? t(current.label) : t("nav.dashboard")}</h1><div className="ms-auto"><LanguageSwitcher /></div></header><main className="p-4 sm:p-6 lg:p-8"><Outlet /></main></div></div>;
}
