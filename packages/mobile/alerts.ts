import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type {
  ChatGroup,
  ChatTarget,
  IncomingChatMessage,
} from 'vaporchat/protocol';
import { chatKey } from 'vaporchat/steam/messages';
import { messageText } from './chats';
import { findRoom } from './screens/ChatRoute';

const MESSAGES = 'messages';
const CALLS = 'calls';
const CALL_ID = 'call';

function alertsFor(
  { chat, mentioned }: IncomingChatMessage,
  groups: ChatGroup[],
  mutedFriends: ReadonlySet<string>,
) {
  if (chat.kind === 'friend') return !mutedFriends.has(chat.steamid);
  const alerts =
    findRoom(groups, chat.groupId, chat.chatId).group?.alerts ?? 'mentions';
  return alerts === 'all' || (alerts === 'mentions' && mentioned);
}

function title(voice: SteamVoice, chat: ChatTarget, groups: ChatGroup[]) {
  if (chat.kind === 'friend') return voice.connection.user(chat.steamid).name;
  const { group, room } = findRoom(groups, chat.groupId, chat.chatId);
  if (!group) return 'Group chat';
  return group.rooms.length > 1 && room
    ? `${group.name} › ${room.name}`
    : group.name;
}

function setUpChannels() {
  return Promise.all([
    Notifications.setNotificationChannelAsync(MESSAGES, {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
    }),
    // the app rings and vibrates itself while a call comes in
    Notifications.setNotificationChannelAsync(CALLS, {
      name: 'Incoming calls',
      importance: Notifications.AndroidImportance.MAX,
      sound: null,
      enableVibrate: false,
    }),
  ]);
}

/**
 * Alerts for messages and calls while the app is in the background: friends unless muted,
 * groups by their alert setting. One per chat with its latest message, gone once the chat is
 * read here or elsewhere. Tapping one opens its chat.
 */
export function useAlerts(
  voice: SteamVoice,
  groups: ChatGroup[],
  mutedFriends: ReadonlySet<string>,
  openChat: (chat: ChatTarget) => void,
) {
  // the listeners stay, they read the latest of these
  const latest = useRef({ groups, mutedFriends });
  latest.current = { groups, mutedFriends };

  useEffect(() => {
    void setUpChannels().then(() => Notifications.requestPermissionsAsync());
    const { connection } = voice;
    const inBackground = () => AppState.currentState === 'background';

    const offMessage = connection.on('message', (incoming) => {
      const { chat, message } = incoming;
      const { groups, mutedFriends } = latest.current;
      if (
        !inBackground() ||
        message.sender === voice.me.steamid ||
        !alertsFor(incoming, groups, mutedFriends)
      )
        return;
      const text = messageText(message.parts);
      void Notifications.scheduleNotificationAsync({
        identifier: chatKey(chat),
        content: {
          title: title(voice, chat, groups),
          body:
            chat.kind === 'friend'
              ? text
              : `${connection.user(message.sender).name}: ${text}`,
          data: { chat },
        },
        trigger: { channelId: MESSAGES },
      });
    });

    const offCalls = voice.on('incomingCalls', (calls) => {
      const [call] = calls;
      if (!call) {
        void Notifications.dismissNotificationAsync(CALL_ID);
        return;
      }
      if (!inBackground()) return;
      void Notifications.scheduleNotificationAsync({
        identifier: CALL_ID,
        content: {
          title: `${connection.user(call.steamid).name} is calling`,
          body: 'Open Vaporlens to answer',
        },
        trigger: { channelId: CALLS },
      });
    });

    // read here or on another device
    const offUnread = connection.unread.on('changed', ({ friends, rooms }) => {
      void Notifications.getPresentedNotificationsAsync().then((shown) => {
        for (const { request } of shown) {
          const chat = request.content.data?.chat as ChatTarget | undefined;
          if (!chat) continue;
          const unread =
            chat.kind === 'friend'
              ? friends.has(chat.steamid)
              : rooms.has(chatKey(chat));
          if (!unread)
            void Notifications.dismissNotificationAsync(request.identifier);
        }
      });
    });

    const open = (response: Notifications.NotificationResponse | null) => {
      const chat = response?.notification.request.content.data?.chat as
        | ChatTarget
        | undefined;
      if (!chat) return;
      openChat(chat);
      // it stays the last one, a reconnect would open it again
      void Notifications.clearLastNotificationResponseAsync();
    };
    // tapped while the app wasn't running
    void Notifications.getLastNotificationResponseAsync().then(open);
    const tapped = Notifications.addNotificationResponseReceivedListener(open);

    return () => {
      offMessage();
      offCalls();
      offUnread();
      tapped.remove();
    };
  }, [voice, openChat]);
}
