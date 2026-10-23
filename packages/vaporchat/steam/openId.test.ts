import { describe, expect, it, vi } from 'vitest';
import type { WebSession } from './logOn.ts';
import { openIdSignIn } from './openId.ts';

// Steam's signed-in form, account name, avatar and nonce replaced
const FORM = `<form enctype="multipart/form-data" action="https://steamcommunity.com/openid/login" method="POST" name="loginForm" id="openidForm">
<input type="hidden" id="actionInput" name="action" value="steam_openid_login" />
<input type="hidden" name="openid.mode" value="checkid_setup" />
<input type="hidden" name="openidparams" value="eyJvcGVuaWQubnMiOiJodHRwOlwvXC9zcGVjcy5vcGVuaWQubmV0XC9hdXRoXC8yLjAiLCJvcGVuaWQubW9kZSI6ImNoZWNraWRfc2V0dXAiLCJvcGVuaWQucmVhbG0iOiJodHRwczpcL1wvdmFwb3JsZW5zLmFwcCIsIm9wZW5pZC5yZXR1cm5fdG8iOiJodHRwczpcL1wvdmFwb3JsZW5zLmFwcFwvYXBpXC9hdXRoXC9hcHBcL2NhbGxiYWNrIiwib3BlbmlkLmlkZW50aXR5IjoiaHR0cDpcL1wvc3BlY3Mub3BlbmlkLm5ldFwvYXV0aFwvMi4wXC9pZGVudGlmaWVyX3NlbGVjdCIsIm9wZW5pZC5jbGFpbWVkX2lkIjoiaHR0cDpcL1wvc3BlY3Mub3BlbmlkLm5ldFwvYXV0aFwvMi4wXC9pZGVudGlmaWVyX3NlbGVjdCJ9" />
<input type="hidden" name="nonce" value="0123456789abcdef01234567" />
<div class="OpenID_loggedInText">
<div class="OpenID_UserContainer">
<div class="playerAvatar online"><img src="https://avatars.fastly.steamstatic.com/avatar.jpg"></div>
<div class="OpenID_UserName">
<div class="OpenID_loggedInName">Player</div>
<div class="OpenID_loggedInAccount">player</div>
</div>
<div class="OpenID_Logout"><a href="javascript:OpenIdLogout()">Not You?</a></div>
<div style="clear: both"></div>
</div>
<div style="clear: both"></div>
<h2>
</div>
<input class="btn_green_white_innerfade" type="submit" id="imageLogin" style="max-width:250px; height:34px; border:none; padding-left: 20px; padding-right: 20px; margin-top: 10px; margin-left: 2px; font-size: 15px;" value="Sign In" />
</form>`;
const SESSION: WebSession = {
  sessionid: 'abc',
  cookie: 'steamLoginSecure=1%7C%7Ctoken; sessionid=abc',
  accessToken: 'token',
};
const REALM = 'https://site.example';
const RETURN_TO = `${REALM}/callback`;
const SIGNED = `${RETURN_TO}?openid.mode=id_res&openid.sig=sig`;
const NONCE_COOKIE =
  'steamCountry=DE%7C1; path=/; secure, sessionidSecureOpenIDNonce=n0nce; expires=Fri, 23 Oct 2026 08:16:12 GMT; Max-Age=300; path=/; secure; HttpOnly';

function steam(page: string, location: string | null) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(page, { headers: { 'set-cookie': NONCE_COOKIE } }),
    )
    .mockResolvedValueOnce(
      new Response(null, {
        status: location ? 302 : 200,
        headers: location ? { location } : {},
      }),
    );
}

describe('openIdSignIn', () => {
  it("posts the form back with Steam's nonce cookie and returns the signed redirect", async () => {
    const fetchImpl = steam(FORM, SIGNED);
    expect(await openIdSignIn(SESSION, REALM, RETURN_TO, fetchImpl)).toBe(
      SIGNED,
    );

    const [pageUrl, pageInit] = fetchImpl.mock.calls[0];
    const query = new URL(String(pageUrl)).searchParams;
    expect(query.get('openid.realm')).toBe(REALM);
    expect(query.get('openid.return_to')).toBe(RETURN_TO);
    expect(pageInit).toMatchObject({
      headers: { cookie: SESSION.cookie },
      credentials: 'omit',
      redirect: 'manual',
    });

    const [postUrl, postInit] = fetchImpl.mock.calls[1];
    expect(postUrl).toBe('https://steamcommunity.com/openid/login');
    expect(postInit).toMatchObject({
      method: 'POST',
      headers: {
        cookie: `${SESSION.cookie}; sessionidSecureOpenIDNonce=n0nce`,
      },
      credentials: 'omit',
      redirect: 'manual',
    });
    const body = postInit?.body as FormData;
    expect(body.get('action')).toBe('steam_openid_login');
    expect(body.get('openid.mode')).toBe('checkid_setup');
    expect(body.get('nonce')).toBe('0123456789abcdef01234567');
    expect(body.get('openidparams')).toMatch(/^eyJ/);
  });

  it('throws when Steam shows no sign-in form', async () => {
    await expect(
      openIdSignIn(SESSION, REALM, RETURN_TO, steam('<html></html>', SIGNED)),
    ).rejects.toThrow('Steam showed no sign-in form');
  });

  it('throws when Steam sends anywhere but the return URL', async () => {
    await expect(
      openIdSignIn(
        SESSION,
        REALM,
        RETURN_TO,
        steam(FORM, `${REALM}/callback-elsewhere?openid.sig=sig`),
      ),
    ).rejects.toThrow("Steam didn't sign in");
    await expect(
      openIdSignIn(SESSION, REALM, RETURN_TO, steam(FORM, null)),
    ).rejects.toThrow("Steam didn't sign in");
  });
});
