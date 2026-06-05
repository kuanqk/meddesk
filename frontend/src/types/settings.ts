export interface TabDef {
  id: string;
  label: string;
}

export interface RolePermission {
  role: string;
  role_label: string;
  tabs: string[];
}
