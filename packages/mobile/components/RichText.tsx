import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
} from 'react-native';
import type { RichBlock, RichSpan } from 'vaporchat/protocol';
import { openLink } from '../links';
import { colors } from '../theme';

function spanStyle(span: RichSpan): TextStyle {
  const lines = [
    span.underline && 'underline',
    span.strike && 'line-through',
  ].filter(Boolean);
  return {
    fontWeight: span.bold ? '700' : undefined,
    fontStyle: span.italic ? 'italic' : undefined,
    textDecorationLine: (lines.join(' ') || undefined) as
      | TextStyle['textDecorationLine']
      | undefined,
    color: span.link ? colors.accent : undefined,
  };
}

/** Covered like on Steam until tapped. */
function Spoiler({ span, style }: { span: RichSpan; style: TextStyle }) {
  const [shown, setShown] = useState(false);
  return (
    <Text
      onPress={() => setShown(true)}
      style={[style, !shown && styles.spoiler]}
    >
      {span.text}
    </Text>
  );
}

function Spans({ spans }: { spans: RichSpan[] }) {
  return spans.map((span, index) => {
    const key = `${index}`;
    const style = spanStyle(span);
    if (span.spoiler) return <Spoiler key={key} span={span} style={style} />;
    const { link } = span;
    return (
      <Text
        key={key}
        style={style}
        onPress={link ? () => openLink(link) : undefined}
      >
        {span.text}
      </Text>
    );
  });
}

/** A picture as wide as the text, as tall as its proportions say once known. */
function RichImage({
  block,
  onOpenImage,
}: {
  block: Extract<RichBlock, { kind: 'image' }>;
  onOpenImage: (url: string) => void;
}) {
  const [ratio, setRatio] = useState(
    block.width && block.height ? block.width / block.height : 16 / 9,
  );
  return (
    <Pressable onPress={() => onOpenImage(block.url)}>
      <Image
        source={block.url}
        style={[styles.image, { aspectRatio: ratio }]}
        contentFit="contain"
        onLoad={({ source }) => {
          if (source.width > 0 && source.height > 0) {
            setRatio(source.width / source.height);
          }
        }}
      />
    </Pressable>
  );
}

function Block({
  block,
  onOpenImage,
}: {
  block: RichBlock;
  onOpenImage: (url: string) => void;
}) {
  switch (block.kind) {
    case 'heading':
      return (
        <Text style={[styles.text, styles[`h${block.level}`]]}>
          <Spans spans={block.spans} />
        </Text>
      );
    case 'paragraph':
      return (
        <Text style={styles.text}>
          <Spans spans={block.spans} />
        </Text>
      );
    case 'listItem':
      return (
        <View style={[styles.item, { paddingLeft: block.depth * 18 }]}>
          <Text style={[styles.text, styles.marker]}>{block.marker}</Text>
          <Text style={[styles.text, styles.grow]}>
            <Spans spans={block.spans} />
          </Text>
        </View>
      );
    case 'quote':
      return (
        <View style={styles.quote}>
          <Text style={[styles.text, styles.quoteText]}>
            <Spans spans={block.spans} />
          </Text>
        </View>
      );
    case 'code':
      return <Text style={styles.code}>{block.text}</Text>;
    case 'image':
      return <RichImage block={block} onOpenImage={onOpenImage} />;
    case 'youtube':
      return (
        <Pressable
          onPress={() => openLink(block.url)}
          accessibilityLabel="Play video on YouTube"
        >
          <Image
            source={block.thumbnailUrl}
            style={styles.video}
            contentFit="cover"
          />
          <View style={styles.play}>
            <Ionicons name="logo-youtube" size={56} color={colors.bright} />
          </View>
        </Pressable>
      );
    case 'link':
      return (
        <Pressable
          onPress={() => openLink(block.url)}
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
        >
          <Ionicons name="link" size={18} color={colors.accent} />
          <Text style={styles.linkText} numberOfLines={1}>
            {block.url.replace(/^https?:\/\//, '')}
          </Text>
        </Pressable>
      );
    case 'rule':
      return <View style={styles.rule} />;
  }
}

/** A store page or news post, as Steam formats it. */
export function RichText({
  blocks,
  onOpenImage,
}: {
  blocks: RichBlock[];
  onOpenImage: (url: string) => void;
}) {
  return (
    <View style={styles.blocks}>
      {blocks.map((block, index) => (
        // blocks never move, their position is their identity
        // biome-ignore lint/suspicious/noArrayIndexKey: see above
        <Block key={index} block={block} onOpenImage={onOpenImage} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  blocks: { gap: 12 },
  text: { color: colors.text, fontSize: 15, lineHeight: 22 },
  h1: { color: colors.bright, fontSize: 22, lineHeight: 28, fontWeight: '700' },
  h2: { color: colors.bright, fontSize: 19, lineHeight: 25, fontWeight: '700' },
  h3: { color: colors.bright, fontSize: 17, lineHeight: 23, fontWeight: '700' },
  item: { flexDirection: 'row', gap: 8, marginTop: -6 },
  marker: { minWidth: 14, color: colors.muted },
  grow: { flex: 1 },
  quote: {
    borderLeftWidth: 3,
    borderColor: colors.border,
    paddingLeft: 12,
  },
  quoteText: { color: colors.muted, fontStyle: 'italic' },
  code: {
    color: colors.text,
    fontFamily: 'Menlo',
    fontSize: 13,
    padding: 10,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  spoiler: {
    color: colors.surfaceRaised,
    backgroundColor: colors.surfaceRaised,
  },
  image: { width: '100%', borderRadius: 6 },
  video: { width: '100%', aspectRatio: 16 / 9, borderRadius: 6 },
  play: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkText: { flex: 1, color: colors.accent, fontSize: 14 },
  pressed: { opacity: 0.7 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
