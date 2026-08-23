import { Routes, Route } from "react-router-dom";
import { AppShell } from "@/ui/layouts/AppShell";
import { HomePage } from "@/pages/HomePage";
import { RequestsLayout } from "@/pages/RequestsLayout";
import { RequestsListPage } from "@/pages/RequestsListPage";
import { NewRequestPage } from "@/pages/NewRequestPage";
import { TriagePage } from "@/pages/TriagePage";
import { RequestDetailPage } from "@/pages/RequestDetailPage";
import { ComingSoon } from "@/pages/ComingSoon";
import { EmptyState } from "@/ui/components";

function NotFound() {
  return <div className="page"><EmptyState title="Page not found" message="The page you're looking for doesn't exist." icon="search" /></div>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="requests" element={<RequestsLayout />}>
          <Route index element={<RequestsListPage scope="mine" />} />
          <Route path="all" element={<RequestsListPage scope="all" />} />
          <Route path="assigned" element={<RequestsListPage scope="assigned" />} />
          <Route path="triage" element={<TriagePage />} />
        </Route>
        <Route path="requests/new" element={<NewRequestPage />} />
        <Route path="requests/:id" element={<RequestDetailPage />} />
        <Route path="matters" element={<ComingSoon title="Matters" />} />
        <Route path="contracts" element={<ComingSoon title="Contracts" />} />
        <Route path="knowledge" element={<ComingSoon title="Knowledge" />} />
        <Route path="reports" element={<ComingSoon title="Reports" />} />
        <Route path="settings" element={<ComingSoon title="Settings" />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
