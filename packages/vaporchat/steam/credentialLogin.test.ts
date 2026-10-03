import type { EventEmitter } from 'node:events';
import { EAuthSessionGuardType } from 'steam-session';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRefreshTokenWithCredentials,
  type SteamGuardPrompt,
} from './credentialLogin.ts';

interface ScriptedLogin {
  validActions: { type: EAuthSessionGuardType; detail?: string }[];
  acceptedCode: string | null;
}

const { sessions, script } = vi.hoisted(() => ({
  sessions: [] as EventEmitter[],
  script: { current: null as ScriptedLogin | null },
}));

// stands in for steam's auth servers: guards the login with the scripted actions
vi.mock('steam-session', async (importOriginal) => {
  const original = await importOriginal<typeof import('steam-session')>();
  const { EventEmitter } = await import('node:events');
  class FakeLoginSession extends EventEmitter {
    refreshToken = 'refresh-token';
    loginTimeout = 30_000;
    constructor() {
      super();
      sessions.push(this);
    }
    async startWithCredentials() {
      const login = script.current;
      if (!login || login.validActions.length === 0) {
        setImmediate(() => this.emit('authenticated'));
        return { actionRequired: false };
      }
      return { actionRequired: true, validActions: login.validActions };
    }
    async submitSteamGuardCode(code: string) {
      if (code !== script.current?.acceptedCode) {
        throw Object.assign(new Error('bad code'), {
          eresult: original.EResult.InvalidLoginAuthCode,
        });
      }
      setImmediate(() => this.emit('authenticated'));
    }
    cancelLoginAttempt() {
      return true;
    }
  }
  return { ...original, LoginSession: FakeLoginSession };
});

describe('getRefreshTokenWithCredentials', () => {
  beforeEach(() => {
    sessions.length = 0;
    script.current = null;
  });

  it('returns the token when steam needs no guard', async () => {
    await expect(getRefreshTokenWithCredentials('bot', 'pw')).resolves.toBe(
      'refresh-token',
    );
  });

  it('fails fast on guarded accounts when nobody can answer the guard', async () => {
    script.current = {
      validActions: [{ type: EAuthSessionGuardType.DeviceCode }],
      acceptedCode: 'ABCDE',
    };
    await expect(getRefreshTokenWithCredentials('bot', 'pw')).rejects.toThrow(
      /Steam Guard/,
    );
  });

  it('asks again after a wrong email code', async () => {
    script.current = {
      validActions: [
        { type: EAuthSessionGuardType.EmailCode, detail: 'example.com' },
      ],
      acceptedCode: 'GOOD1',
    };
    const prompts: SteamGuardPrompt[] = [];
    const codes = ['WRONG', 'GOOD1'];
    const steamGuard = async (prompt: SteamGuardPrompt) => {
      prompts.push(prompt);
      return codes.shift() ?? '';
    };

    await expect(
      getRefreshTokenWithCredentials('bot', 'pw', steamGuard),
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
    script.current = {
      validActions: [
        { type: EAuthSessionGuardType.DeviceCode },
        { type: EAuthSessionGuardType.DeviceConfirmation },
      ],
      acceptedCode: null,
    };
    let prompt: SteamGuardPrompt | null = null;
    const steamGuard = (p: SteamGuardPrompt) => {
      prompt = p;
      // the user approves in the app instead of typing
      setImmediate(() => sessions[0].emit('authenticated'));
      return new Promise<string>(() => {});
    };

    await expect(
      getRefreshTokenWithCredentials('bot', 'pw', steamGuard),
    ).resolves.toBe('refresh-token');
    expect(prompt).toMatchObject({
      codeType: 'authenticator',
      canApproveOnDevice: true,
    });
  });

  it('aborts the login when the guard prompt is cancelled', async () => {
    script.current = {
      validActions: [{ type: EAuthSessionGuardType.DeviceConfirmation }],
      acceptedCode: null,
    };
    const steamGuard = async () => {
      throw new Error('user cancelled');
    };

    await expect(
      getRefreshTokenWithCredentials('bot', 'pw', steamGuard),
    ).rejects.toThrow('user cancelled');
  });
});
