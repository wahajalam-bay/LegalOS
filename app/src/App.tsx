import { Routes, Route } from "react-router-dom";
import { AppShell } from "@/ui/layouts/AppShell";
import { RequestsListPage } from "@/pages/RequestsListPage";
import { NewRequestPage } from "@/pages/NewRequestPage";
import { TriagePage } from "@/pages/TriagePage";
import { RequestDetailPage } from "@/pages/RequestDetailPage";
import { EmptyState } from "@/ui/components";

function NotFound() {
  return <div className="page"><EmptyState title="Page not found" message="The page you're looking for doesn't exist." /></div>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<RequestsListPage />} />
        <Route path="new" element={<NewRequestPage />} />
        <Route path="triage" element={<TriagePage />} />
        <Route path="requests/:id" element={<RequestDetailPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
