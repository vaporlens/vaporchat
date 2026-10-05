import {
  EMsg,
  PROTOCOL_VERSION,
  SteamCM,
  type SteamConnectOptions,
} from './cm.ts';
import {
  getRefreshTokenWithCredentials,
  type SteamGuardHandler,
} from './credentialLogin.ts';
import { EResult, hasEResult, SteamError } from './eresult.ts';
import { hex } from './friends.ts';
import { decodeProto } from './protos.ts';

/** Where the refresh token lives between app starts (secure storage on phones, localStorage on web). */
export interface TokenStore {
  load(): Promise<string | null>;
  save(refreshToken: string): Promise<void>;
  clear(): Promise<void>;
}

export interface SteamCredentials {
  accountName: string;
  password: string;
}

// what steam answers when it no longer accepts a stored refresh token
const REJECTED_TOKEN_ERESULTS = new Set<number>([
  EResult.InvalidPassword,
  EResult.AccessDenied,
  EResult.Revoked,
  EResult.Expired,
]);

// shows up in the account's authorized devices list
const MACHINE_NAME = 'vaporchat';
const DEFAULT_HEARTBEAT_SECONDS = 9;
// EOSType.Win11, the os steam-user reports for windows hosts
const CLIENT_OS_TYPE = 20;
// ETokenRenewalType.Allow: steam issues a new refresh token when the old one gets close to expiring
const TOKEN_RENEWAL_ALLOW = 1;

/** Refresh tokens are JWTs whose subject is the account's SteamID64. */
export function steamIdFromRefreshToken(refreshToken: string) {
  const payload = refreshToken.split('.')[1] ?? '';
  const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  const { sub } = JSON.parse(json) as { sub?: string };
  if (!sub) throw new Error('Not a Steam refresh token');
  return sub;
}

export interface LogOnConnectOptions extends SteamConnectOptions {
  /**
   * Runs on every new connection before logging on. Steam sends things like the friends list
   * together with the logon response, so their handlers have to be registered here.
   */
  beforeLogOn?: (cm: SteamCM) => void;
}

/** Connects to Steam and logs on with a refresh token issued for the steam client. */
export async function logOnWithRefreshToken(
  refreshToken: string,
  { beforeLogOn, ...connectOptions }: LogOnConnectOptions = {},
) {
  const steamid = steamIdFromRefreshToken(refreshToken);
  const cm = await SteamCM.connect(connectOptions);
  beforeLogOn?.(cm);
  const response = new Promise<{
    steamid?: string;
    sessionId?: number;
    eresult: number;
    heartbeatSeconds?: number;
  }>((resolve, reject) => {
    const offResponse = cm.onMessage(
      EMsg.ClientLogOnResponse,
      (header, body) => {
        offResponse();
        offClose();
        const logon = decodeProto<{
          eresult: number;
          heartbeat_seconds?: number;
        }>('CMsgClientLogonResponse', body);
        resolve({
          steamid: header.steamid,
          sessionId: header.client_sessionid,
          eresult: logon.eresult,
          heartbeatSeconds: logon.heartbeat_seconds,
        });
      },
    );
    const offClose = cm.on('close', ({ reason }) =>
      reject(new Error(`Steam closed the connection during login: ${reason}`)),
    );
  });
  cm.send(
    EMsg.ClientLogon,
    'CMsgClientLogon',
    {
      protocol_version: PROTOCOL_VERSION,
      client_os_type: CLIENT_OS_TYPE,
      client_language: 'english',
      machine_name: MACHINE_NAME,
      should_remember_password: true,
      supports_rate_limit_response: true,
      // the "new" friends/group chat, which voice chat belongs to
      chat_mode: 2,
      access_token: refreshToken,
      // steam replaces a session from the same address with the same id, so a second
      // vaporchat (phone and web, say) would kick the first one
      obfuscated_private_ip: { v4: Math.floor(Math.random() * 0xffffffff) },
    },
    { steamid },
  );
  const logon = await response;
  if (logon.eresult !== EResult.OK) {
    cm.close();
    throw new SteamError('Steam rejected the login', logon.eresult);
  }
  cm.startSession(
    logon.steamid ?? steamid,
    logon.sessionId ?? 0,
    logon.heartbeatSeconds || DEFAULT_HEARTBEAT_SECONDS,
  );
  // steam signals a kicked or expired session this way before closing the socket
  cm.onMessage(EMsg.ClientLoggedOff, () => cm.close());
  return cm;
}

/** An access token for the logged on account. With `renew`, Steam may also hand out a new refresh token. */
function generateAccessToken(cm: SteamCM, refreshToken: string, renew = false) {
  return cm.call<{ access_token?: string; refresh_token?: string }>(
    'Authentication.GenerateAccessTokenForApp#1',
    {
      refresh_token: refreshToken,
      steamid: cm.steamid,
      ...(renew && { renewal_type: TOKEN_RENEWAL_ALLOW }),
    },
  );
}

export interface WebSession {
  sessionid: string;
  /** the cookie header steamcommunity.com wants */
  cookie: string;
}

/** A steamcommunity.com session for the logged on account. */
export async function webSession(
  cm: SteamCM,
  refreshToken: string,
): Promise<WebSession> {
  const { access_token } = await generateAccessToken(cm, refreshToken);
  if (!access_token) throw new Error('Steam gave no web session');
  // any value works as the session id, as long as cookie and form agree
  const sessionid = hex(crypto.getRandomValues(new Uint8Array(12)));
  return {
    sessionid,
    cookie: `steamLoginSecure=${cm.steamid}%7C%7C${access_token}; sessionid=${sessionid}`,
  };
}

/** Swaps the stored token for a fresh one when Steam offers it, tokens last about 200 days. */
async function renewRefreshToken(
  cm: SteamCM,
  refreshToken: string,
  store: TokenStore,
) {
  try {
    const renewed = await generateAccessToken(cm, refreshToken, true);
    if (renewed.refresh_token) await store.save(renewed.refresh_token);
  } catch (err) {
    // the old token still works, the next logon tries again
    console.warn('Renewing the Steam refresh token failed:', err);
  }
}

export interface LogOnOptions extends LogOnConnectOptions {
  /** used when there is no stored token or Steam rejected it */
  credentials?: SteamCredentials;
  /** answers Steam Guard challenges, without it guarded accounts can't log in with credentials */
  steamGuard?: SteamGuardHandler;
}

/**
 * Logs on with the stored refresh token, and only falls back to credentials when there
 * is no token or Steam rejected it. Fresh and renewed tokens are saved to the store.
 */
export async function logOnSteam(
  store: TokenStore,
  { credentials, steamGuard, ...connectOptions }: LogOnOptions = {},
) {
  const stored = await store.load();
  if (stored) {
    try {
      const cm = await logOnWithRefreshToken(stored, connectOptions);
      await renewRefreshToken(cm, stored, store);
      return cm;
    } catch (err) {
      if (!hasEResult(err, REJECTED_TOKEN_ERESULTS)) throw err;
      await store.clear();
    }
  }
  if (!credentials) {
    throw new Error('Not signed in to Steam, account name and password needed');
  }
  const refreshToken = await getRefreshTokenWithCredentials(
    credentials.accountName,
    credentials.password,
    steamGuard,
    { serverListUrl: connectOptions.serverListUrl },
  );
  await store.save(refreshToken);
  return logOnWithRefreshToken(refreshToken, connectOptions);
}
