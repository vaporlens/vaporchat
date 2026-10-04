import index from './src/index.html';

// Steam only allows CORS on its server list from steamcommunity.com, everything else
// (login, voice) the page does over a WebSocket straight to Steam
const CM_LIST_URL =
  'https://api.steampowered.com/ISteamDirectory/GetCMListForConnect/v1/?cellid=0';

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  routes: {
    '/': index,
    '/cm-list': async () => {
      const response = await fetch(CM_LIST_URL);
      return new Response(response.body, {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      });
    },
  },
});

console.log(`vaporchat debug harness at ${server.url}`);
