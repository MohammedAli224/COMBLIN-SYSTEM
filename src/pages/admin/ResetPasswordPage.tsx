import { CheckCircle2, KeyRound, LockKeyhole, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ErrorToast } from "@/components/ErrorToast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabaseClient";
import { errorMessage } from "@/lib/utils";

/**
 * Minimum length for a new password.
 *
 * Supabase's own floor is 6, which is low for an account that can read staff
 * feedback and delete surveys. The same value has to be set as a server-side
 * policy too: this check is a usability aid that saves a round trip, never a
 * control, because anything enforced only in the browser can be skipped.
 */
const MIN_PASSWORD_LENGTH = 8;

/**
 * "invalid" and "done" must stay separate. They read almost identically in code
 * and mean opposite things to the person looking at them, and collapsing them
 * tells someone whose link expired that their password was just changed.
 */
type Status = "checking" | "ready" | "invalid" | "done";

/**
 * The second half of the password reset flow.
 *
 * Sending a recovery link is only half the job. Supabase returns the admin here
 * with a single-use token in the URL fragment, and without a route that turns
 * that token into a new password the admin clicks the link, lands on a page
 * with no form on it, and gives up.
 *
 * The recovery token arrives as a live session, so `updateUser` is what actually
 * writes the new password. There is deliberately no `isAdmin` check here: a
 * non-admin who resets their password still cannot reach the admin area,
 * because every admin route is gated on the `admin_users` table. Blocking it
 * would only add a confusing failure for someone who is, in fact, an admin but
 * whose row has not been created yet.
 */
export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    // Deciding on the first auth event rather than calling getSession() once is
    // deliberate. With detectSessionInUrl enabled, the recovery token becomes a
    // session asynchronously after load, so an immediate getSession() can read
    // null for a perfectly valid link and would tell a real admin it expired.
    // The first event is always INITIAL_SESSION, which arrives after the URL has
    // been processed, so this settles both the valid and the dead case.
    //
    // Later events are ignored on purpose. signOut() below fires an auth change
    // with a null session, and without this latch that would overwrite the
    // success screen with the expired-link one a moment after it appeared.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (settled.current) return;
      settled.current = true;
      setStatus(session ? "ready" : "invalid");
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("auth.passwordTooShort", { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.passwordMismatch"));
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        // Logged rather than shown: a Supabase auth error can read like "Token
        // has expired or is invalid", which is a support signal, not something
        // to put in front of an admin mid-recovery.
        console.error("updateUser failed:", updateError);
        setError(t("auth.updateFailed"));
        return;
      }
      // Sign out so the next step is a real sign-in with the password just set.
      // It proves the new password works and leaves no elevated session sitting
      // in the tab from before the change.
      await supabase.auth.signOut();
      setStatus("done");
    } catch (thrown) {
      console.error("updateUser threw:", errorMessage(thrown));
      setError(t("auth.updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4 sm:p-8">
      <Card className="w-full max-w-md">
        <CardContent className="p-7 sm:p-9">
          {status === "checking" ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : status === "invalid" ? (
            <div className="py-4 text-center">
              <span className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-destructive/10 text-destructive">
                <ShieldAlert className="size-7" />
              </span>
              <h1 className="text-2xl font-bold">{t("auth.resetLinkInvalidTitle")}</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("auth.resetLinkInvalid")}</p>
              <Button asChild className="mt-7 w-full">
                <Link to="/admin/login">{t("auth.requestNewLink")}</Link>
              </Button>
            </div>
          ) : status === "done" ? (
            <div className="py-4 text-center">
              <span className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="size-7" />
              </span>
              <h1 className="text-2xl font-bold">{t("auth.passwordUpdated")}</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("auth.passwordUpdatedBody")}</p>
              <Button asChild className="mt-7 w-full">
                <Link to="/admin/login">{t("auth.backToSignIn")}</Link>
              </Button>
            </div>
          ) : (
            <>
              <span className="mb-5 grid size-12 place-items-center rounded-xl bg-secondary text-primary">
                <KeyRound className="size-6" />
              </span>
              <h1 className="text-2xl font-bold">{t("auth.resetPasswordTitle")}</h1>
              <p className="mb-6 mt-2 text-sm text-muted-foreground">{t("auth.resetPasswordIntro")}</p>

              <ErrorToast
                message={error}
                onDismiss={() => setError(null)}
                dismissLabel={t("common.close")}
              />

              <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                <div className="space-y-2">
                  <Label htmlFor="new-password">{t("auth.newPassword")}</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    dir="ltr"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">{t("auth.confirmPassword")}</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    autoComplete="new-password"
                    dir="ltr"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={saving}>
                  <LockKeyhole className="size-4" />
                  {saving ? t("auth.updatingPassword") : t("auth.updatePassword")}
                </Button>
              </form>

              <Button asChild variant="ghost" className="mt-4 w-full">
                <Link to="/admin/login">{t("auth.backToSignIn")}</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
