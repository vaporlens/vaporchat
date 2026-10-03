import { randomBytes, timingSafeEqual } from 'node:crypto';
import SteamUser from 'steam-user';
import type { ClientMessage } from 'vaporchat/protocol';
import { createVoiceProxy } from 'vaporchat/server/voiceProxy';
import { logOnSteam } from 'vaporchat/steam/logOn';
import index from './src/index.html';

const port = Number(process.env.PORT ?? 3000);
const dataDir = process.env.DATA_DIR ?? 'data';
const accountName = process.env.STEAM_USER;
const password = process.env.STEAM_PASS;
if (!accountName || !password) {
  throw new Error('STEAM_USER and STEAM_PASS must be set');
}
// whoever holds the key controls the steam account, so there's always one
const accessKey = process.env.VAPORCHAT_KEY ?? randomBytes(16).toString('hex');

function isAuthorized(key: string | null) {
  if (!key) return false;
  const given = Buffer.from(key);
  const expected = Buffer.from(accessKey);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const client = new SteamUser({ renewRefreshTokens: true, dataDirectory: null });
// fatal session errors (e.g. logged in elsewhere), steam-user stops relogging after these
client.on('error', (err) => {
  console.error('Steam session error:', err.message);
});
client.on('disconnected', (eresult, message) => {
  console.warn(
    `Disconnected from Steam (${message ?? eresult}), steam-user will relog`,
  );
});
if (process.env.VAPORCHAT_DEBUG) {
  // steam-user traces every sent/received message name, keep the voice related ones
  client.on('debug', (message) => {
    if (/VoiceChat|WebRTC|ChatRoom/.test(message))
      console.log(`[steam] ${message}`);
  });
}
await logOnSteam(client, { accountName, password }, dataDir);
client.setPersona(SteamUser.EPersonaState.Online);

type Proxy = ReturnType<typeof createVoiceProxy>;

const server = Bun.serve<{ proxy: Proxy | null }>({
  port,
  routes: {
    '/': index,
  },
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname !== '/ws') {
      return new Response('Not found', { status: 404 });
    }
    if (!isAuthorized(url.searchParams.get('key'))) {
      return new Response('Unauthorized', { status: 401 });
    }
    if (server.upgrade(req, { data: { proxy: null } })) return;
    return new Response('Expected a websocket', { status: 400 });
  },
  websocket: {
    open(ws) {
      ws.data.proxy = createVoiceProxy(client, (message) =>
        ws.send(JSON.stringify(message)),
      );
    },
    message(ws, raw) {
      void ws.data.proxy?.handle(JSON.parse(String(raw)) as ClientMessage);
    },
    close(ws) {
      void ws.data.proxy?.close();
    },
  },
});

console.log(`vaporchat running at ${server.url}#key=${accessKey}`);
