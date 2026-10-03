import type { SteamMethods, VoiceChatEnded } from '../protocol.ts';

/** A successful steam call with its request and response. */
export type SteamCall = {
  [M in keyof SteamMethods]: {
    method: M;
    request: SteamMethods[M]['request'];
    response: SteamMethods[M]['response'];
  };
}[keyof SteamMethods];

type GroupVoice = SteamMethods['ChatRoom.LeaveVoiceChat#1']['request'];

function groupKey(groupId: string, chatId: string) {
  return `${groupId}:${chatId}`;
}

/**
 * Voice chats one browser connection is in, so the server can leave them for the browser
 * when it disappears (tab closed, app killed) instead of leaving the account stuck in voice.
 */
export class ActiveVoiceChats {
  #groups = new Map<string, GroupVoice>();
  /** 1:1 voice chat id → partner steamid */
  #calls = new Map<string, string>();

  record(call: SteamCall) {
    switch (call.method) {
      case 'ChatRoom.JoinVoiceChat#1':
        this.#groups.set(
          groupKey(call.request.chat_group_id, call.request.chat_id),
          call.request,
        );
        break;
      case 'ChatRoom.LeaveVoiceChat#1':
        this.#groups.delete(
          groupKey(call.request.chat_group_id, call.request.chat_id),
        );
        break;
      case 'VoiceChat.RequestOneOnOneChat#1':
        this.#calls.set(
          call.response.voice_chatid,
          call.request.steamid_partner,
        );
        break;
      case 'VoiceChat.AnswerOneOnOneChat#1':
        if (call.request.accepted_request) {
          this.#calls.set(
            call.request.voice_chatid,
            call.request.steamid_partner,
          );
        }
        break;
      case 'VoiceChat.EndOneOnOneChat#1':
        for (const [voiceChatId, partner] of this.#calls) {
          if (partner === call.request.steamid_partner) {
            this.#calls.delete(voiceChatId);
          }
        }
        break;
    }
  }

  ended(notification: VoiceChatEnded) {
    this.#calls.delete(notification.voice_chatid);
    if (notification.chat_group_id && notification.chatid) {
      this.#groups.delete(
        groupKey(notification.chat_group_id, notification.chatid),
      );
    }
  }

  groups() {
    return [...this.#groups.values()];
  }

  callPartners() {
    return [...new Set(this.#calls.values())];
  }
}
