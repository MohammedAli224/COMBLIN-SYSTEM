import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { CheckCircle2, KeyRound, LockKeyhole, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { ErrorToast } from "@/components/ErrorToast";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { errorMessage } from "@/lib/utils";

/**
 * Deliberately loose. The only authoritative test of an address is whether a
 * reset was sent to it, and a stricter pattern here would reject valid
 * addresses for no benefit while still telling the user nothing useful.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = "signIn" | "forgot" | "sent";

/**
 * Absolute URL Supabase sends the admin back to after they open the recovery
 * link. Must match the `/admin/reset-password` route in App.tsx.
 *
 * This exact URL also has to be allowlisted under Authentication > URL
 * Configuration > Redirect URLs in the Supabase dashboard. If it is not,
 * Supabase does not fail loudly: it falls back to the project's Site URL and
 * drops the admin on the public home page with their token silently discarded,
 * which looks exactly like a broken email.
 */
function passwordResetRedirect(): string {
  return `${window.location.origin}/admin/reset-password`;
}

export default function AdminLoginPage() {
  const { t } = useTranslation();
  const { session, isAdmin, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && session && isAdmin) return <Navigate to="/admin" replace />;

  const showSignIn = () => {
    setError(null);
    setMode("signIn");
  };

  const handleSendLink = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const address = email.trim();
    if (!address) {
      setError(t("auth.emailRequired"));
      return;
    }
    if (!EMAIL_PATTERN.test(address)) {
      setError(t("auth.invalidEmail"));
      return;
    }

    setSending(true);
    try {
      // Resolves with { data, error } and does not throw, so error is checked
      // explicitly rather than caught. Supabase applies its own rate limiting
      // per address and per IP; there is no reason to layer another limiter here.
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: passwordResetRedirect(),
      });
      if (resetError) {
        console.error("resetPasswordForEmail failed:", resetError);
        setError(t("auth.resetFailed"));
        return;
      }
      setMode("sent");
    } catch (thrown) {
      console.error("resetPasswordForEmail threw:", errorMessage(thrown));
      setError(t("auth.resetFailed"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Nursing Pulse logo" className="size-11 rounded-xl bg-white/10 object-cover" />
          <span className="font-bold">{t("common.appName")}</span>
        </div>
        <div>
          <p className="max-w-xl text-4xl font-bold leading-tight">{t("admin.overview")}</p>
          <div className="mt-7 flex items-center gap-2 text-sm text-white/75">
            <LockKeyhole className="size-4" />
            {t("auth.secure")}
          </div>
        </div>
        <span />
      </section>

      <main className="relative grid place-items-center bg-background p-4 sm:p-8">
        <div className="absolute end-4 top-4">
          <LanguageSwitcher />
        </div>
        <Card className="w-full max-w-md">
          <CardContent className="p-7 sm:p-9">
            {mode === "signIn" ? (
              <>
                <img src="/logo.png" alt="Nursing Pulse logo" className="mb-5 size-12 rounded-xl bg-secondary object-cover lg:hidden" />
                <h1 className="text-2xl font-bold">{t("auth.title")}</h1>
                <p className="mb-7 mt-2 text-sm text-muted-foreground">{t("auth.subtitle")}</p>

                <Auth
                  supabaseClient={supabase}
                  providers={[]}
                  view="sign_in"
                  showLinks={false}
                  theme="light"
                  appearance={{
                    theme: ThemeSupa,
                    variables: {
                      default: {
                        colors: { brand: "hsl(191 77% 25%)", brandAccent: "hsl(191 77% 20%)" },
                        radii: { borderRadiusButton: "0.5rem", inputBorderRadius: "0.5rem" },
                      },
                    },
                    style: {
                      button: { minHeight: "44px", fontFamily: "inherit" },
                      input: { minHeight: "44px", fontFamily: "inherit" },
                      label: { fontFamily: "inherit" },
                    },
                  }}
                  localization={{
                    variables: {
                      sign_in: {
                        email_label: t("auth.email"),
                        password_label: t("auth.password"),
                        button_label: t("auth.signIn"),
                        loading_button_label: t("common.loading"),
                      },
                    },
                  }}
                />

                {/* Supabase's own recovery link is suppressed by showLinks={false}
                    because its copy is not routed through our bundles. The
                    trigger therefore lives here, just below the form. */}
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => { setError(null); setMode("forgot"); }}
                    className="inline-flex items-center gap-1.5 rounded text-sm font-semibold text-primary underline-offset-4 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <KeyRound className="size-4" />
                    {t("auth.forgotPassword")}
                  </button>
                </div>
              </>
            ) : mode === "forgot" ? (
              <>
                <span className="mb-5 grid size-12 place-items-center rounded-xl bg-secondary text-primary">
                  <Mail className="size-6" />
                </span>
                <h1 className="text-2xl font-bold">{t("auth.forgotPasswordTitle")}</h1>
                <p className="mb-6 mt-2 text-sm text-muted-foreground">{t("auth.forgotPasswordIntro")}</p>

                <ErrorToast
                  message={error}
                  onDismiss={() => setError(null)}
                  dismissLabel={t("common.close")}
                />

                <form className="space-y-5" onSubmit={handleSendLink} noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">{t("auth.email")}</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      // Addresses stay left to right inside an RTL layout, so a
                      // mixed local part and domain does not reorder visually.
                      dir="ltr"
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={sending}>
                    <Mail className="size-4" />
                    {sending ? t("auth.sendingResetLink") : t("auth.sendResetLink")}
                  </Button>
                </form>

                <Button type="button" variant="ghost" className="mt-4 w-full" onClick={showSignIn}>
                  {t("auth.backToSignIn")}
                </Button>
              </>
            ) : (
              <div className="py-4 text-center" role="status">
                <span className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="size-7" />
                </span>
                <h1 className="text-2xl font-bold">{t("auth.resetLinkSentTitle")}</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("auth.resetLinkSent")}</p>
                <Button type="button" variant="outline" className="mt-7 w-full" onClick={showSignIn}>
                  {t("auth.backToSignIn")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
