// import { RoleName, PermissionName, PermissionCode } from 'types/common';

import { RoleName } from 'types/common';

// export interface ReqUserSearch {
//   name?: string;
//   roleId?: string;
//   offset: number;
//   size: number;
// }

export interface ResUserSearchItem {
  no: number;
  group: string;
  id: string;
  name: string;
  contact: string;
  email: string;
  company: string;
  registeredDate: string;
  status: string;
  role: RoleName;
}

// export interface ResUserSearch {
//   data: ResUserSearchItem[];
//   totalPages: number;
//   totalItems: number;
// }

// export interface ResRole {
//   id: string;
//   roleName: RoleName;
//   createdAt: string;
//   updatedAt: string;
// }

// export interface ResPermission {
//   id: string;
//   permissionName: PermissionName;
//   permissionCode: PermissionCode;
//   isDefault: boolean;
//   createdAt: string;
//   updatedAt: string;
// }
