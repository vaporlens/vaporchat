// the app's other pictures share its cache, react-native's Image stays for emoticons inside text
import { Image as CachedImage } from 'expo-image';
import { memo, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import type {
  ChatMessage,
  ChatPart,
  ReactionKey,
  StoreItem,
} from 'vaporchat/protocol';
import { Avatar } from '../components/Avatar';
import { openLink } from '../links';
import { colors } from '../theme';
import { LinkPreview } from './LinkPreviews';

type InlinePart = Extract<
  ChatPart,
  { kind: 'text' | 'link' | 'emoticon' | 'spoiler' | 'mention' }
>;
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

/** Text, links, emoticons, spoilers and mentions flow together in one line of text, the rest stands alone. */
function blocks(parts: ChatPart[]) {
  const result: Block[] = [];
  for (const part of parts) {
    if (
      part.kind === 'sticker' ||
      part.kind === 'image' ||
      part.kind === 'quote' ||
      part.kind === 'code' ||
      part.kind === 'storeLink' ||
      part.kind === 'webPreview' ||
      part.kind === 'youtube'
    ) {
      result.push(part);
      continue;
    }
    const last = result.at(-1);
    if (last?.kind === 'inline') last.parts.push(part);
    else result.push({ kind: 'inline', parts: [part] });
  }
  return result;
}

function Link({ text, url }: { text: string; url: string }) {
  return (
    <Text onPress={() => openLink(url)} style={styles.link}>
      {text}
    </Text>
  );
}

/** Covered until tapped, like on Steam. Its links open once shown. */
function Spoiler({
  parts,
}: {
  parts: Extract<ChatPart, { kind: 'spoiler' }>['parts'];
}) {
  const [shown, setShown] = useState(false);
  if (!shown) {
    return (
      <Text
        onPress={() => setShown(true)}
        accessibilityHint="Tap to show the spoiler"
        style={styles.spoiler}
      >
        {parts.map((part) => part.text).join('')}
      </Text>
    );
  }
  return parts.map((part, i) =>
    part.kind === 'link' ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
      <Link key={i} text={part.text} url={part.url} />
    ) : (
      part.text
    ),
  );
}

/** Opens full screen when tapped, a spoiler is blurred until a first tap. */
function Picture({
  image,
  onOpenImage,
  onLongPress,
}: {
  image: Extract<ChatPart, { kind: 'image' }>;
  onOpenImage: (url: string) => void;
  onLongPress: () => void;
}) {
  const [hidden, setHidden] = useState(image.spoiler === true);
  return (
    <Pressable
      onPress={() => (hidden ? setHidden(false) : onOpenImage(image.url))}
      // it takes the touch, the bubble wouldn't see it held
      onLongPress={onLongPress}
      accessibilityLabel={hidden ? 'Show spoiler image' : 'Open image'}
    >
      <CachedImage
        source={image.thumbnailUrl}
        blurRadius={hidden ? 40 : 0}
        style={[
          styles.image,
          {
            aspectRatio:
              image.width && image.height ? image.width / image.height : 4 / 3,
          },
        ]}
      />
      {hidden && (
        <View style={styles.spoilerCover}>
          <Text style={styles.spoilerLabel}>Spoiler</Text>
        </View>
      )}
    </Pressable>
  );
}

/** A message's parts, a quote's inside it. `me` is our SteamID64, mentions of us stand out. */
function Blocks({
  parts,
  me,
  feeds,
  emoticonSize,
  onOpenImage,
  onOpenGame,
  onLongPress,
}: {
  parts: ChatPart[];
  me: string;
  feeds: SteamFeeds;
  emoticonSize: number;
  onOpenImage: (url: string) => void;
  onOpenGame: (item: StoreItem) => void;
  onLongPress: () => void;
}) {
  return blocks(parts).map((block, index) => {
    const key = `${block.kind}-${index}`;
    if (block.kind === 'inline') {
      return (
        <Text key={key} style={styles.text} selectable>
          {block.parts.map((part, i) =>
            part.kind === 'text' ? (
              part.text
            ) : part.kind === 'spoiler' ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
              <Spoiler key={i} parts={part.parts} />
            ) : part.kind === 'link' ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
              <Link key={i} text={part.text} url={part.url} />
            ) : part.kind === 'mention' ? (
              <Text
                // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
                key={i}
                style={[
                  styles.mention,
                  // everyone, or us
                  (part.steamid ?? me) === me && styles.mentionMe,
                ]}
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
    if (block.kind === 'quote') {
      return (
        <View key={key} style={styles.quote}>
          <Blocks
            parts={block.parts}
            me={me}
            feeds={feeds}
            emoticonSize={EMOTICON_SIZE}
            onOpenImage={onOpenImage}
            onOpenGame={onOpenGame}
            onLongPress={onLongPress}
          />
        </View>
      );
    }
    if (block.kind === 'code') {
      return (
        <Text key={key} style={styles.code} selectable>
          {block.text}
        </Text>
      );
    }
    if (
      block.kind === 'storeLink' ||
      block.kind === 'webPreview' ||
      block.kind === 'youtube'
    ) {
      return (
        <LinkPreview
          key={key}
          feeds={feeds}
          part={block}
          onOpenGame={onOpenGame}
          onLongPress={onLongPress}
        />
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
      <Picture
        key={key}
        image={block}
        onOpenImage={onOpenImage}
        onLongPress={onLongPress}
      />
    );
  });
}

/** Memoized, the chat around it re-renders on every keystroke. Props are plain values for that. */
export const MessageBubble = memo(function MessageBubble({
  message,
  me,
  feeds,
  mine,
  runStart,
  runEnd,
  senderName,
  senderAvatarUrl,
  onOpenImage,
  onOpenGame,
  onPickReaction,
  onChangeReaction,
}: {
  message: ChatMessage;
  /** our SteamID64 */
  me: string;
  /** loads the games of store links */
  feeds: SteamFeeds;
  mine: boolean;
  /** the first of the sender's messages in a row, set apart from the ones before */
  runStart: boolean;
  /** the last of them, its corner points at the sender's side */
  runEnd: boolean;
  /** who wrote it, shown where a run of someone's messages starts in a room */
  senderName: string | null;
  senderAvatarUrl: string | null;
  onOpenImage: (url: string) => void;
  onOpenGame: (item: StoreItem) => void;
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
        <Blocks
          parts={parts}
          me={me}
          feeds={feeds}
          emoticonSize={emoticonSize}
          onOpenImage={onOpenImage}
          onOpenGame={onOpenGame}
          onLongPress={() => onPickReaction(message)}
        />
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
  mention: { fontWeight: '700' },
  mentionMe: {
    color: colors.mentionText,
    backgroundColor: colors.mentionBackground,
  },
  spoiler: { color: colors.bar, backgroundColor: colors.bar },
  spoilerCover: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spoilerLabel: {
    color: colors.bright,
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  quote: {
    gap: 6,
    borderLeftWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    paddingLeft: 8,
  },
  code: {
    color: colors.bright,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 14,
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
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
