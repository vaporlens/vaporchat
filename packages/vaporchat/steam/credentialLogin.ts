import {
  EAuthSessionGuardType,
  EAuthTokenPlatformType,
  EResult,
  LoginSession,
} from 'steam-session';
import { hasEResult } from './eresult.ts';

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
 * the returned promise is simply never used.
 */
export type SteamGuardHandler = (prompt: SteamGuardPrompt) => Promise<string>;

// the user needs time to open their email or authenticator
const GUARDED_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const WRONG_CODE_ERESULTS = new Set<number>([
  EResult.InvalidLoginAuthCode,
  EResult.TwoFactorCodeMismatch,
]);

function guardPrompt(
  actions: { type: EAuthSessionGuardType; detail?: string }[],
): SteamGuardPrompt {
  const has = (type: EAuthSessionGuardType) =>
    actions.find((a) => a.type === type);
  const email = has(EAuthSessionGuardType.EmailCode);
  let codeType: SteamGuardPrompt['codeType'] = null;
  if (has(EAuthSessionGuardType.DeviceCode)) codeType = 'authenticator';
  else if (email) codeType = 'email';
  return {
    codeType,
    emailDomain: email?.detail,
    canApproveOnDevice:
      !!has(EAuthSessionGuardType.DeviceConfirmation) ||
      !!has(EAuthSessionGuardType.EmailConfirmation),
    lastCodeWrong: false,
  };
}

/**
 * Exchanges account name + password for a steam client refresh token, handling every
 * Steam Guard variant (email code, authenticator code, approval in the mobile app).
 */
export async function getRefreshTokenWithCredentials(
  accountName: string,
  password: string,
  steamGuard?: SteamGuardHandler,
): Promise<string> {
  // steam-user can only log on with tokens issued for the steam client
  const session = new LoginSession(EAuthTokenPlatformType.SteamClient);
  if (steamGuard) session.loginTimeout = GUARDED_LOGIN_TIMEOUT_MS;

  let fail: (err: Error) => void = () => {};
  const authenticated = new Promise<void>((resolve, reject) => {
    fail = (err) => {
      session.cancelLoginAttempt();
      reject(err);
    };
    session.on('authenticated', () => resolve());
    session.on('timeout', () => reject(new Error('Steam login timed out')));
    session.on('error', reject);
  });

  const started = await session.startWithCredentials({ accountName, password });
  if (started.actionRequired) {
    if (!steamGuard) {
      session.cancelLoginAttempt();
      throw new Error(
        `Steam login for ${accountName} requires Steam Guard, but no Steam Guard handler was given`,
      );
    }
    const actions = started.validActions ?? [];
    const prompt = guardPrompt(actions);
    if (prompt.codeType) {
      submitCodes(session, steamGuard, prompt, authenticated).catch(fail);
    } else {
      // approval only: tell the user, the login finishes once they approve
      steamGuard(prompt).catch(fail);
    }
  }

  await authenticated;
  return session.refreshToken;
}

// keeps asking until a code is accepted or the login finishes another way (approved on the phone),
// rejects on anything but a wrong code
async function submitCodes(
  session: LoginSession,
  steamGuard: SteamGuardHandler,
  prompt: SteamGuardPrompt,
  authenticated: Promise<void>,
) {
  let done = false;
  authenticated.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  let lastCodeWrong = false;
  while (!done) {
    const code = await steamGuard({ ...prompt, lastCodeWrong });
    if (done) return;
    try {
      await session.submitSteamGuardCode(code);
      return;
    } catch (err) {
      if (!hasEResult(err, WRONG_CODE_ERESULTS)) throw err;
      lastCodeWrong = true;
    }
  }
}
