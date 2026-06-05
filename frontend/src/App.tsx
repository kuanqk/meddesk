import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ClinicScheduler from "./components/scheduler/ClinicScheduler";
import LoginPage from "./pages/LoginPage";
import FinancePage from "./pages/FinancePage";

type Page = "scheduler" | "finance";

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
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

  if (page === "finance") {
    return <FinancePage onBack={() => setPage("scheduler")} />;
  }

  return (
    <ClinicScheduler onNavigateFinance={() => setPage("finance")} />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
