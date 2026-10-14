import { SteamCM, type SteamConnectOptions } from './cm.ts';
import { EResult, hasEResult, SteamError } from './eresult.ts';
import { rsaEncrypt } from './rsa.ts';

export interface SteamGuardPrompt {
  /** which code steam accepts, null when the login can only be approved in the Steam mobile app */
  codeType: 'email' | 'authenticator' | null;
  /** domain the email code was sent to */
  emailDomain?: string;
  /** approving the login in the Steam mobile app finishes it too, without a code */
  canApproveOnDevice: boolean;
  /** the previously submitted code was rejected */
  lastCodeWrong: boolean;
}

/**
 * Asked for a Steam Guard code. When `codeType` is null (or the user approves on their phone instead)
 * the returned promise is simply never used. Rejecting it cancels the login.
 */
export type SteamGuardHandler = (prompt: SteamGuardPrompt) => Promise<string>;

// EAuthSessionGuardType
const Guard = {
  None: 1,
  EmailCode: 2,
  DeviceCode: 3,
  DeviceConfirmation: 4,
  EmailConfirmation: 5,
} as const;
// EAuthTokenPlatformType.SteamClient: ClientLogon only accepts tokens issued for the steam client
const PLATFORM_STEAM_CLIENT = 1;
// ESessionPersistence.Persistent
const PERSISTENT = 1;
// EOSType.Win11 and a desktop pc, what steam-session reports for steam client logins
const OS_TYPE_WIN11 = 20;
const GAMING_DEVICE_PC = 1;
// shows up in the account's authorized devices list
const DEVICE_NAME = 'vaporchat';

// steam-session's default, and enough time to open an email or authenticator when guarded
const LOGIN_TIMEOUT_MS = 30_000;
const GUARDED_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const WRONG_CODE_ERESULTS = new Set<number>([
  EResult.InvalidLoginAuthCode,
  EResult.TwoFactorCodeMismatch,
]);

interface AllowedConfirmation {
  confirmation_type: number;
  associated_message?: string;
}

interface AuthSession {
  client_id: string;
  request_id: Uint8Array;
  /** seconds between polls */
  interval: number;
  allowed_confirmations?: AllowedConfirmation[];
  steamid: string;
}

type AuthCall = <Res>(method: string, body: object) => Promise<Res>;

function guardPrompt(confirmations: AllowedConfirmation[]): SteamGuardPrompt {
  const has = (type: number) =>
    confirmations.find((c) => c.confirmation_type === type);
  const email = has(Guard.EmailCode);
  let codeType: SteamGuardPrompt['codeType'] = null;
  if (has(Guard.DeviceCode)) codeType = 'authenticator';
  else if (email) codeType = 'email';
  return {
    codeType,
    emailDomain: email?.associated_message,
    canApproveOnDevice:
      !!has(Guard.DeviceConfirmation) || !!has(Guard.EmailConfirmation),
    lastCodeWrong: false,
  };
}

async function startAuthSession(
  call: AuthCall,
  accountName: string,
  password: string,
) {
  const key = await call<{
    publickey_mod: string;
    publickey_exp: string;
    timestamp: string;
  }>('Authentication.GetPasswordRSAPublicKey#1', {
    account_name: accountName,
  });
  try {
    return await call<AuthSession>(
      'Authentication.BeginAuthSessionViaCredentials#1',
      {
        account_name: accountName,
        encrypted_password: rsaEncrypt(
          password,
          key.publickey_mod,
          key.publickey_exp,
        ),
        encryption_timestamp: key.timestamp,
        remember_login: true,
        persistence: PERSISTENT,
        website_id: 'Unknown',
        device_details: {
          device_friendly_name: DEVICE_NAME,
          platform_type: PLATFORM_STEAM_CLIENT,
          os_type: OS_TYPE_WIN11,
          gaming_device_type: GAMING_DEVICE_PC,
        },
      },
    );
  } catch (err) {
    if (hasEResult(err, new Set([EResult.InvalidPassword]))) {
      throw new SteamError('Wrong account name or password', err.eresult);
    }
    throw err;
  }
}

/** Polls until the login is approved (or needs no approval) and Steam hands out the token. */
async function pollForRefreshToken(
  call: AuthCall,
  session: AuthSession,
  timeoutMs: number,
  isDone: () => boolean,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !isDone()) {
    try {
      const status = await call<{
        new_client_id?: string;
        refresh_token?: string;
      }>('Authentication.PollAuthSessionStatus#1', {
        client_id: session.client_id,
        request_id: session.request_id,
      });
      if (status.new_client_id) session.client_id = status.new_client_id;
      if (status.refresh_token) return status.refresh_token;
    } catch (err) {
      // a connection that can't be replaced yet gets another try next poll
      if (err instanceof SteamError) throw err;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, session.interval * 1000),
    );
  }
  throw new Error('Steam login timed out');
}

// keeps asking until a code is accepted or the login finishes another way (approved on the phone),
// rejects on anything but a wrong code
async function submitCodes(
  call: AuthCall,
  session: AuthSession,
  steamGuard: SteamGuardHandler,
  prompt: SteamGuardPrompt,
  isDone: () => boolean,
) {
  const codeType =
    prompt.codeType === 'email' ? Guard.EmailCode : Guard.DeviceCode;
  let lastCodeWrong = false;
  while (!isDone()) {
    const code = await steamGuard({ ...prompt, lastCodeWrong });
    if (isDone()) return;
    try {
      await call('Authentication.UpdateAuthSessionWithSteamGuardCode#1', {
        client_id: session.client_id,
        steamid: session.steamid,
        code,
        code_type: codeType,
      });
      return;
    } catch (err) {
      if (!hasEResult(err, WRONG_CODE_ERESULTS)) throw err;
      lastCodeWrong = true;
    }
  }
}

/**
 * Exchanges account name + password for a steam client refresh token over its own Steam
 * connection, handling every Steam Guard variant (email code, authenticator code, approval
 * in the mobile app).
 */
export async function getRefreshTokenWithCredentials(
  accountName: string,
  password: string,
  steamGuard?: SteamGuardHandler,
  options: SteamConnectOptions = {},
): Promise<string> {
  let connecting = SteamCM.connect(options);
  let done = false;
  // android drops a backgrounded app's connection, the auth session outlives it on steam's side
  const call: AuthCall = async (method, body) => {
    const current = connecting;
    try {
      return await (await current).call(method, body, { authenticated: false });
    } catch (err) {
      if (err instanceof SteamError || done) throw err;
      // a poll and a code submission can fail together, one replacement serves both
      if (connecting === current) {
        current.then(
          (cm) => cm.close(),
          () => {},
        );
        connecting = SteamCM.connect(options);
      }
      return (await connecting).call(method, body, { authenticated: false });
    }
  };
  try {
    const session = await startAuthSession(call, accountName, password);
    const confirmations = session.allowed_confirmations ?? [];
    const guarded = !confirmations.some(
      (c) => c.confirmation_type === Guard.None,
    );
    if (!guarded) {
      return await pollForRefreshToken(
        call,
        session,
        LOGIN_TIMEOUT_MS,
        () => done,
      );
    }
    if (!steamGuard) {
      throw new Error(
        `Steam login for ${accountName} requires Steam Guard, but no Steam Guard handler was given`,
      );
    }

    const prompt = guardPrompt(confirmations);
    const guard = prompt.codeType
      ? submitCodes(call, session, steamGuard, prompt, () => done)
      : // approval only: tell the user, the login finishes once they approve
        steamGuard(prompt);
    // the guard only ever ends the login by failing, a submitted code still needs polling
    const guardFailed = guard.then(() => new Promise<never>(() => {}));
    const polling = pollForRefreshToken(
      call,
      session,
      GUARDED_LOGIN_TIMEOUT_MS,
      () => done,
    );
    // whichever loses stops once the login is done, its failure is moot
    polling.catch(() => {});
    guardFailed.catch(() => {});
    return await Promise.race([polling, guardFailed]);
  } finally {
    done = true;
    // a replacement can still be connecting, or have failed to
    connecting.then(
      (cm) => cm.close(),
      () => {},
    );
  }
}
