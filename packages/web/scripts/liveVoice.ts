import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { getRefreshTokenWithCredentials } from 'vaporchat/steam/credentialLogin';

// Drives the real app in headless chromium (phone sized) for a live voice test with a human on the other side.
//   bun packages/web/scripts/liveVoice.ts call <friend name>
//   bun packages/web/scripts/liveVoice.ts group <room name>
//   bun packages/web/scripts/liveVoice.ts answer    # accept the next incoming call
//   bun packages/web/scripts/liveVoice.ts decline   # decline the next incoming call
//   bun packages/web/scripts/liveVoice.ts observe   # only report incoming calls
//   bun packages/web/scripts/liveVoice.ts callback  # on an incoming call, press Call on the caller instead of Accept
// NO_MIC=1 denies microphone access so the app joins listen-only.
// ACTIONS="15:Mute,25:Unmute,40:Leave" clicks session buttons N seconds after connecting.
// SCREENSHOT_DIR saves a screenshot of the page after every action.
// The fake microphone sends a beep tone. Prints media stats until DURATION_S runs out, then leaves.
// Signs the page in with the refresh token in DATA_DIR (default data/), getting one with
// STEAM_USER/STEAM_PASS first when there is none, and saves it back in case Steam renewed it.
const [mode, ...rest] = process.argv.slice(2);
const target = rest.join(' ');
const base = process.env.VAPORCHAT_URL ?? 'http://localhost:3000';
const durationMs = Number(process.env.DURATION_S ?? 120) * 1000;
const screenshotDir = process.env.SCREENSHOT_DIR;
const actions = (process.env.ACTIONS ?? '')
  .split(',')
  .filter(Boolean)
  .map((action) => {
    const [at, button] = action.split(':');
    return { atMs: Number(at) * 1000, button, done: false };
  });
const MODES = ['call', 'group', 'answer', 'decline', 'observe', 'callback'];
if (!MODES.includes(mode) || (['call', 'group'].includes(mode) && !target)) {
  throw new Error(`usage: liveVoice.ts ${MODES.join('|')} [target]`);
}

// the page's localStorage key for the token, see src/app.ts
const TOKEN_STORAGE = 'vaporchat-refresh-token';
const accountName = process.env.STEAM_USER;
const password = process.env.STEAM_PASS;
if (!accountName || !password)
  throw new Error('STEAM_USER and STEAM_PASS must be set');
const tokenFile = Bun.file(
  `${process.env.DATA_DIR ?? 'data'}/steam-refresh-token-${accountName.toLowerCase()}`,
);
let refreshToken = (await tokenFile.exists())
  ? (await tokenFile.text()).trim()
  : null;
if (!refreshToken) {
  refreshToken = await getRefreshTokenWithCredentials(accountName, password);
  await Bun.write(tokenFile, refreshToken);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: [
    '--use-fake-device-for-media-stream',
    // without auto-accepting the permission prompt headless chromium denies the microphone
    ...(process.env.NO_MIC ? [] : ['--use-fake-ui-for-media-stream']),
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
// keep every peer connection reachable for stats without adding hooks to the app
await page.addInitScript(() => {
  const Original = window.RTCPeerConnection;
  const connections: RTCPeerConnection[] = [];
  Object.assign(window, { __peerConnections: connections });
  window.RTCPeerConnection = class extends Original {
    constructor(config?: RTCConfiguration) {
      super(config);
      connections.push(this);
    }
  };
});
await page.addInitScript(
  ([key, token]) => {
    // only seed it, a token the page renewed since must not be overwritten on reload
    if (!localStorage.getItem(key)) localStorage.setItem(key, token);
  },
  [TOKEN_STORAGE, refreshToken],
);
page.on('pageerror', (err) => console.error('page error:', err.message));
await page.goto(base);
await page.waitForSelector('#friends .row');

let shots = 0;
async function screenshot(name: string) {
  if (!screenshotDir) return;
  await mkdir(screenshotDir, { recursive: true });
  const path = `${screenshotDir}/${String(++shots).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path });
  console.log(`[shot] ${path}`);
}

async function waitForIncomingCall(page: Page) {
  console.log('waiting for an incoming call...');
  await page.waitForSelector('#incoming .row', { timeout: durationMs });
  console.log(`[incoming] ${await page.locator('#incoming').innerText()}`);
  await screenshot('incoming');
}

if (mode === 'call') {
  await page
    .locator('#friends .row', {
      has: page.locator('.name', { hasText: target }),
    })
    .first()
    .getByRole('button', { name: 'Call' })
    .click();
} else if (mode === 'group') {
  await page
    .locator('#groups .row', { hasText: target })
    .first()
    .getByRole('button', { name: 'Join' })
    .click();
} else if (mode === 'answer') {
  await waitForIncomingCall(page);
  await page.getByRole('button', { name: 'Accept' }).click();
} else if (mode === 'callback') {
  await waitForIncomingCall(page);
  const caller = await page.locator('#incoming .row .name').first().innerText();
  await page
    .locator('#friends .row', {
      has: page.locator('.name', { hasText: caller }),
    })
    .first()
    .getByRole('button', { name: 'Call' })
    .click();
  console.log(`[action] Call ${caller} while they are calling`);
} else if (mode === 'decline') {
  await waitForIncomingCall(page);
  await page.getByRole('button', { name: 'Decline' }).click();
  console.log('[action] Decline');
} else {
  await waitForIncomingCall(page);
}

const startedAt = Date.now();
let connectedAt: number | null = null;
let lastLogLine = '';
let lastIncoming = '';
while (Date.now() - startedAt < durationMs) {
  await page.waitForTimeout(3000);
  const snapshot = await page.evaluate(async () => {
    const connections = (
      window as unknown as { __peerConnections: RTCPeerConnection[] }
    ).__peerConnections;
    const pc = connections.at(-1);
    const media: string[] = [];
    if (pc && pc.connectionState !== 'closed') {
      const stats = await pc.getStats();
      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.kind === 'audio') {
          media.push(
            `in  ssrc=${report.ssrc} packets=${report.packetsReceived} energy=${(report.totalAudioEnergy ?? 0).toFixed(3)} level=${(report.audioLevel ?? 0).toFixed(3)}`,
          );
        } else if (report.type === 'outbound-rtp' && report.kind === 'audio') {
          media.push(
            `out ssrc=${report.ssrc} packets=${report.packetsSent} bytes=${report.bytesSent}`,
          );
        }
      });
    }
    const speaking = [
      ...document.querySelectorAll('#session .row:has(.avatar.speaking) .name'),
    ].map((name) => name.textContent);
    return {
      session:
        document.getElementById('session')?.innerText.replace(/\n+/g, ' | ') ??
        '',
      incoming:
        document.getElementById('incoming')?.innerText.replace(/\n+/g, ' | ') ??
        '',
      speaking,
      media,
      log: document.getElementById('log')?.textContent?.split('\n') ?? [],
    };
  });
  // the page trims its log, so continue after the last line already printed
  const lastIndex = snapshot.log.lastIndexOf(lastLogLine);
  for (const line of snapshot.log.slice(lastIndex + 1)) {
    // skip the multi-line SDP dumps, keep timestamped entries
    if (!/^\d{1,2}:\d{2}:\d{2}/.test(line) || line.includes(' SDP:')) continue;
    console.log(`[log] ${line}`);
  }
  lastLogLine = snapshot.log.at(-1) ?? lastLogLine;
  if (snapshot.incoming !== lastIncoming) {
    console.log(`[incoming] ${snapshot.incoming || '(none)'}`);
    lastIncoming = snapshot.incoming;
  }
  console.log(`[session] ${snapshot.session || '(none)'}`);
  if (snapshot.speaking.length > 0) {
    console.log(`[speaking] ${snapshot.speaking.join(', ')}`);
  }
  for (const line of snapshot.media) console.log(`[media] ${line}`);

  if (connectedAt === null && snapshot.session.includes('CONNECTED')) {
    connectedAt = Date.now();
    await screenshot('connected');
  }
  for (const action of actions) {
    if (action.done || connectedAt === null) continue;
    if (Date.now() - connectedAt < action.atMs) continue;
    action.done = true;
    const button = page.getByRole('button', {
      name: action.button,
      exact: true,
    });
    if (await button.isVisible()) {
      await button.click();
      console.log(`[action] ${action.button}`);
      await page.waitForTimeout(500);
      await screenshot(action.button.toLowerCase());
    } else {
      console.log(`[action] ${action.button} not available`);
    }
  }
  if (actions.length > 0 && actions.every((a) => a.done) && !snapshot.session) {
    break;
  }
}

const leave = page.getByRole('button', { name: 'Leave' });
if (await leave.isVisible()) {
  await leave.click();
  console.log('[action] Leave (end of test)');
}
await page.waitForTimeout(2000);
await screenshot('end');
const latestToken = await page.evaluate(
  (key) => localStorage.getItem(key),
  TOKEN_STORAGE,
);
if (latestToken) await Bun.write(tokenFile, latestToken);
await browser.close();
