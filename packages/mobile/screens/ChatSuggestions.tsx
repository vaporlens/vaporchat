import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { StoreItem } from 'vaporchat/protocol';
import type { MentionPick } from 'vaporchat/steam/bbcode';
import { accountIdFromSteamId } from 'vaporchat/steam/friends';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';

// the commands of Steam's desktop client, offered as `/` is typed
const COMMANDS = [
  { name: 'code', hint: 'Monospaced code' },
  { name: 'pre', hint: 'Preformatted text' },
  { name: 'quote', hint: 'A quote' },
  { name: 'spoiler', hint: 'Hidden until tapped' },
  { name: 'store', hint: 'Share a game' },
];
const GAMES_SHOWN = 5;
// searching once typing pauses, not for every letter
const SEARCH_DELAY_MS = 300;
const EVERYONE: (MentionPick & { hint: string })[] = [
  { text: '@all', target: 'all', hint: 'Everyone in the group' },
  { text: '@here', target: 'here', hint: 'Everyone online' },
];
const MEMBERS_SHOWN = 5;

/** The store's games for `term`, picking one sends its store page, which Steam shows as a card. */
function StoreSuggestions({
  feeds,
  term,
  onSend,
}: {
  feeds: SteamFeeds;
  term: string;
  onSend: (text: string) => void;
}) {
  // null while searching
  const [games, setGames] = useState<StoreItem[] | null>(null);
  useEffect(() => {
    let current = true;
    setGames(null);
    const timer = setTimeout(() => {
      feeds.searchGames(term).then(
        ({ items }) =>
          current &&
          setGames(
            items.filter(({ appid }) => appid !== null).slice(0, GAMES_SHOWN),
          ),
        // only suggestions, the typed text still sends
        () => current && setGames([]),
      );
    }, SEARCH_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [feeds, term]);
  if (games?.length === 0) return null;
  return (
    <View style={styles.list}>
      {games === null ? (
        <ActivityIndicator color={colors.muted} style={styles.searching} />
      ) : (
        games.map((game) => (
          <Pressable
            key={game.url}
            onPress={() => onSend(game.url)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Image source={game.imageUrl} style={styles.capsule} />
            <Text style={styles.name} numberOfLines={1}>
              {game.name}
            </Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

/**
 * What fits the end of the draft, to pick: the commands after a `/` typed first, games after
 * `/store`, and in rooms the members after an `@`.
 */
export function ChatSuggestions({
  voice,
  draft,
  memberIds,
  onDraft,
  onMention,
  onSend,
}: {
  voice: SteamVoice;
  draft: string;
  /** SteamID64s of who an `@` can mention, none outside rooms */
  memberIds: string[];
  onDraft: (draft: string) => void;
  onMention: (pick: MentionPick) => void;
  /** sends this in place of the draft */
  onSend: (text: string) => void;
}) {
  const storeTerm = /^\/store\s+(\S.*)$/i.exec(draft)?.[1];
  if (storeTerm !== undefined) {
    return (
      <StoreSuggestions
        feeds={voice.connection.feeds}
        term={storeTerm.trim()}
        onSend={onSend}
      />
    );
  }
  const typedCommand = /^\/(\w*)$/.exec(draft)?.[1].toLowerCase();
  if (typedCommand !== undefined) {
    const commands = COMMANDS.filter(({ name }) =>
      name.startsWith(typedCommand),
    );
    if (commands.length === 0) return null;
    return (
      <View style={styles.list}>
        {commands.map(({ name, hint }) => (
          <Pressable
            key={name}
            onPress={() => onDraft(`/${name} `)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Text style={styles.name}>/{name}</Text>
            <Text style={styles.hint}>{hint}</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  const typedMention = /(?:^|\s)@([^\s@]*)$/.exec(draft)?.[1];
  if (typedMention === undefined || memberIds.length === 0) return null;
  const typed = typedMention.toLowerCase();
  // looked up only now, it's on every keystroke
  const members = memberIds
    .filter((id) => id !== voice.me.steamid)
    .map((id) => voice.connection.user(id))
    .filter(({ name }) => name.toLowerCase().includes(typed))
    .sort(
      (a, b) =>
        Number(b.name.toLowerCase().startsWith(typed)) -
          Number(a.name.toLowerCase().startsWith(typed)) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, MEMBERS_SHOWN);
  const everyone = EVERYONE.filter(({ target }) =>
    String(target).startsWith(typed),
  );
  if (members.length === 0 && everyone.length === 0) return null;
  const pick = (pick: MentionPick) => {
    onDraft(
      `${draft.slice(0, draft.length - typedMention.length - 1)}${pick.text} `,
    );
    onMention(pick);
  };
  return (
    <View style={styles.list}>
      {members.map((member) => (
        <Pressable
          key={member.steamid}
          onPress={() =>
            pick({
              text: `@${member.name}`,
              target: accountIdFromSteamId(member.steamid),
            })
          }
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Avatar url={member.avatarUrl} name={member.name} size={24} />
          <Text style={styles.name} numberOfLines={1}>
            {member.name}
          </Text>
        </Pressable>
      ))}
      {everyone.map(({ hint, ...everyonePick }) => (
        <Pressable
          key={everyonePick.text}
          onPress={() => pick(everyonePick)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Text style={styles.name}>{everyonePick.text}</Text>
          <Text style={styles.hint}>{hint}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: colors.bar,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  name: {
    flexShrink: 1,
    color: colors.bright,
    fontSize: 16,
    fontWeight: '600',
  },
  hint: { color: colors.muted, fontSize: 14 },
  // store headers are 460×215
  capsule: { width: 64, aspectRatio: 460 / 215, borderRadius: 3 },
  searching: { paddingVertical: 12 },
  pressed: { opacity: 0.6 },
});
