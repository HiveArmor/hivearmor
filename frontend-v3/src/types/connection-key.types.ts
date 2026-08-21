/**
 * Connection Key Types — API keys and connection tokens (ADM-06)
 */

export interface ConnectionKeyDTO {
  id: string;
  name: string;
  createdDate: string;
  lastUsed?: string;
  expiryDate?: string;
  status: 'active' | 'revoked' | 'expired';
  tenantId?: number;
}

export interface CreateConnectionKeyRequest {
  name: string;
  expiryDate?: string;
  tenantId?: number;
}

export interface CreateConnectionKeyResponse {
  id: string;
  name: string;
  key: string; // Raw key — only shown once
  createdDate: string;
  expiryDate?: string;
}
