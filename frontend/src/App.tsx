import { AuthProvider, useAuth } from "./context/AuthContext";
import ClinicScheduler from "./components/scheduler/ClinicScheduler";
import LoginPage from "./pages/LoginPage";

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

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

  return <ClinicScheduler />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
