import type { WebSession } from './logOn.ts';
import { COMMUNITY_URL, fetchWithCookie } from './web.ts';

const LOGIN_URL = `${COMMUNITY_URL}openid/login`;
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';

/**
 * Signs in to `realm` with Steam OpenID as the web session's account, without the user.
 * Returns the URL Steam sends back to, which carries the signed assertion. Fetch it without Steam's cookie.
 * `fetchImpl` must honour `redirect: 'manual'`, React Native's global fetch doesn't.
 */
export async function openIdSignIn(
  session: WebSession,
  realm: string,
  returnTo: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  // followed, Steam's redirect would carry the cookie to `returnTo`
  const manual = { redirect: 'manual' } as const;
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.realm': realm,
    'openid.return_to': returnTo,
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  });
  const page = await fetchWithCookie(
    `${LOGIN_URL}?${params}`,
    session.cookie,
    manual,
    fetchImpl,
  );
  const form = (await page.text()).match(
    /<form[^>]*id="openidForm"[\s\S]*?<\/form>/,
  )?.[0];
  if (!form) throw new Error('Steam showed no sign-in form');
  // the form's nonce only counts with the cookie Steam set next to it
  const nonce = page.headers
    .get('set-cookie')
    ?.match(/sessionidSecureOpenIDNonce=[^;,\s]+/)?.[0];
  if (!nonce) throw new Error('Steam set no sign-in nonce');

  // multipart like the form, Steam refuses the same fields url-encoded
  const fields = new FormData();
  for (const [, name, value] of form.matchAll(
    /<input type="hidden"[^>]*name="([^"]+)" value="([^"]*)"/g,
  )) {
    fields.append(name, value);
  }
  // not to the form's action: the cookie goes only to Steam's own login page
  const response = await fetchWithCookie(
    LOGIN_URL,
    `${session.cookie}; ${nonce}`,
    { ...manual, method: 'POST', body: fields },
    fetchImpl,
  );
  const location = response.headers.get('location');
  if (!location?.startsWith(`${returnTo}?`)) {
    throw new Error(
      `Steam didn't sign in to ${realm}: HTTP ${response.status}, to ${location?.split('?')[0] ?? 'nowhere'}`,
    );
  }
  return location;
}
