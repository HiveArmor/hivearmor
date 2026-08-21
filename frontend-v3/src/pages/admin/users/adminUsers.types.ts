/**
 * Admin Users — Type Definitions
 * ADM-01 Users & Roles
 */

import type { UserDTO } from '@/types/api.types';

export interface AuthorityDTO {
  id: string;
  name: string;
}

export interface UserFilterState {
  search: string;
  activated: 'all' | 'active' | 'inactive';
  roles: string[];
}

export interface UserFormData {
  login: string;
  email: string;
  firstName: string;
  lastName: string;
  authorities: string[];
  activated: boolean;
  password?: string;
  confirmPassword?: string;
}

export interface UserFormErrors {
  login?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  authorities?: string;
  password?: string;
  confirmPassword?: string;
}

export type DrawerMode = 'create' | 'edit';

export interface UserDrawerState {
  isOpen: boolean;
  mode: DrawerMode;
  user: UserDTO | null;
}

export type { UserDTO };
