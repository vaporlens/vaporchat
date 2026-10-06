import { useRef } from 'react';

/**
 * The value, or the last one that wasn't null while it is: a closing modal keeps showing what
 * it showed as it animates away, instead of going blank.
 */
export function useLastShown<T>(value: T | null | undefined): T | null {
  const last = useRef<T | null>(null);
  if (value != null) last.current = value;
  return last.current;
}
