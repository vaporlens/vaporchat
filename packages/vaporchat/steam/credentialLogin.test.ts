import { constants, generateKeyPairSync, privateDecrypt } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRefreshTokenWithCredentials,
  type SteamGuardPrompt,
} from './credentialLogin.ts';
import { EResult, SteamError } from './eresult.ts';

// EAuthSessionGuardType
const NONE = 1;
const EMAIL_CODE = 2;
const DEVICE_CODE = 3;
const DEVICE_CONFIRMATION = 4;

// Steam's auth service as seen over a connection: checks the RSA-encrypted password,
// guards the login with the scripted confirmations, hands out a token once satisfied
const server = vi.hoisted(() => ({
  password: 'hunter2',
  confirmations: [] as {
    confirmation_type: number;
    associated_message?: string;
  }[],
  acceptedCode: null as string | null,
  satisfied: false,
  /** connections not closed yet */
  open: 0,
  /** the next call dies with its connection, like one Android drops for a backgrounded app */
  dropConnection: false,
  /** how many of the next connects fail, like with the network still cut */
  failConnects: 0,
}));

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

function hexFromBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('hex');
}

vi.mock('./cm.ts', () => ({
  SteamCM: class {
    #closed = false;
    static async connect() {
      if (server.failConnects > 0) {
        server.failConnects--;
        throw new Error('Could not connect to Steam');
      }
      server.open++;
      return new this();
    }
    async call(method: string, body: Record<string, string>) {
      if (server.dropConnection) {
        server.dropConnection = false;
        this.close();
      }
      if (this.#closed) throw new Error('Not connected to Steam');
      switch (method) {
        case 'Authentication.GetPasswordRSAPublicKey#1': {
          const jwk = publicKey.export({ format: 'jwk' });
          return {
            publickey_mod: hexFromBase64Url(jwk.n ?? ''),
            publickey_exp: hexFromBase64Url(jwk.e ?? ''),
            timestamp: '1',
          };
        }
        case 'Authentication.BeginAuthSessionViaCredentials#1': {
          const password = privateDecrypt(
            { key: privateKey, padding: constants.RSA_PKCS1_PADDING },
            Buffer.from(body.encrypted_password, 'base64'),
          ).toString();
          if (password !== server.password) {
            throw new SteamError('InvalidPassword', EResult.InvalidPassword);
          }
          server.satisfied = server.confirmations.some(
            (c) => c.confirmation_type === NONE,
          );
          return {
            client_id: '1',
            request_id: new Uint8Array([1]),
            interval: 0.01,
            allowed_confirmations: server.confirmations,
            steamid: '76561197960287930',
          };
        }
        case 'Authentication.UpdateAuthSessionWithSteamGuardCode#1':
          if (body.code !== server.acceptedCode) {
            throw new SteamError('bad code', EResult.InvalidLoginAuthCode);
          }
          server.satisfied = true;
          return {};
        case 'Authentication.PollAuthSessionStatus#1':
          return server.satisfied ? { refresh_token: 'refresh-token' } : {};
      }
      throw new Error(`unexpected ${method}`);
    }
    close() {
      if (!this.#closed) server.open--;
      this.#closed = true;
    }
  },
}));

describe('getRefreshTokenWithCredentials', () => {
  beforeEach(() => {
    server.confirmations = [{ confirmation_type: NONE }];
    server.acceptedCode = null;
    server.satisfied = false;
    server.open = 0;
    server.dropConnection = false;
    server.failConnects = 0;
  });

  it('returns the token when steam needs no guard, and closes its connection', async () => {
    await expect(
      getRefreshTokenWithCredentials('bot', 'hunter2'),
    ).resolves.toBe('refresh-token');
    expect(server.open).toBe(0);
  });

  it('says so when the password is wrong', async () => {
    await expect(
      getRefreshTokenWithCredentials('bot', 'wrong'),
    ).rejects.toThrow('Wrong account name or password');
  });

  it('fails fast on guarded accounts when nobody can answer the guard', async () => {
    server.confirmations = [{ confirmation_type: DEVICE_CODE }];
    await expect(
      getRefreshTokenWithCredentials('bot', 'hunter2'),
    ).rejects.toThrow(/Steam Guard/);
  });

  it('asks again after a wrong email code', async () => {
    server.confirmations = [
      { confirmation_type: EMAIL_CODE, associated_message: 'example.com' },
    ];
    server.acceptedCode = 'GOOD1';
    const prompts: SteamGuardPrompt[] = [];
    const codes = ['WRONG', 'GOOD1'];
    const steamGuard = async (prompt: SteamGuardPrompt) => {
      prompts.push(prompt);
      return codes.shift() ?? '';
    };

    await expect(
      getRefreshTokenWithCredentials('bot', 'hunter2', steamGuard),
    ).resolves.toBe('refresh-token');
    expect(prompts).toEqual([
      expect.objectContaining({
        codeType: 'email',
        emailDomain: 'example.com',
        lastCodeWrong: false,
      }),
      expect.objectContaining({ lastCodeWrong: true }),
    ]);
  });

  it('finishes when the login is approved on the phone instead of typing the code', async () => {
    server.confirmations = [
      { confirmation_type: DEVICE_CODE },
      { confirmation_type: DEVICE_CONFIRMATION },
    ];
    let prompt: SteamGuardPrompt | null = null;
    const steamGuard = (p: SteamGuardPrompt) => {
      prompt = p;
      // the user approves in the app instead of typing
      server.satisfied = true;
      return new Promise<string>(() => {});
    };

    await expect(
      getRefreshTokenWithCredentials('bot', 'hunter2', steamGuard),
    ).resolves.toBe('refresh-token');
    expect(prompt).toMatchObject({
      codeType: 'authenticator',
      canApproveOnDevice: true,
    });
  });

  it('finishes an approval made while its connection died', async () => {
    server.confirmations = [{ confirmation_type: DEVICE_CONFIRMATION }];
    const steamGuard = () => {
      // the user leaves for the Steam app, approves there and comes back
      server.dropConnection = true;
      server.satisfied = true;
      return new Promise<string>(() => {});
    };

    await expect(
      getRefreshTokenWithCredentials('bot', 'hunter2', steamGuard),
    ).resolves.toBe('refresh-token');
    expect(server.open).toBe(0);
  });

  it('keeps waiting for the approval when reconnecting fails at first', async () => {
    server.confirmations = [{ confirmation_type: DEVICE_CONFIRMATION }];
    const steamGuard = () => {
      server.dropConnection = true;
      server.failConnects = 2;
      server.satisfied = true;
      return new Promise<string>(() => {});
    };

    await expect(
      getRefreshTokenWithCredentials('bot', 'hunter2', steamGuard),
    ).resolves.toBe('refresh-token');
    expect(server.open).toBe(0);
  });

  it('aborts the login when the guard prompt is cancelled', async () => {
    server.confirmations = [{ confirmation_type: DEVICE_CONFIRMATION }];
    const steamGuard = async () => {
      throw new Error('user cancelled');
    };

    await expect(
      getRefreshTokenWithCredentials('bot', 'hunter2', steamGuard),
    ).rejects.toThrow('user cancelled');
    // the abandoned polling must not reconnect for a login nobody waits for
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(server.open).toBe(0);
  });
});
