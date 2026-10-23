import { VoiceConnection } from 'vaporchat/client/connection';
import type { TokenStore } from 'vaporchat/steam/logOn';

// Signs the test account in to vaporlens with Steam OpenID, the way the mobile app does, and prints the result.
//   bun packages/web/scripts/liveOpenId.ts
// VAPORLENS_URL is the site to sign in to (default http://localhost:3000, a local vaporlens).
// Uses the refresh token in DATA_DIR (default data/) for STEAM_USER, getting one with STEAM_PASS
// first when there is none.
const site = process.env.VAPORLENS_URL ?? 'http://localhost:3000';
const accountName = process.env.STEAM_USER;
const password = process.env.STEAM_PASS;
if (!accountName || !password)
  throw new Error('STEAM_USER and STEAM_PASS must be set');
const tokenFile = Bun.file(
  `${process.env.DATA_DIR ?? 'data'}/steam-refresh-token-${accountName.toLowerCase()}`,
);
const store: TokenStore = {
  load: async () =>
    (await tokenFile.exists()) ? (await tokenFile.text()).trim() : null,
  save: async (refreshToken) => {
    await Bun.write(tokenFile, refreshToken);
  },
  clear: () => tokenFile.delete(),
};

const voice = await VoiceConnection.logOn(store, {
  credentials: { accountName, password },
  status: 'invisible',
});
try {
  const signed = await voice.openIdSignIn(
    site,
    `${site}/api/auth/app/callback`,
    fetch,
  );
  console.log(
    'Steam signed:',
    new URL(signed).searchParams.get('openid.claimed_id'),
  );
  // the assertion goes to the site without Steam's cookie
  const callback = await fetch(signed);
  const session = (await callback.json()) as {
    token?: string;
    expiresAt?: number;
    error?: string;
  };
  // the token is printed for curl checks against the site's /api/mobile/* routes
  console.log('callback:', callback.status, session);
  if (session.token) {
    const me = await fetch(`${site}/api/me`, {
      headers: { authorization: `Bearer ${session.token}` },
    });
    console.log('/api/me:', me.status, await me.json());
  }
} finally {
  voice.close();
}
