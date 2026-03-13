import crypto from 'crypto';
import { getSetting as getDatabaseSetting } from '../database.js';

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface AccessTokenResponse {
  access_token: string;
}

type FlowStatus = 'pending' | 'authorized' | 'expired' | 'error';

interface FlowState {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresAt: number;
}

interface TempCredential {
  token: string;
  expiresAt: number;
}

export interface CopilotAuthStartResult {
  flowId: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface CopilotAuthStatusResult {
  status: FlowStatus;
  userCode?: string;
  verificationUri?: string;
  expiresAt?: string;
  tempCredentialId?: string;
  error?: string;
}

export class FlowNotFoundError extends Error {
  readonly code = 'COPILOT_FLOW_NOT_FOUND';

  constructor(message = 'Copilot authorization flow not found') {
    super(message);
    this.name = 'FlowNotFoundError';
  }
}

class CopilotDeviceFlowService {
  private readonly clientID = process.env.GITHUB_COPILOT_CLIENT_ID || 'Iv1.b507a08c87ecfe98';
  private readonly scopes = 'read:user';
  private readonly tempCredentialTTL = 10 * 60 * 1000;
  private signingSecret: string | null = null;

  async start(): Promise<CopilotAuthStartResult> {
    const response = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: this.formEncode({
        client_id: this.clientID,
        scope: this.scopes,
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub device code request failed: HTTP ${response.status}`);
    }

    const data = await response.json() as DeviceCodeResponse;
    const now = Date.now();
    const expiresAt = now + (data.expires_in * 1000);
    const flowId = await this.signToken({
      kind: 'copilot_flow',
      v: 1,
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      interval: data.interval,
      expiresAt,
    });

    return {
      flowId,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresIn: data.expires_in,
      interval: data.interval,
    };
  }

  async getStatus(flowId: string): Promise<CopilotAuthStatusResult> {
    const flow = await this.readFlowToken(flowId);
    if (!flow || Date.now() >= flow.expiresAt) {
      return {
        status: 'expired',
        userCode: flow?.userCode,
        verificationUri: flow?.verificationUri,
        expiresAt: flow ? new Date(flow.expiresAt).toISOString() : undefined,
      };
    }

    const polled = await this.pollForToken(flow);
    if (!polled) {
      throw new FlowNotFoundError();
    }

    const result: CopilotAuthStatusResult = {
      status: polled.status,
      userCode: flow.userCode,
      verificationUri: flow.verificationUri,
      expiresAt: new Date(flow.expiresAt).toISOString(),
    };
    if (polled.tempCredentialId) result.tempCredentialId = polled.tempCredentialId;
    if (polled.error) result.error = polled.error;
    return result;
  }

  async consumeTempCredential(tempCredentialId: string): Promise<string> {
    const credential = await this.readTempCredentialToken(tempCredentialId);
    if (!credential || Date.now() >= credential.expiresAt) {
      throw new Error('Copilot authorization is missing or expired');
    }
    return credential.token;
  }

  private async pollForToken(flow: FlowState): Promise<{ status: FlowStatus; error?: string; tempCredentialId?: string } | null> {
    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: this.formEncode({
          client_id: this.clientID,
          device_code: flow.deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });

      if (!response.ok) {
        return {
          status: 'error',
          error: `GitHub token polling failed: HTTP ${response.status}`,
        };
      }

      const data = await response.json() as { error?: string } & Partial<AccessTokenResponse>;
      if (data.error) {
        if (data.error === 'authorization_pending') {
          return { status: 'pending' };
        }

        if (data.error === 'slow_down') {
          return { status: 'pending' };
        }

        if (data.error === 'expired_token') {
          return { status: 'expired' };
        }

        return { status: 'error', error: data.error };
      }

      if (!data.access_token) {
        return { status: 'error', error: 'GitHub did not return an access token' };
      }

      const tempCredentialId = await this.signToken({
        kind: 'copilot_temp_credential',
        v: 1,
        token: data.access_token,
        expiresAt: Date.now() + this.tempCredentialTTL,
      });

      return {
        status: 'authorized',
        tempCredentialId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown network error';
      return {
        status: 'pending',
        error: `Temporary network error while polling GitHub token (${message}). Retrying...`,
      };
    }
  }

  private async getSigningSecret(): Promise<string> {
    if (this.signingSecret) {
      return this.signingSecret;
    }
    const configured = process.env.AIMETER_COPILOT_FLOW_SECRET?.trim()
      || process.env.AIMETER_AUTH_SESSION_SECRET?.trim();
    if (configured) {
      this.signingSecret = configured;
      return this.signingSecret;
    }
    const dbSecret = (await getDatabaseSetting('session_secret'))?.trim();
    if (!dbSecret) {
      throw new Error('Session secret is not initialized for Copilot flow');
    }
    this.signingSecret = dbSecret;
    return this.signingSecret;
  }

  private async signToken(payload: Record<string, unknown>): Promise<string> {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = crypto
      .createHmac('sha256', await this.getSigningSecret())
      .update(body)
      .digest('base64url');
    return `${body}.${signature}`;
  }

  private async verifyToken(token: string): Promise<Record<string, unknown> | null> {
    const [body, signature] = token.split('.');
    if (!body || !signature) return null;
    const expectedSignature = crypto
      .createHmac('sha256', await this.getSigningSecret())
      .update(body)
      .digest('base64url');
    const left = Buffer.from(signature, 'utf8');
    const right = Buffer.from(expectedSignature, 'utf8');
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
      return null;
    }
    try {
      const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  private async readFlowToken(flowToken: string): Promise<FlowState | null> {
    const payload = await this.verifyToken(flowToken);
    if (!payload) return null;
    if (payload.kind !== 'copilot_flow' || payload.v !== 1) return null;
    if (
      typeof payload.deviceCode !== 'string'
      || typeof payload.userCode !== 'string'
      || typeof payload.verificationUri !== 'string'
      || typeof payload.interval !== 'number'
      || typeof payload.expiresAt !== 'number'
    ) {
      return null;
    }
    return {
      deviceCode: payload.deviceCode,
      userCode: payload.userCode,
      verificationUri: payload.verificationUri,
      interval: payload.interval,
      expiresAt: payload.expiresAt,
    };
  }

  private async readTempCredentialToken(token: string): Promise<TempCredential | null> {
    const payload = await this.verifyToken(token);
    if (!payload) return null;
    if (payload.kind !== 'copilot_temp_credential' || payload.v !== 1) return null;
    if (typeof payload.token !== 'string' || typeof payload.expiresAt !== 'number') return null;
    return {
      token: payload.token,
      expiresAt: payload.expiresAt,
    };
  }

  private formEncode(values: Record<string, string>): string {
    return Object.entries(values)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  }
}

export const copilotDeviceFlowService = new CopilotDeviceFlowService();
