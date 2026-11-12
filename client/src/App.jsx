import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AuthLayout from "./components/auth/AuthLayout";
import AppShell from "./components/layout/AppShell";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import Home from "./pages/Home";

const Forecast = lazy(() => import("./pages/Forecast"));
const Planner = lazy(() => import("./pages/Planner"));
const AiLayout = lazy(() => import("./pages/ai/AiLayout"));
const AgentCenter = lazy(() => import("./pages/ai/AgentCenter"));
const Travel = lazy(() => import("./pages/ai/Travel"));
const Air = lazy(() => import("./pages/ai/Air"));
const SmartAlerts = lazy(() => import("./pages/ai/SmartAlerts"));
const Sky = lazy(() => import("./pages/ai/Sky"));
const Research = lazy(() => import("./pages/ai/Research"));
const Dashboard = lazy(() => import("./pages/ai/Dashboard"));
const AiAnalytics = lazy(() => import("./pages/ai/Analytics"));
const MapPage = lazy(() => import("./pages/MapPage"));
const Compare = lazy(() => import("./pages/Compare"));
const Places = lazy(() => import("./pages/Places"));
const Alerts = lazy(() => import("./pages/Alerts"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const NotFound = lazy(() => import("./pages/NotFound"));

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<p className="muted center" role="status" style={{ padding: 48 }}>Loading…</p>}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<Home />} />
              <Route path="forecast" element={<Forecast />} />
              <Route path="planner" element={<Planner />} />
              <Route path="ai" element={<AiLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="analytics" element={<AiAnalytics />} />
                <Route path="agents" element={<AgentCenter />} />
                <Route path="travel" element={<Travel />} />
                <Route path="air" element={<Air />} />
                <Route path="alerts" element={<SmartAlerts />} />
                <Route path="sky" element={<Sky />} />
                <Route path="research" element={<Research />} />
              </Route>
              <Route path="research" element={<Navigate to="/ai/research" replace />} />
              <Route path="map" element={<MapPage />} />
              <Route path="compare" element={<Compare />} />
              <Route path="places" element={<Places />} />
              <Route path="settings" element={<Settings />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
