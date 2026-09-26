import { Navigate, Route, Routes } from "react-router-dom";
import { SessionContextProvider } from "@/auth/AuthContext";
import { AdminRoute } from "@/auth/AdminRoute";
import { AdminShell } from "@/components/admin/AdminShell";
import FeedbackPage from "@/pages/FeedbackPage";
import SurveyPage from "@/pages/SurveyPage";
import AdminLoginPage from "@/pages/AdminLoginPage";
import ResetPasswordPage from "@/pages/admin/ResetPasswordPage";
import DashboardPage from "@/pages/admin/DashboardPage";
import FeedbackInboxPage from "@/pages/admin/FeedbackInboxPage";
import SurveyBuilderPage from "@/pages/admin/SurveyBuilderPage";
import SurveysPage from "@/pages/admin/SurveysPage";
import SurveyResultsPage from "@/pages/admin/SurveyResultsPage";

export default function App() {
  return <SessionContextProvider><Routes>
    <Route path="/" element={<FeedbackPage />} />
    <Route path="/survey/:slug" element={<SurveyPage />} />
    <Route path="/admin/login" element={<AdminLoginPage />} />
    {/* Deliberately outside the AdminRoute group. A recovery link arrives with a
        session, but an expired one does not, and inside the guard that would
        bounce to the login page and silently discard the reason the admin could
        not continue. Out here the page can say the link has expired. */}
    <Route path="/admin/reset-password" element={<ResetPasswordPage />} />
    <Route element={<AdminRoute />}><Route path="/admin" element={<AdminShell />}>
      <Route index element={<DashboardPage />} />
      <Route path="feedback" element={<FeedbackInboxPage />} />
      <Route path="surveys" element={<SurveysPage />} />
      <Route path="surveys/new" element={<SurveyBuilderPage />} />
      <Route path="surveys/:id/edit" element={<SurveyBuilderPage />} />
      <Route path="results" element={<SurveyResultsPage />} />
      {/* Analytics was merged into the dashboard. The redirect is kept inside
          the AdminRoute group so the old URL still goes through the auth check
          before it lands anywhere, and so a bookmark does not dead end on the
          catch-all route, which would send an admin to the public home page. */}
      <Route path="analytics" element={<Navigate to="/admin" replace />} />
    </Route></Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></SessionContextProvider>;
}
