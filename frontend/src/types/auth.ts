export type UserRole =
  | "owner"
  | "admin"
  | "doctor"
  | "anesthesiologist"
  | "receptionist";

export type TabId = "schedule" | "pl" | "week" | "rooms";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_superuser: boolean;
  role: UserRole | null;
  role_label: string | null;
  clinic_id: number | null;
  clinic_name: string | null;
  tabs: TabId[];
}

export interface TokenPair {
  access: string;
  refresh: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}
