import { FormEvent, useState } from "react";
import { useAuth } from "../context/AuthContext";

/**
 * Превращает ошибку логина в понятное сообщение.
 * Раньше любой сбой (сеть, 502, DisallowedHost) показывался как
 * «Неверный логин или пароль», что маскировало реальные проблемы.
 */
function loginErrorMessage(err: unknown): string {
  const e = err as {
    response?: { status?: number; data?: { detail?: string } };
  };

  // Ответа нет вовсе — сеть, CORS, 502/недоступный сервер.
  if (!e.response) {
    return "Сервер недоступен. Проверьте соединение и попробуйте ещё раз.";
  }

  const { status, data } = e.response;
  const detail = data?.detail;

  if (status === 401) return detail ?? "Неверный email или пароль.";
  if (status === 429)
    return "Слишком много попыток. Подождите минуту и попробуйте снова.";
  if (status === 400)
    return detail ?? "Некорректный запрос. Обратитесь к администратору.";
  if (status && status >= 500) return "Ошибка сервера. Попробуйте позже.";
  return detail ?? "Не удалось войти. Попробуйте ещё раз.";
}

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ email: email.trim(), password });
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f0] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#e5e3dd] bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
            MedDesk
          </p>
          <h1 className="mt-2 text-xl font-bold text-[#1a1814]">Вход в систему</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#6b6760]">
              Логин
            </label>
            <input
              type="text"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[#d1cec6] bg-[#f5f5f0] px-3 py-2.5 text-sm outline-none focus:border-blue-600"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#6b6760]">
              Пароль
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[#d1cec6] bg-[#f5f5f0] px-3 py-2.5 text-sm outline-none focus:border-blue-600"
              required
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {isSubmitting ? "Вход..." : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
