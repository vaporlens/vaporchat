/** Whether `err` is a steam error carrying one of the given EResults. */
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
