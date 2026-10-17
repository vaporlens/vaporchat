// the app's other pictures share its cache, react-native's Image stays for emoticons inside text
import { Image as CachedImage } from 'expo-image';
import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChatMessage, ChatPart, ReactionKey } from 'vaporchat/protocol';
import { Avatar } from '../components/Avatar';
import { openLink } from '../links';
import { colors } from '../theme';

type InlinePart = Extract<ChatPart, { kind: 'text' | 'link' | 'emoticon' }>;
type Block =
  | { kind: 'inline'; parts: InlinePart[] }
  | Exclude<ChatPart, InlinePart>;

const EMOTICON_SIZE = 22;
// emoticons sent on their own are shown big, like Steam does
const LONE_EMOTICON_SIZE = 48;
const STICKER_SIZE = 120;
const IMAGE_WIDTH = 240;

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

/** Text, links and emoticons flow together in one line of text, stickers and images stand alone. */
function blocks(parts: ChatPart[]) {
  const result: Block[] = [];
  for (const part of parts) {
    if (part.kind === 'sticker' || part.kind === 'image') {
      result.push(part);
      continue;
    }
    const last = result.at(-1);
    if (last?.kind === 'inline') last.parts.push(part);
    else result.push({ kind: 'inline', parts: [part] });
  }
  return result;
}

/** Memoized, the chat around it re-renders on every keystroke. Props are plain values for that. */
export const MessageBubble = memo(function MessageBubble({
  message,
  mine,
  runStart,
  runEnd,
  senderName,
  senderAvatarUrl,
  onOpenImage,
  onPickReaction,
  onChangeReaction,
}: {
  message: ChatMessage;
  mine: boolean;
  /** the first of the sender's messages in a row, set apart from the ones before */
  runStart: boolean;
  /** the last of them, its corner points at the sender's side */
  runEnd: boolean;
  /** who wrote it, shown where a run of someone's messages starts in a room */
  senderName: string | null;
  senderAvatarUrl: string | null;
  onOpenImage: (url: string) => void;
  /** held down, to pick a reaction for it */
  onPickReaction: (message: ChatMessage) => void;
  /** a reaction under it tapped: ours put on (`added`) or taken off */
  onChangeReaction: (
    message: ChatMessage,
    reaction: ReactionKey,
    added: boolean,
  ) => void;
}) {
  const { parts } = message;
  const loneEmoticons = parts.every(
    (part) =>
      part.kind === 'emoticon' ||
      (part.kind === 'text' && part.text.trim() === ''),
  );
  const emoticonSize = loneEmoticons ? LONE_EMOTICON_SIZE : EMOTICON_SIZE;
  // stickers float without a bubble
  const bare = parts.every((part) => part.kind === 'sticker');
  return (
    <View
      style={[
        styles.line,
        mine && styles.lineMine,
        runStart && styles.runStart,
      ]}
    >
      {senderName !== null && (
        <View style={styles.sender}>
          <Avatar url={senderAvatarUrl} name={senderName} size={18} />
          <Text style={styles.senderName} numberOfLines={1}>
            {senderName}
          </Text>
        </View>
      )}
      <Pressable
        onLongPress={() => onPickReaction(message)}
        accessibilityHint="Hold to react"
        style={[
          styles.bubble,
          bare ? styles.bare : mine ? styles.mine : styles.theirs,
          !bare && runEnd && (mine ? styles.tailMine : styles.tailTheirs),
        ]}
      >
        {blocks(parts).map((block, index) => {
          const key = `${block.kind}-${index}`;
          if (block.kind === 'inline') {
            return (
              <Text key={key} style={styles.text} selectable>
                {block.parts.map((part, i) =>
                  part.kind === 'text' ? (
                    part.text
                  ) : part.kind === 'link' ? (
                    <Text
                      // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
                      key={i}
                      onPress={() => openLink(part.url)}
                      style={styles.link}
                    >
                      {part.text}
                    </Text>
                  ) : (
                    <Image
                      // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
                      key={i}
                      source={{ uri: part.url }}
                      accessibilityLabel={`:${part.name}:`}
                      style={{ width: emoticonSize, height: emoticonSize }}
                    />
                  ),
                )}
              </Text>
            );
          }
          if (block.kind === 'sticker') {
            // react-native's Image shows only the first frame of animated PNGs
            return (
              <CachedImage
                key={key}
                source={{ uri: block.url }}
                accessibilityLabel={`${block.name} sticker`}
                style={styles.sticker}
              />
            );
          }
          return (
            <Pressable
              key={key}
              onPress={() => onOpenImage(block.url)}
              // it takes the touch, the bubble wouldn't see it held
              onLongPress={() => onPickReaction(message)}
              accessibilityLabel="Open image"
            >
              <CachedImage
                source={block.thumbnailUrl}
                style={[
                  styles.image,
                  {
                    aspectRatio:
                      block.width && block.height
                        ? block.width / block.height
                        : 4 / 3,
                  },
                ]}
              />
            </Pressable>
          );
        })}
        <Text style={[styles.time, mine && !bare && styles.timeMine]}>
          {timeFormat.format(message.time)}
        </Text>
      </Pressable>
      {message.reactions.length > 0 && (
        <View style={[styles.reactions, mine && styles.reactionsMine]}>
          {message.reactions.map((reaction) => (
            <Pressable
              key={`${reaction.kind}:${reaction.name}`}
              onPress={() =>
                onChangeReaction(message, reaction, !reaction.mine)
              }
              accessibilityLabel={`${reaction.name}, ${reaction.count}${reaction.mine ? ', yours' : ''}`}
              style={({ pressed }) => [
                styles.reaction,
                reaction.mine && styles.reactionMine,
                pressed && styles.pressed,
              ]}
            >
              <CachedImage source={reaction.url} style={styles.reactionImage} />
              <Text style={styles.reactionCount}>{reaction.count}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  line: { alignItems: 'flex-start', maxWidth: '82%' },
  lineMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  runStart: { marginTop: 8 },
  sender: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  senderName: { color: colors.online, fontSize: 13, fontWeight: '600' },
  bubble: {
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
  },
  mine: { backgroundColor: '#2d73ff' },
  theirs: { backgroundColor: colors.surfaceRaised },
  tailMine: { borderBottomRightRadius: 4 },
  tailTheirs: { borderBottomLeftRadius: 4 },
  bare: { paddingHorizontal: 0 },
  text: { color: colors.bright, fontSize: 16 },
  link: { textDecorationLine: 'underline' },
  sticker: { width: STICKER_SIZE, height: STICKER_SIZE },
  image: {
    width: IMAGE_WIDTH,
    maxWidth: '100%',
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  time: { color: colors.muted, fontSize: 11 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reactionsMine: { justifyContent: 'flex-end' },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reactionMine: {
    backgroundColor: colors.accentBackground,
    borderColor: colors.accent,
  },
  reactionImage: { width: 18, height: 18 },
  reactionCount: { color: colors.text, fontSize: 12, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  timeMine: { color: 'rgba(255, 255, 255, 0.7)', textAlign: 'right' },
});
