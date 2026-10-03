import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import SteamUser from 'steam-user';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRefreshTokenWithCredentials } from './credentialLogin.ts';
import { type LogOnClient, logOnSteam } from './logOn.ts';
import { loadRefreshToken, saveRefreshToken } from './refreshToken.ts';

vi.mock('./credentialLogin.ts', () => ({
  getRefreshTokenWithCredentials: vi.fn(),
}));
const credentialLogin = vi.mocked(getRefreshTokenWithCredentials);

type LogOnDetails = Parameters<SteamUser['logOn']>[0];

const credentials = { accountName: 'Bot', password: 'hunter2' };

// answers each logOn call with the next scripted steam reaction
class FakeSteamClient extends EventEmitter {
  logOns: LogOnDetails[] = [];
  reactions: Array<(client: FakeSteamClient) => void>;
  constructor(reactions: Array<(client: FakeSteamClient) => void>) {
    super();
    this.reactions = reactions;
  }
  logOn(details: LogOnDetails) {
    this.logOns.push(details);
    const react = this.reactions.shift();
    if (!react) throw new Error('unexpected logOn');
    setImmediate(() => react(this));
  }
}

const loggedOn = (client: FakeSteamClient) => client.emit('loggedOn');
const fail = (eresult: number) => (client: FakeSteamClient) =>
  client.emit(
    'error',
    Object.assign(new Error(`eresult ${eresult}`), { eresult }),
  );

function asClient(fake: FakeSteamClient) {
  return fake as unknown as LogOnClient;
}

describe('logOnSteam', () => {
  let dataDir: string;
  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'vaporchat-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    credentialLogin.mockReset();
  });
  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('logs in with credentials once and reuses the saved token afterwards', async () => {
    credentialLogin.mockResolvedValue('token-1');
    const first = new FakeSteamClient([loggedOn]);
    await logOnSteam(asClient(first), credentials, dataDir);
    expect(first.logOns).toEqual([{ refreshToken: 'token-1' }]);

    const second = new FakeSteamClient([loggedOn]);
    await logOnSteam(asClient(second), credentials, dataDir);
    expect(second.logOns).toEqual([{ refreshToken: 'token-1' }]);
    expect(credentialLogin).toHaveBeenCalledTimes(1);
  });

  it('falls back to credentials when steam rejects the stored token', async () => {
    await saveRefreshToken(dataDir, credentials.accountName, 'stale');
    credentialLogin.mockResolvedValue('fresh');
    const client = new FakeSteamClient([
      fail(SteamUser.EResult.AccessDenied),
      loggedOn,
    ]);

    await logOnSteam(asClient(client), credentials, dataDir);

    expect(client.logOns).toEqual([
      { refreshToken: 'stale' },
      { refreshToken: 'fresh' },
    ]);
    expect(await loadRefreshToken(dataDir, credentials.accountName)).toBe(
      'fresh',
    );
  });

  it('keeps the stored token on errors unrelated to the token', async () => {
    await saveRefreshToken(dataDir, credentials.accountName, 'good');
    const client = new FakeSteamClient([
      fail(SteamUser.EResult.ServiceUnavailable),
    ]);

    await expect(
      logOnSteam(asClient(client), credentials, dataDir),
    ).rejects.toThrow();

    expect(credentialLogin).not.toHaveBeenCalled();
    expect(await loadRefreshToken(dataDir, credentials.accountName)).toBe(
      'good',
    );
  });

  it('persists tokens renewed later in the session', async () => {
    await saveRefreshToken(dataDir, credentials.accountName, 'old');
    const client = new FakeSteamClient([loggedOn]);
    await logOnSteam(asClient(client), credentials, dataDir);

    client.emit('refreshToken', 'renewed');
    await vi.waitFor(async () =>
      expect(await loadRefreshToken(dataDir, credentials.accountName)).toBe(
        'renewed',
      ),
    );
  });
});
