import crypto from 'crypto';

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
  id: string;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresAt: number;
  nextPollAt: number;
  transientFailureCount: number;
  status: FlowStatus;
  error?: string;
  tempCredentialId?: string;
}

interface TempCredential {
  id: string;
  token: string;
  createdAt: number;
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
  private readonly flows = new Map<string, FlowState>();
  private readonly tempCredentials = new Map<string, TempCredential>();
  private readonly tempCredentialTTL = 10 * 60 * 1000;

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
    const flowId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + (data.expires_in * 1000);

    this.flows.set(flowId, {
      id: flowId,
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      interval: data.interval,
      expiresAt,
      nextPollAt: now,
      transientFailureCount: 0,
      status: 'pending',
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
    this.cleanupExpiredCredentials();

    const flow = this.flows.get(flowId);
    if (!flow) {
      throw new FlowNotFoundError();
    }

    const now = Date.now();
    if (now >= flow.expiresAt) {
      flow.status = 'expired';
    }

    if (flow.status === 'pending' && now >= flow.nextPollAt) {
      await this.pollForToken(flow);
    }

    return {
      status: flow.status,
      userCode: flow.userCode,
      verificationUri: flow.verificationUri,
      expiresAt: new Date(flow.expiresAt).toISOString(),
      tempCredentialId: flow.tempCredentialId,
      error: flow.error,
    };
  }

  consumeTempCredential(tempCredentialId: string): string {
    this.cleanupExpiredCredentials();

    const credential = this.tempCredentials.get(tempCredentialId);
    if (!credential) {
      throw new Error('Copilot authorization is missing or expired');
    }

    this.tempCredentials.delete(tempCredentialId);
    return credential.token;
  }

  private async pollForToken(flow: FlowState): Promise<void> {
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
        flow.status = 'error';
        flow.error = `GitHub token polling failed: HTTP ${response.status}`;
        return;
      }

      const data = await response.json() as { error?: string } & Partial<AccessTokenResponse>;
      if (data.error) {
        if (data.error === 'authorization_pending') {
          flow.error = undefined;
          flow.nextPollAt = Date.now() + (flow.interval * 1000);
          return;
        }

        if (data.error === 'slow_down') {
          flow.error = undefined;
          flow.nextPollAt = Date.now() + ((flow.interval + 5) * 1000);
          return;
        }

        if (data.error === 'expired_token') {
          flow.status = 'expired';
          flow.error = undefined;
          return;
        }

        flow.status = 'error';
        flow.error = data.error;
        return;
      }

      if (!data.access_token) {
        flow.status = 'error';
        flow.error = 'GitHub did not return an access token';
        return;
      }

      const tempCredentialId = crypto.randomUUID();
      this.tempCredentials.set(tempCredentialId, {
        id: tempCredentialId,
        token: data.access_token,
        createdAt: Date.now(),
      });

      flow.status = 'authorized';
      flow.tempCredentialId = tempCredentialId;
      flow.nextPollAt = Number.MAX_SAFE_INTEGER;
      flow.error = undefined;
      flow.transientFailureCount = 0;
    } catch (error) {
      flow.status = 'pending';
      flow.transientFailureCount += 1;
      const message = error instanceof Error ? error.message : 'Unknown network error';
      flow.error = `Temporary network error while polling GitHub token (${message}). Retrying...`;
      const delayMs = Math.min((flow.interval + (flow.transientFailureCount * 5)) * 1000, 60_000);
      flow.nextPollAt = Date.now() + delayMs;
    }
  }

  private cleanupExpiredCredentials(): void {
    const now = Date.now();
    for (const [id, credential] of this.tempCredentials.entries()) {
      if (now - credential.createdAt > this.tempCredentialTTL) {
        this.tempCredentials.delete(id);
      }
    }
  }

  private formEncode(values: Record<string, string>): string {
    return Object.entries(values)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  }
}

export const copilotDeviceFlowService = new CopilotDeviceFlowService();
