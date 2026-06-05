import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ClinicScheduler from "./components/scheduler/ClinicScheduler";
import LoginPage from "./pages/LoginPage";
import FinancePage from "./pages/FinancePage";
import SettingsPage from "./pages/SettingsPage";

type Page = "scheduler" | "finance" | "settings";

function AppContent() {
  const { isAuthenticated, isLoading, allowedTabs, user } = useAuth();
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

  const canViewFinance  = allowedTabs.includes("finance");
  const canViewSettings = user?.is_superuser || user?.role === "owner";

  if (page === "finance" && canViewFinance) {
    return (
      <FinancePage
        onBack={() => setPage("scheduler")}
      />
    );
  }

  if (page === "settings" && canViewSettings) {
    return (
      <SettingsPage onBack={() => setPage("scheduler")} />
    );
  }

  return (
    <ClinicScheduler
      onNavigateFinance={canViewFinance   ? () => setPage("finance")  : undefined}
      onNavigateSettings={canViewSettings ? () => setPage("settings") : undefined}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
