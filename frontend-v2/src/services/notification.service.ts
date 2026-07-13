import { api } from "@/lib/api";

// ── In-app notifications (existing /api/notifications) ──────────────────────

export type NotificationType = "INFO" | "WARNING" | "ERROR";
export type NotificationStatus = "ACTIVE" | "HIDDEN" | "DELETED";
export type NotificationSource =
  | "AS400" | "BIT_DEFENDER" | "AWS" | "AZURE" | "OFFICE_365"
  | "SOPHOS" | "GOOGLE" | "EMAIL_SETTING" | "ALERTS";

export interface InAppNotification {
  id: number;
  source: NotificationSource;
  type: NotificationType;
  message: string;
  createdAt: string;
  updatedAt?: string;
  read: boolean;
  status: NotificationStatus;
}

export interface NotificationPage {
  content: InAppNotification[];
  totalElements: number;
  totalPages: number;
  number: number;
}

// ── Notification channels ─────────────────────────────────────────────────

export type ChannelType = "email" | "slack" | "webhook";

export interface NotificationChannel {
  id?: number;
  name: string;
  channelType: ChannelType;
  enabled: boolean;
  configJson: string;
  lastTestedAt?: string;
  lastTestOk?: boolean;
  createdAt?: string;
  createdBy?: string;
}

export interface EmailChannelConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  from: string;
  authType: "STARTTLS" | "SSL" | "NONE";
  toAddresses: string[];
}

export interface SlackChannelConfig {
  webhookUrl: string;
  channel: string;
  username: string;
  iconEmoji: string;
}

export interface WebhookChannelConfig {
  url: string;
  method: "POST" | "PUT";
  headers: Record<string, string>;
  bodyTemplate: string;
}

// ── Notification routes ───────────────────────────────────────────────────

export interface NotificationRoute {
  id?: number;
  name: string;
  channelId: number;
  matchSeverity?: string;
  matchSource?: string;
  matchType?: string;
  enabled: boolean;
  throttleMinutes: number;
  lastFiredAt?: string;
  createdAt?: string;
}

export interface TestChannelResult {
  ok: boolean;
  channelId: number;
  channelName: string;
  error?: string;
}

// ── Service ───────────────────────────────────────────────────────────────

class NotificationServiceClient {
  // In-app feed
  async getFeed(page = 0, size = 20): Promise<NotificationPage> {
    return api.get<NotificationPage>(`/api/notifications?page=${page}&size=${size}&sort=createdAt,desc`);
  }

  async getUnreadCount(): Promise<number> {
    return api.get<number>("/api/notifications/unread-count");
  }

  async markRead(id: number): Promise<void> {
    await api.put(`/api/notifications/${id}/read?read=true`, {});
  }

  async markAllRead(): Promise<void> {
    await api.put("/api/notifications/read-all", {});
  }

  async updateStatus(id: number, status: NotificationStatus): Promise<void> {
    await api.put(`/api/notifications/${id}/status?status=${status}`, {});
  }

  async deleteNotification(id: number): Promise<void> {
    await api.delete(`/api/notifications/${id}`);
  }

  // Channels
  async listChannels(): Promise<NotificationChannel[]> {
    return api.get<NotificationChannel[]>("/api/notification-channels");
  }

  async createChannel(ch: NotificationChannel): Promise<NotificationChannel> {
    return api.post<NotificationChannel>("/api/notification-channels", ch);
  }

  async updateChannel(id: number, ch: NotificationChannel): Promise<NotificationChannel> {
    return api.put<NotificationChannel>(`/api/notification-channels/${id}`, ch);
  }

  async deleteChannel(id: number): Promise<void> {
    await api.delete(`/api/notification-channels/${id}`);
  }

  async testChannel(id: number): Promise<TestChannelResult> {
    return api.post<TestChannelResult>(`/api/notification-channels/${id}/test`, {});
  }

  // Routes
  async listRoutes(): Promise<NotificationRoute[]> {
    return api.get<NotificationRoute[]>("/api/notification-routes");
  }

  async createRoute(route: NotificationRoute): Promise<NotificationRoute> {
    return api.post<NotificationRoute>("/api/notification-routes", route);
  }

  async updateRoute(id: number, route: NotificationRoute): Promise<NotificationRoute> {
    return api.put<NotificationRoute>(`/api/notification-routes/${id}`, route);
  }

  async deleteRoute(id: number): Promise<void> {
    await api.delete(`/api/notification-routes/${id}`);
  }
}

export const notificationService = new NotificationServiceClient();
