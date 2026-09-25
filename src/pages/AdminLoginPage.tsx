import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { HeartPulse, LockKeyhole } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/lib/supabaseClient";

export default function AdminLoginPage() {
  const { t } = useTranslation();
  const { session, isAdmin, loading } = useAuth();
  if (!loading && session && isAdmin) return <Navigate to="/admin" replace />;
  return <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]"><section className="hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-white/10"><HeartPulse /></span><span className="font-bold">{t("common.appName")}</span></div><div><p className="max-w-xl text-4xl font-bold leading-tight">{t("admin.overview")}</p><div className="mt-7 flex items-center gap-2 text-sm text-white/75"><LockKeyhole className="size-4" />{t("auth.secure")}</div></div><span /></section><main className="relative grid place-items-center bg-background p-4 sm:p-8"><div className="absolute end-4 top-4"><LanguageSwitcher /></div><Card className="w-full max-w-md"><CardContent className="p-7 sm:p-9"><span className="mb-5 grid size-12 place-items-center rounded-xl bg-secondary text-primary lg:hidden"><HeartPulse /></span><h1 className="text-2xl font-bold">{t("auth.title")}</h1><p className="mb-7 mt-2 text-sm text-muted-foreground">{t("auth.subtitle")}</p><Auth supabaseClient={supabase} providers={[]} view="sign_in" showLinks={false} theme="light" appearance={{ theme: ThemeSupa, variables: { default: { colors: { brand: "hsl(191 77% 25%)", brandAccent: "hsl(191 77% 20%)" }, radii: { borderRadiusButton: "0.5rem", inputBorderRadius: "0.5rem" } } }, style: { button: { minHeight: "44px", fontFamily: "inherit" }, input: { minHeight: "44px", fontFamily: "inherit" }, label: { fontFamily: "inherit" } } }} localization={{ variables: { sign_in: { email_label: t("auth.email"), password_label: t("auth.password"), button_label: t("auth.signIn"), loading_button_label: t("common.loading") } } }} /></CardContent></Card></main></div>;
}
