import { EventEmitter } from 'node:events';
import type SteamUser from 'steam-user';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMessage, ServerMessage } from '../protocol.ts';
import {
  callService,
  onServiceNotification,
  SteamServiceError,
} from '../steam/serviceCalls.ts';
import { createVoiceProxy } from './voiceProxy.ts';

vi.mock('../steam/serviceCalls.ts', () => ({
  callService: vi.fn(),
  notifyService: vi.fn(),
  onServiceNotification: vi.fn(),
  SteamServiceError: class extends Error {
    eresult: number;
    constructor(method: string, eresult: number) {
      super(`${method} failed`);
      this.eresult = eresult;
    }
  },
}));
const STEAM_FAIL = 2;
const steamCall = vi.mocked(callService);
const subscribe = vi.mocked(onServiceNotification);

// what steam answers for the calls these tests make
const RESPONSES: Record<string, object> = {
  'ChatRoom.JoinVoiceChat#1': { voice_chatid: '900' },
  'VoiceChat.RequestOneOnOneChat#1': { voice_chatid: '901' },
};

function setup() {
  const listeners = new Map<string, (body: object) => void>();
  subscribe.mockImplementation((_client, name, _type, listener) => {
    listeners.set(name, listener);
    return () => listeners.delete(name);
  });
  const client = { chat: new EventEmitter() } as unknown as SteamUser;
  const sent: ServerMessage[] = [];
  const proxy = createVoiceProxy(client, (message) => sent.push(message));
  let id = 0;
  const call = (method: string, body: object) =>
    proxy.handle({ kind: 'call', id: ++id, method, body } as ClientMessage);
  const notify = (name: string, body: object) => listeners.get(name)?.(body);
  const leftOnClose = async () => {
    steamCall.mockClear();
    await proxy.close();
    return steamCall.mock.calls.map(([, method, , , body]) => [method, body]);
  };
  return { call, notify, leftOnClose, sent };
}

describe('createVoiceProxy cleanup', () => {
  beforeEach(() => {
    steamCall.mockReset();
    steamCall.mockImplementation(
      async (_client, method) => RESPONSES[method] ?? {},
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('leaves the group voice channel a disconnected client was in', async () => {
    const proxy = setup();
    const room = { chat_group_id: '1', chat_id: '2' };
    await proxy.call('ChatRoom.JoinVoiceChat#1', room);

    expect(await proxy.leftOnClose()).toEqual([
      ['ChatRoom.LeaveVoiceChat#1', room],
    ]);
  });

  it('does not leave again what the client already left', async () => {
    const proxy = setup();
    const room = { chat_group_id: '1', chat_id: '2' };
    await proxy.call('ChatRoom.JoinVoiceChat#1', room);
    await proxy.call('ChatRoom.LeaveVoiceChat#1', room);

    expect(await proxy.leftOnClose()).toEqual([]);
  });

  it('hangs up calls the client placed or accepted', async () => {
    const proxy = setup();
    await proxy.call('VoiceChat.RequestOneOnOneChat#1', {
      steamid_partner: 'A',
    });
    await proxy.call('VoiceChat.AnswerOneOnOneChat#1', {
      voice_chatid: '902',
      steamid_partner: 'B',
      accepted_request: true,
    });
    await proxy.call('VoiceChat.AnswerOneOnOneChat#1', {
      voice_chatid: '903',
      steamid_partner: 'C',
      accepted_request: false,
    });

    expect(await proxy.leftOnClose()).toEqual([
      ['VoiceChat.EndOneOnOneChat#1', { steamid_partner: 'A' }],
      ['VoiceChat.EndOneOnOneChat#1', { steamid_partner: 'B' }],
    ]);
  });

  it('forgets calls steam already ended', async () => {
    const proxy = setup();
    await proxy.call('VoiceChat.RequestOneOnOneChat#1', {
      steamid_partner: 'A',
    });
    proxy.notify('VoiceChatClient.NotifyVoiceChatEnded#1', {
      voice_chatid: '901',
    });

    expect(await proxy.leftOnClose()).toEqual([]);
  });
});

describe('createVoiceProxy steam results', () => {
  beforeEach(() => {
    steamCall.mockReset();
    steamCall.mockRejectedValue(new SteamServiceError('call', STEAM_FAIL));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('treats the Fail steam answers to acks and declines as success', async () => {
    const proxy = setup();
    await proxy.call('WebRTCClient.AcknowledgeUpdatedRemoteDescription#1', {});
    await proxy.call('VoiceChat.AnswerOneOnOneChat#1', {
      voice_chatid: '1',
      steamid_partner: 'A',
      accepted_request: false,
    });

    expect(proxy.sent.map((message) => message.kind)).toEqual([
      'result',
      'result',
    ]);
  });

  it('still reports Fail for calls where it means failure', async () => {
    const proxy = setup();
    await proxy.call('VoiceChat.AnswerOneOnOneChat#1', {
      voice_chatid: '1',
      steamid_partner: 'A',
      accepted_request: true,
    });

    expect(proxy.sent).toEqual([
      expect.objectContaining({ kind: 'error', eresult: STEAM_FAIL }),
    ]);
  });
});
