import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendImage } from './imageUpload.ts';

const SESSION = {
  sessionid: 'abc',
  cookie: 'steamLoginSecure=x; sessionid=abc',
  accessToken: 'x',
};
const IMAGE = {
  bytes: new Uint8Array([1, 2, 3]),
  type: 'image/jpeg',
  width: 4,
  height: 5,
};

/** Answers like Steam and its storage would, records the requests. */
function stubSteam(upload: Response, commit: object) {
  const requests: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    if (url.includes('beginfileupload')) {
      // hmac and timestamp sit next to the result, not in it
      return Response.json({
        success: 1,
        hmac: 'signed',
        timestamp: 123,
        result: {
          ugcid: '42',
          url_host: 'storage.example.com',
          url_path: '/file',
          use_https: true,
          request_headers: [
            { name: 'Content-Type', value: 'image/jpeg' },
            { name: 'Content-Length', value: '3' },
            { name: 'Host', value: 'storage.example.com' },
          ],
        },
      });
    }
    if (url.includes('commitfileupload')) return Response.json(commit);
    return upload;
  });
  return requests;
}

describe('sendImage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('commits the upload into the room with what beginning it returned', async () => {
    const requests = stubSteam(new Response(null), { success: 1 });
    await sendImage(
      SESSION,
      { kind: 'room', groupId: '7', chatId: '8' },
      IMAGE,
    );

    const [begin, put, commit] = requests;
    expect(begin.init.headers).toMatchObject({ cookie: SESSION.cookie });
    expect(put.url).toBe('https://storage.example.com/file');
    // the platform sets length and host itself
    expect(put.init.headers).toEqual({ 'Content-Type': 'image/jpeg' });
    const form = Object.fromEntries(commit.init.body as FormData);
    expect(form).toMatchObject({
      sessionid: SESSION.sessionid,
      success: '1',
      ugcid: '42',
      hmac: 'signed',
      timestamp: '123',
      chat_group_id: '7',
      chat_id: '8',
    });
    expect(form).not.toHaveProperty('friend_steamid');
  });

  it('reports a failed upload rather than the commit Steam refuses after it', async () => {
    stubSteam(new Response('SignatureDoesNotMatch', { status: 403 }), {
      success: 16,
      message: 'A server error occurred',
    });
    await expect(
      sendImage(SESSION, { kind: 'friend', steamid: '1' }, IMAGE),
    ).rejects.toThrow(
      'storage.example.com failed: HTTP 403 SignatureDoesNotMatch',
    );
  });
});
