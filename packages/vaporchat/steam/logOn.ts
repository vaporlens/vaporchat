import type { EventEmitter } from 'node:events';
import { once } from 'node:events';
import SteamUser from 'steam-user';
import {
  getRefreshTokenWithCredentials,
  type SteamGuardHandler,
} from './credentialLogin.ts';
import { hasEResult } from './eresult.ts';
import {
  deleteRefreshToken,
  loadRefreshToken,
  saveRefreshToken,
} from './refreshToken.ts';

export interface SteamCredentials {
  accountName: string;
  password: string;
}

export type LogOnClient = Pick<SteamUser, 'logOn'> & EventEmitter;

// what steam answers when it no longer accepts a stored refresh token
const REJECTED_TOKEN_ERESULTS = new Set<number>([
  SteamUser.EResult.InvalidPassword,
  SteamUser.EResult.AccessDenied,
  SteamUser.EResult.Revoked,
  SteamUser.EResult.Expired,
]);

// resolves once logged on (rejects on steam-user's 'error'), steam-user keeps the session alive from there
async function logOnWithToken(client: LogOnClient, refreshToken: string) {
  const loggedOn = once(client, 'loggedOn');
  client.logOn({ refreshToken });
  await loggedOn;
}

export interface LogOnOptions {
  /** answers Steam Guard challenges, without it guarded accounts fail to log in with credentials */
  steamGuard?: SteamGuardHandler;
}

/**
 * Logs in with the refresh token stored in `dataDir`, and only falls back to
 * credentials when there is no token or steam rejected it.
 * The client must be created with `renewRefreshTokens: true` so renewed tokens get persisted.
 */
export async function logOnSteam(
  client: LogOnClient,
  credentials: SteamCredentials,
  dataDir: string,
  options: LogOnOptions = {},
) {
  const { accountName, password } = credentials;
  // steam-user emits this when it renews the token, the old one dies once a new one is issued.
  // saves are chained so a slow write can never overwrite a newer token
  let pendingSave = Promise.resolve();
  client.on('refreshToken', (refreshToken: string) => {
    pendingSave = pendingSave
      .then(() => saveRefreshToken(dataDir, accountName, refreshToken))
      .catch((err) => {
        console.error(
          `Failed to save Steam refresh token for ${accountName}`,
          err,
        );
      });
  });

  const storedToken = await loadRefreshToken(dataDir, accountName);
  if (storedToken) {
    try {
      await logOnWithToken(client, storedToken);
      await pendingSave;
      console.log(`Logged in to Steam as ${accountName} with stored token`);
      return;
    } catch (err) {
      if (!hasEResult(err, REJECTED_TOKEN_ERESULTS)) throw err;
      console.log(
        `Steam rejected stored token for ${accountName} (${err.message}), logging in with credentials`,
      );
      await deleteRefreshToken(dataDir, accountName);
    }
  } else {
    console.log(
      `No stored Steam token for ${accountName}, logging in with credentials`,
    );
  }

  const refreshToken = await getRefreshTokenWithCredentials(
    accountName,
    password,
    options.steamGuard,
  );
  await saveRefreshToken(dataDir, accountName, refreshToken);
  await logOnWithToken(client, refreshToken);
  await pendingSave;
  console.log(`Logged in to Steam as ${accountName} with credentials`);
}
