/** Steam result codes this library checks for (EResult). */
export const EResult = {
  OK: 1,
  Fail: 2,
  InvalidPassword: 5,
  AccessDenied: 15,
  Revoked: 26,
  Expired: 27,
  InvalidLoginAuthCode: 65,
  TwoFactorCodeMismatch: 88,
} as const;

/** A Steam call that came back with a non-OK EResult. */
export class SteamError extends Error {
  readonly eresult: number;
  constructor(message: string, eresult: number) {
    super(message);
    this.eresult = eresult;
  }
}

/** Whether `err` carries one of the given EResults. */
export function hasEResult(
  err: unknown,
  eresults: ReadonlySet<number>,
): err is Error & { eresult: number } {
  return (
    err instanceof Error &&
    'eresult' in err &&
    typeof err.eresult === 'number' &&
    eresults.has(err.eresult)
  );
}
