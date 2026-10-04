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

/** Refresh tokens are JWTs whose subject is the account's SteamID64. */
export function steamIdFromRefreshToken(refreshToken: string) {
  const payload = refreshToken.split('.')[1] ?? '';
  const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  const { sub } = JSON.parse(json) as { sub?: string };
  if (!sub) throw new Error('Not a Steam refresh token');
  return sub;
}

/** Connects to Steam and logs on with a refresh token issued for the steam client. */
export async function logOnWithRefreshToken(
  refreshToken: string,
  options: SteamConnectOptions = {},
) {
  const steamid = steamIdFromRefreshToken(refreshToken);
  const cm = await SteamCM.connect(options);
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

export interface LogOnOptions extends SteamConnectOptions {
  /** used when there is no stored token or Steam rejected it */
  credentials?: SteamCredentials;
  /** answers Steam Guard challenges, without it guarded accounts can't log in with credentials */
  steamGuard?: SteamGuardHandler;
}

/**
 * Logs on with the stored refresh token, and only falls back to credentials when there
 * is no token or Steam rejected it. Fresh tokens are saved to the store.
 */
export async function logOnSteam(
  store: TokenStore,
  { credentials, steamGuard, ...connectOptions }: LogOnOptions = {},
) {
  const stored = await store.load();
  if (stored) {
    try {
      return await logOnWithRefreshToken(stored, connectOptions);
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
  );
  await store.save(refreshToken);
  return logOnWithRefreshToken(refreshToken, connectOptions);
}
