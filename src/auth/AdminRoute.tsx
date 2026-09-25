import { Navigate, Outlet } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "./AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function AdminRoute() {
  const { t } = useTranslation();
  const { session, loading, isAdmin, signOut } = useAuth();
  if (loading) return <main className="grid min-h-screen place-items-center text-muted-foreground">{t("common.loading")}</main>;
  if (!session) return <Navigate to="/admin/login" replace />;
  if (!isAdmin) return <main className="grid min-h-screen place-items-center p-4"><Card className="max-w-md"><CardContent className="p-8 text-center"><ShieldAlert className="mx-auto mb-4 size-10 text-destructive" /><h1 className="text-xl font-bold">{t("auth.notAuthorized")}</h1><p className="mt-3 text-sm text-muted-foreground">{t("admin.setupRequired")}</p><Button variant="outline" className="mt-6" onClick={() => void signOut()}>{t("nav.signOut")}</Button></CardContent></Card></main>;
  return <Outlet />;
}
