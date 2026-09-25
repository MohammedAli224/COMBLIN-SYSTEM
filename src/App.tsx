import { Navigate, Route, Routes } from "react-router-dom";
import { SessionContextProvider } from "@/auth/AuthContext";
import { AdminRoute } from "@/auth/AdminRoute";
import { AdminShell } from "@/components/admin/AdminShell";
import FeedbackPage from "@/pages/FeedbackPage";
import SurveyPage from "@/pages/SurveyPage";
import AdminLoginPage from "@/pages/AdminLoginPage";
import AnalyticsPage from "@/pages/admin/AnalyticsPage";
import DashboardPage from "@/pages/admin/DashboardPage";
import FeedbackInboxPage from "@/pages/admin/FeedbackInboxPage";
import SurveyBuilderPage from "@/pages/admin/SurveyBuilderPage";
import SurveysPage from "@/pages/admin/SurveysPage";

export default function App() {
  return <SessionContextProvider><Routes>
    <Route path="/" element={<FeedbackPage />} />
    <Route path="/survey/:slug" element={<SurveyPage />} />
    <Route path="/admin/login" element={<AdminLoginPage />} />
    <Route element={<AdminRoute />}><Route path="/admin" element={<AdminShell />}>
      <Route index element={<DashboardPage />} />
      <Route path="feedback" element={<FeedbackInboxPage />} />
      <Route path="surveys" element={<SurveysPage />} />
      <Route path="surveys/new" element={<SurveyBuilderPage />} />
      <Route path="analytics" element={<AnalyticsPage />} />
    </Route></Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></SessionContextProvider>;
}
