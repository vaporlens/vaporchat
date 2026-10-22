import type { NewsSource } from '../protocol.ts';
import type { WebSession } from './logOn.ts';
import { fetchWithCookie, STORE_URL } from './web.ts';

// the News Hub's "Manage muted sources", its email opt-outs are the same list
const MUTED_URL = `${STORE_URL}account/emailoptout/app`;
// what the News Hub's Mute and Unmute post
const MUTE_URL = `${STORE_URL}account/optoutappcommunication/`;

/** A name map the page sets in its script, `[]` when empty, else `{"id":"name"}`. */
function sourcesIn(html: string, kind: NewsSource['kind']) {
  const variable = kind === 'app' ? 'g_appidToName' : 'g_clanidToName';
  const json = html.match(new RegExp(`${variable} = (.*);`))?.[1];
  if (json === undefined) throw new Error('Steam gave no muted news list');
  return Object.entries(
    JSON.parse(json) as Record<string, string> | string[],
  ).map(([id, name]) => ({ kind, id: Number(id), name }));
}

/** The games and groups whose news the user muted. */
export async function getMutedSources({
  cookie,
}: WebSession): Promise<NewsSource[]> {
  const response = await fetchWithCookie(MUTED_URL, cookie);
  if (!response.ok) {
    throw new Error(`Steam answered HTTP ${response.status} for muted news`);
  }
  const html = await response.text();
  return [...sourcesIn(html, 'app'), ...sourcesIn(html, 'group')];
}

/** Mutes a game's or group's news, or unmutes it, like the News Hub's menu on a post. */
export async function setSourceMuted(
  { sessionid, cookie }: WebSession,
  { kind, id }: Pick<NewsSource, 'kind' | 'id'>,
  muted: boolean,
) {
  const form = new FormData();
  form.append('sessionid', sessionid);
  form.append('allowCommunication', muted ? '0' : '1');
  form.append(kind === 'app' ? 'appId' : 'clanId', String(id));
  const response = await fetchWithCookie(MUTE_URL, cookie, {
    method: 'POST',
    body: form,
  });
  const saved =
    response.ok &&
    ((await response.json()) as { success?: number } | null)?.success === 1;
  if (!saved) throw new Error('Steam did not save that, try again later');
}
