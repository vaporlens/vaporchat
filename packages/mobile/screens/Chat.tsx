import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { ChatMessage, ChatTarget, StickerPart } from 'vaporchat/protocol';
import { chatKey, mergeMessages } from 'vaporchat/steam/messages';
import { pickImage } from '../chats';
import { Avatar } from '../components/Avatar';
import { DetailHeader } from '../components/DetailHeader';
import { EmoticonPicker } from '../components/EmoticonPicker';
import { ImageViewer } from '../components/ImageViewer';
import { colors } from '../theme';
import { MessageBubble } from './MessageBubble';

/** A friend's or a room's text chat: recent history, new messages as they come, and sending. */
export function Chat({
  voice,
  chat,
  title,
  subtitle,
  avatarUrl,
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
  /** above the messages, under the header */
  top?: ReactNode;
  /** room for the home indicator, unless something below the chat takes care of it */
  bottomInset: number;
  onBack: () => void;
  onError: (err: Error) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);
  // the emoticon and sticker picker, in place of the keyboard
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const me = voice.me.steamid;

  useEffect(() => {
    let current = true;
    const key = chatKey(chat);
    // listening first, so nothing sent while the history loads goes missing
    const off = voice.connection.on('message', (incoming) => {
      if (chatKey(incoming.chat) !== key) return;
      setMessages((list) => mergeMessages(list, [incoming.message]));
    });
    voice.connection
      .getRecentMessages(chat)
      .then(
        (history) => {
          if (current) setMessages((list) => mergeMessages(list, history));
        },
        (err: Error) =>
          current &&
          onError(new Error(`Could not load messages: ${err.message}`)),
      )
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
      off();
    };
  }, [voice, chat, onError]);

  function deliver(content: string | StickerPart, onFailed?: () => void) {
    voice.connection.sendMessage(chat, content).then(
      (sent) => setMessages((list) => mergeMessages(list, [sent])),
      (err: Error) => {
        onFailed?.();
        onError(new Error(`Could not send: ${err.message}`));
      },
    );
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

  // the list is inverted so it starts at the newest message
  const newestFirst = useMemo(() => [...messages].reverse(), [messages]);
  const nothingToSend = draft.trim() === '';

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <DetailHeader
        title={title}
        subtitle={subtitle}
        avatar={<Avatar url={avatarUrl} name={title} size={36} />}
        onBack={onBack}
      />
      {top}
      <FlatList
        inverted
        data={newestFirst}
        keyExtractor={(message) => message.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={styles.messages}
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
            />
          );
        }}
      />
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
          onChangeText={setDraft}
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
      {picking && (
        <EmoticonPicker
          voice={voice}
          onError={onError}
          bottomInset={bottomInset}
          // steam turns `:name:` into the emoticon when the message is sent
          onEmoticon={(emoticon) =>
            setDraft((typed) => `${typed}:${emoticon.name}:`)
          }
          onSticker={(sticker) => deliver(sticker)}
        />
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
});
