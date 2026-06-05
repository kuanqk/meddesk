import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ClinicScheduler from "./components/scheduler/ClinicScheduler";
import LoginPage from "./pages/LoginPage";
import FinancePage from "./pages/FinancePage";

type Page = "scheduler" | "finance";

function AppContent() {
  const { isAuthenticated, isLoading, allowedTabs } = useAuth();
  const [page, setPage] = useState<Page>("scheduler");

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f0] text-[#6b6760]">
        Загрузка...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const canViewFinance = allowedTabs.includes("finance");

  if (page === "finance" && canViewFinance) {
    return <FinancePage onBack={() => setPage("scheduler")} />;
  }

  return (
    <ClinicScheduler onNavigateFinance={canViewFinance ? () => setPage("finance") : undefined} />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
