import { api } from "./client";
import type { RolePermission, TabDef } from "../types/settings";

export async function fetchAvailableTabs(): Promise<TabDef[]> {
  const { data } = await api.get<TabDef[]>("/settings/tabs/");
  return data;
}

export async function fetchPermissions(): Promise<RolePermission[]> {
  const { data } = await api.get<RolePermission[]>("/settings/permissions/");
  return data;
}

export async function savePermissions(permissions: RolePermission[]): Promise<RolePermission[]> {
  const { data } = await api.put<RolePermission[]>("/settings/permissions/", permissions);
  return data;
}
