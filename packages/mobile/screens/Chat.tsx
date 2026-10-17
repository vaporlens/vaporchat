import Ionicons from '@expo/vector-icons/Ionicons';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type {
  ChatMessage,
  ChatTarget,
  ReactionKey,
  StickerPart,
} from 'vaporchat/protocol';
import {
  applyReaction,
  chatKey,
  mergeMessages,
} from 'vaporchat/steam/messages';
import { readCache, writeCache } from '../cache';
import { pickImage } from '../chats';
import { Avatar } from '../components/Avatar';
import { DetailHeader } from '../components/DetailHeader';
import { EmoticonPicker } from '../components/EmoticonPicker';
import { ImageViewer } from '../components/ImageViewer';
import { useBackHandler } from '../components/useBackHandler';
import { colors } from '../theme';
import { MessageBubble } from './MessageBubble';

// as many as steam's recent history has
const CACHED_MESSAGES = 50;
// steam's clients tell they're typing every few seconds while they do
const TYPING_SEND_MS = 5000;
// how long one notice shows, unless their message comes first
const TYPING_SHOWN_MS = 8000;

/**
 * A friend's or a room's text chat: recent history, older as it scrolls up, new messages as they
 * come, and sending.
 */
export function Chat({
  voice,
  chat,
  title,
  subtitle,
  avatarUrl,
  headerAction,
  top,
  bottomInset,
  onBack,
  onError,
}: {
  voice: SteamVoice;
  chat: ChatTarget;
  title: string;
  subtitle: string;
  avatarUrl: string | null;
  /** a button at the end of the header */
  headerAction?: ReactNode;
  /** above the messages, under the header */
  top?: ReactNode;
  /** room for the home indicator, unless something below the chat takes care of it */
  bottomInset: number;
  onBack: () => void;
  onError: (err: Error) => void;
}) {
  const cacheKey = `messages-${chatKey(chat)}`;
  // last time's until the history loads
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    // cached before reactions were kept, the history brings them
    (readCache<ChatMessage[]>(cacheKey) ?? []).map((m) => ({
      ...m,
      reactions: m.reactions ?? [],
    })),
  );
  const [loading, setLoading] = useState(true);
  // where older history starts, null when there's none
  const [older, setOlder] = useState<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);
  // the emoticon and sticker picker, in place of the keyboard
  const [picking, setPicking] = useState(false);
  // the message the picker puts a reaction on, instead of into the draft
  const [reactingTo, setReactingTo] = useState<ChatMessage | null>(null);
  const [uploading, setUploading] = useState(false);
  // the friend is typing to us
  const [typing, setTyping] = useState(false);
  const typingSent = useRef(0);
  const me = voice.me.steamid;

  useEffect(() => {
    let current = true;
    const key = chatKey(chat);
    // listening first, so nothing sent while the history loads goes missing
    const off = voice.connection.on('message', (incoming) => {
      if (chatKey(incoming.chat) !== key) return;
      setMessages((list) => mergeMessages(list, [incoming.message]));
    });
    const offReactions = voice.connection.on('reaction', (change) => {
      if (chatKey(change.chat) !== key) return;
      setMessages((list) =>
        list.map((m) =>
          m.id === change.messageId ? applyReaction(m, change, me) : m,
        ),
      );
    });
    voice.connection
      .getRecentMessages(chat)
      .then(
        (history) => {
          if (!current) return;
          setMessages((list) => mergeMessages(list, history.items));
          setOlder(history.next);
        },
        (err: Error) =>
          current &&
          onError(new Error(`Could not load messages: ${err.message}`)),
      )
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
      off();
      offReactions();
    };
  }, [voice, chat, me, onError]);

  useEffect(() => {
    if (!loading) writeCache(cacheKey, messages.slice(-CACHED_MESSAGES));
  }, [cacheKey, messages, loading]);

  useEffect(() => {
    if (chat.kind !== 'friend') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      clearTimeout(timer);
      setTyping(false);
    };
    const offTyping = voice.connection.on('typing', ({ steamid }) => {
      if (steamid !== chat.steamid) return;
      clearTimeout(timer);
      setTyping(true);
      timer = setTimeout(stop, TYPING_SHOWN_MS);
    });
    const offMessage = voice.connection.on('message', ({ message }) => {
      if (message.sender === chat.steamid) stop();
    });
    return () => {
      clearTimeout(timer);
      offTyping();
      offMessage();
    };
  }, [voice, chat]);

  // what is on screen is read, on the account's other devices too. Not while the app is away
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  const newest = messages.at(-1)?.time;
  useEffect(() => {
    if (active && newest !== undefined)
      voice.connection.unread.markRead(chat, newest);
  }, [voice, chat, newest, active]);

  async function loadOlder() {
    if (older === null || loading || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const history = await voice.connection.getRecentMessages(chat, older);
      setMessages((list) => mergeMessages(list, history.items));
      setOlder(history.next);
    } catch (err) {
      onError(new Error(`Could not load messages: ${(err as Error).message}`));
    } finally {
      setLoadingOlder(false);
    }
  }

  function deliver(content: string | StickerPart, onFailed?: () => void) {
    voice.connection.sendMessage(chat, content).then(
      (sent) => setMessages((list) => mergeMessages(list, [sent])),
      (err: Error) => {
        onFailed?.();
        onError(new Error(`Could not send: ${err.message}`));
      },
    );
  }

  function type(text: string) {
    setDraft(text);
    if (
      chat.kind !== 'friend' ||
      text.trim() === '' ||
      Date.now() - typingSent.current < TYPING_SEND_MS
    )
      return;
    typingSent.current = Date.now();
    // only a nicety, a lost one doesn't matter
    voice.connection.sendTyping(chat.steamid).catch(() => {});
  }

  function send() {
    const text = draft.trim();
    if (text === '') return;
    setDraft('');
    // hand the text back to retry, unless something new was typed meanwhile
    deliver(text, () => setDraft((typed) => (typed === '' ? text : typed)));
  }

  async function sendPhoto() {
    try {
      const image = await pickImage();
      if (!image) return;
      setUploading(true);
      // steam posts it into the chat, it arrives like any other message
      await voice.connection.sendImage(chat, image);
    } catch (err) {
      onError(new Error(`Could not send the image: ${(err as Error).message}`));
    } finally {
      setUploading(false);
    }
  }

  function togglePicker() {
    if (!picking) Keyboard.dismiss();
    setPicking(!picking);
  }

  // stable, the bubbles are memoized
  const changeReaction = useCallback(
    (message: ChatMessage, reaction: ReactionKey, added: boolean) => {
      voice.connection.react(chat, message, reaction, added).then(
        () =>
          setMessages((list) =>
            list.map((m) =>
              m.id === message.id
                ? applyReaction(m, { reaction, reactor: me, added }, me)
                : m,
            ),
          ),
        (err: Error) => onError(new Error(`Could not react: ${err.message}`)),
      );
    },
    [voice, chat, me, onError],
  );

  const pickReaction = useCallback((message: ChatMessage) => {
    Keyboard.dismiss();
    setPicking(false);
    setReactingTo(message);
  }, []);

  function reactWith(reaction: ReactionKey) {
    if (reactingTo) changeReaction(reactingTo, reaction, true);
    setReactingTo(null);
  }

  useBackHandler(() => {
    if (reactingTo) {
      setReactingTo(null);
      return true;
    }
    if (!picking) return false;
    setPicking(false);
    return true;
  });

  // the list is inverted so it starts at the newest message
  const newestFirst = useMemo(() => [...messages].reverse(), [messages]);
  const nothingToSend = draft.trim() === '';

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <DetailHeader
        title={title}
        subtitle={typing ? 'typing…' : subtitle}
        avatar={<Avatar url={avatarUrl} name={title} size={36} />}
        action={headerAction}
        onBack={onBack}
      />
      {top}
      <FlatList
        inverted
        data={newestFirst}
        keyExtractor={(message) => message.id}
        keyboardShouldPersistTaps="handled"
        // Android can't drag the keyboard down, it closes as the list is dragged instead
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        contentContainerStyle={styles.messages}
        // inverted, its end is the oldest message
        onEndReached={() => void loadOlder()}
        onEndReachedThreshold={1}
        ListFooterComponent={
          loadingOlder ? (
            <ActivityIndicator color={colors.muted} style={styles.older} />
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.muted} style={styles.empty} />
          ) : (
            <Text style={[styles.empty, styles.emptyText]}>
              No messages yet. Say hi!
            </Text>
          )
        }
        renderItem={({ item, index }) => {
          const mine = item.sender === me;
          // a run of someone's messages in a row reads as one
          const runStart = newestFirst[index + 1]?.sender !== item.sender;
          const runEnd = newestFirst[index - 1]?.sender !== item.sender;
          // in rooms, name the sender where their messages start
          const sender =
            chat.kind === 'room' && !mine && runStart
              ? voice.connection.user(item.sender)
              : null;
          return (
            <MessageBubble
              message={item}
              mine={mine}
              runStart={runStart}
              runEnd={runEnd}
              senderName={sender?.name ?? null}
              senderAvatarUrl={sender?.avatarUrl ?? null}
              onOpenImage={setViewing}
              onPickReaction={pickReaction}
              onChangeReaction={changeReaction}
            />
          );
        }}
      />
      {reactingTo ? (
        <View style={styles.reacting}>
          <Text style={styles.reactingText}>
            React with an emoticon or sticker
          </Text>
          <Pressable
            onPress={() => setReactingTo(null)}
            accessibilityLabel="Cancel reacting"
            hitSlop={8}
          >
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>
      ) : (
        <View
          style={[
            styles.composer,
            // the picker below takes care of the home indicator
            { paddingBottom: (picking ? 0 : bottomInset) + 8 },
          ]}
        >
          <Pressable
            onPress={togglePicker}
            accessibilityLabel={
              picking ? 'Hide emoticons' : 'Emoticons and stickers'
            }
            hitSlop={6}
            style={({ pressed }) => [styles.tool, pressed && styles.pressed]}
          >
            <Ionicons
              name="happy-outline"
              size={26}
              color={picking ? colors.accent : colors.muted}
            />
          </Pressable>
          <Pressable
            onPress={sendPhoto}
            disabled={uploading}
            accessibilityLabel="Send a photo"
            hitSlop={6}
            style={({ pressed }) => [styles.tool, pressed && styles.pressed]}
          >
            {uploading ? (
              <ActivityIndicator color={colors.muted} />
            ) : (
              <Ionicons name="image-outline" size={26} color={colors.muted} />
            )}
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={type}
            onFocus={() => setPicking(false)}
            placeholder={`Message ${title}`}
            placeholderTextColor={colors.muted}
            selectionColor={colors.accent}
            keyboardAppearance="dark"
            multiline
            style={styles.input}
          />
          <Pressable
            onPress={send}
            disabled={nothingToSend}
            accessibilityLabel="Send"
            style={({ pressed }) => [
              styles.send,
              nothingToSend && styles.sendDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="send" size={18} color={colors.bright} />
          </Pressable>
        </View>
      )}
      {reactingTo ? (
        <EmoticonPicker
          voice={voice}
          bottomInset={bottomInset}
          onEmoticon={({ name }) => reactWith({ kind: 'emoticon', name })}
          onSticker={({ name }) => reactWith({ kind: 'sticker', name })}
        />
      ) : (
        picking && (
          <EmoticonPicker
            voice={voice}
            bottomInset={bottomInset}
            // steam turns `:name:` into the emoticon when the message is sent
            onEmoticon={(emoticon) =>
              setDraft((typed) => `${typed}:${emoticon.name}:`)
            }
            onSticker={(sticker) => deliver(sticker)}
          />
        )
      )}
      <ImageViewer url={viewing} onClose={() => setViewing(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  pressed: { opacity: 0.6 },
  messages: { padding: 12, gap: 6, flexGrow: 1 },
  empty: { marginVertical: 24 },
  emptyText: { color: colors.muted, fontSize: 14, textAlign: 'center' },
  older: { padding: 12 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: colors.bar,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 20,
    backgroundColor: colors.field,
    color: colors.bright,
    fontSize: 16,
  },
  tool: { width: 26, height: 40, justifyContent: 'center' },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  sendDisabled: { opacity: 0.4 },
  reacting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.bar,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  reactingText: { flex: 1, color: colors.text, fontSize: 15 },
});
