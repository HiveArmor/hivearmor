import { api } from "@/lib/api";

export interface UserSummary {
  id: number;
  login: string;
  firstName?: string;
  lastName?: string;
  activated: boolean;
  authorities: string[];
}

class UserService {
  async listAnalysts(): Promise<UserSummary[]> {
    try {
      const res = await api.get<UserSummary[]>("/api/users?page=0&size=100");
      return Array.isArray(res) ? res.filter((u) => u.activated) : [];
    } catch {
      return [];
    }
  }
}

export const userService = new UserService();
