import type { ChatTarget } from '../protocol.ts';
import { EResult, SteamError } from './eresult.ts';
import { hex } from './friends.ts';
import type { WebSession } from './logOn.ts';

// Steam's chat uploads files through its community site, not the CM. The commit posts the
// image into the chat; image BBCode sent as a message would be dropped.
const CHAT_URL = 'https://steamcommunity.com/chat/';

export interface ChatImage {
  bytes: Uint8Array<ArrayBuffer>;
  /** MIME type, `image/jpeg` say */
  type: string;
  width: number;
  height: number;
}

interface BeginUpload {
  hmac: string;
  timestamp: number;
  result: {
    ugcid: string;
    url_host: string;
    url_path: string;
    use_https?: boolean;
    request_headers: { name: string; value: string }[];
  };
}

async function post<T>(path: string, cookie: string, fields: object) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    form.append(name, String(value));
  }
  const response = await fetch(CHAT_URL + path, {
    method: 'POST',
    headers: { cookie, referer: CHAT_URL },
    body: form,
    // with credentials, React Native on iOS sends the cookies it stored instead of this header
    credentials: 'omit',
  });
  const body = (await response.json()) as T & {
    success: number;
    message?: string;
  };
  if (body.success !== EResult.OK) {
    const step = path.split('/')[0];
    throw new SteamError(
      `${step}: ${body.message ?? 'Steam refused the upload'}`,
      body.success,
    );
  }
  return body;
}

/** Uploads an image and posts it into the chat, like Steam's own clients. It arrives as a `message`. */
export async function sendImage(
  { sessionid, cookie }: WebSession,
  chat: ChatTarget,
  image: ChatImage,
) {
  const file = {
    sessionid,
    l: 'english',
    file_name: `${Date.now()}_image.${image.type.split('/')[1] ?? 'jpg'}`,
    // steam's own client sends random hex here, not the file's hash
    file_sha: hex(crypto.getRandomValues(new Uint8Array(20))),
    file_type: image.type,
    file_image_width: image.width,
    file_image_height: image.height,
  };
  const begin = await post<BeginUpload>('beginfileupload/?l=english', cookie, {
    ...file,
    file_size: image.bytes.length,
  });
  const { result } = begin;
  // the platform sets these itself, like Steam's client leaves them out
  const headers = Object.fromEntries(
    result.request_headers
      .filter(({ name }) => name !== 'Content-Length' && name !== 'Host')
      .map(({ name, value }) => [name, value]),
  );
  const upload = await fetch(
    `${result.use_https ? 'https' : 'http'}://${result.url_host}${result.url_path}`,
    { method: 'PUT', headers, body: image.bytes },
  );
  const commit = (success: boolean) =>
    post('commitfileupload/', cookie, {
      ...file,
      success: success ? 1 : 0,
      ugcid: result.ugcid,
      timestamp: begin.timestamp,
      hmac: begin.hmac,
      spoiler: 0,
      ...(chat.kind === 'friend'
        ? { friend_steamid: chat.steamid }
        : { chat_group_id: chat.groupId, chat_id: chat.chatId }),
    });
  if (!upload.ok) {
    const answer = (await upload.text()).slice(0, 200);
    // committed as failed so Steam lets go of it, its answer to that doesn't matter
    await commit(false).catch(() => {});
    throw new Error(
      `Uploading to ${result.url_host} failed: HTTP ${upload.status} ${answer}`,
    );
  }
  await commit(true);
}
