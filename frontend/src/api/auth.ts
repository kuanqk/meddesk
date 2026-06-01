import { api, clearTokens, setTokens } from "./client";
import type { AuthUser, LoginCredentials, TokenPair } from "../types/auth";

export async function login(credentials: LoginCredentials): Promise<AuthUser> {
  const { data: tokens } = await api.post<TokenPair>(
    "/auth/login/",
    credentials,
  );
  setTokens(tokens);
  return fetchMe();
}

export async function fetchMe(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>("/auth/me/");
  return data;
}

export function logout(): void {
  clearTokens();
}
