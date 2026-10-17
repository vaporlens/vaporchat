import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SteamCM } from './cm.ts';
import { getRefreshTokenWithCredentials } from './credentialLogin.ts';
import { EResult } from './eresult.ts';
import { logOnSteam, type TokenStore, webSession } from './logOn.ts';

vi.mock('./credentialLogin.ts', () => ({
  getRefreshTokenWithCredentials: vi.fn(),
}));
const credentialLogin = vi.mocked(getRefreshTokenWithCredentials);

// scripted EResults for the next logons, the tokens they were attempted with,
// and the token steam hands out when asked to renew (null: not due yet)
const steam = vi.hoisted(() => ({
  results: [] as number[],
  tokens: [] as string[],
  logonIds: [] as number[],
  renewed: null as string | null,
}));

// a Steam connection that answers ClientLogon with the next scripted result
vi.mock('./cm.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./cm.ts')>();
  const { encodeProto } = await import('./protos.ts');
  type Handler = (header: object, body: Uint8Array) => void;
  class FakeCM {
    #handlers = new Map<number | string, Handler>();
    static async connect() {
      return new FakeCM();
    }
    onMessage(key: number | string, handler: Handler) {
      this.#handlers.set(key, handler);
      return () => {};
    }
    on() {
      return () => {};
    }
    send(
      _emsg: number,
      _type: string,
      body: { access_token: string; obfuscated_private_ip: { v4: number } },
    ) {
      steam.tokens.push(body.access_token);
      steam.logonIds.push(body.obfuscated_private_ip.v4);
      const eresult = steam.results.shift() ?? 1;
      queueMicrotask(() =>
        this.#handlers.get(actual.EMsg.ClientLogOnResponse)?.(
          {},
          encodeProto('CMsgClientLogonResponse', { eresult }),
        ),
      );
    }
    async call() {
      return steam.renewed ? { refresh_token: steam.renewed } : {};
    }
    startSession() {}
    close() {}
  }
  return { ...actual, SteamCM: FakeCM };
});

const credentials = { accountName: 'Bot', password: 'hunter2' };

/** A refresh token is a JWT, the label only tells tokens apart in assertions. */
function token(label: string) {
  const payload = btoa(JSON.stringify({ sub: '76561197960287930', label }));
  return `header.${payload}.signature`;
}

function memoryStore(initial: string | null = null) {
  const store = {
    token: initial,
    load: async () => store.token,
    save: async (refreshToken: string) => {
      store.token = refreshToken;
    },
    clear: async () => {
      store.token = null;
    },
  };
  return store satisfies TokenStore;
}

describe('logOnSteam', () => {
  beforeEach(() => {
    steam.results = [];
    steam.tokens = [];
    steam.logonIds = [];
    steam.renewed = null;
    credentialLogin.mockReset();
  });

  it('logs in with credentials once and reuses the saved token afterwards', async () => {
    credentialLogin.mockResolvedValue(token('one'));
    const store = memoryStore();

    await logOnSteam(store, { credentials });
    await logOnSteam(store, { credentials });

    expect(steam.tokens).toEqual([token('one'), token('one')]);
    expect(credentialLogin).toHaveBeenCalledTimes(1);
  });

  it('falls back to credentials when steam rejects the stored token', async () => {
    credentialLogin.mockResolvedValue(token('fresh'));
    const store = memoryStore(token('stale'));
    steam.results = [EResult.AccessDenied, EResult.OK];

    await logOnSteam(store, { credentials });

    expect(steam.tokens).toEqual([token('stale'), token('fresh')]);
    expect(store.token).toBe(token('fresh'));
  });

  it('saves the token steam renews after logging on with the stored one', async () => {
    const store = memoryStore(token('old'));
    steam.renewed = token('renewed');

    await logOnSteam(store);

    expect(store.token).toBe(token('renewed'));
  });

  it('logs on as the same device every time, so Steam replaces the session before', async () => {
    const store = memoryStore(token('good'));

    await logOnSteam(store, { logonId: 42 });
    await logOnSteam(store, { logonId: 42 });
    await logOnSteam(store);
    await logOnSteam(store);

    const [given, again, ownA, ownB] = steam.logonIds;
    expect([given, again]).toEqual([42, 42]);
    // left out, one for the process
    expect(ownA).toBe(ownB);
  });

  it('keeps the stored token on errors unrelated to the token', async () => {
    const store = memoryStore(token('good'));
    const SERVICE_UNAVAILABLE = 20;
    steam.results = [SERVICE_UNAVAILABLE];

    await expect(logOnSteam(store, { credentials })).rejects.toThrow();

    expect(credentialLogin).not.toHaveBeenCalled();
    expect(store.token).toBe(token('good'));
  });
});

describe('webSession', () => {
  it('logs steamcommunity.com in with an access token, same session id in cookie and forms', async () => {
    const cm = {
      steamid: '76561197960287930',
      call: async () => ({ access_token: 'token' }),
    } as unknown as SteamCM;
    const { sessionid, cookie } = await webSession(cm, 'refresh');
    expect(cookie).toBe(
      `steamLoginSecure=76561197960287930%7C%7Ctoken; sessionid=${sessionid}`,
    );
  });
});
