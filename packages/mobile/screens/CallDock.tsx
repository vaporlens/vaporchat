import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type {
  VoiceSession,
  VoiceSessionState,
} from 'vaporchat/client/voiceSession';
import type { Friend } from 'vaporchat/protocol';
import { Avatar } from '../components/Avatar';
import { type IconName, RoundButton } from '../components/RoundButton';
import { colors, gradients } from '../theme';
import { setDeafened } from '../voice';

const STATE_LABELS: Record<VoiceSessionState, string> = {
  connecting: 'Connecting…',
  ringing: 'Ringing…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  ended: 'Call ended',
};

/** Seconds since `active` last turned true, counting up while it stays true. */
function useElapsed(active: boolean) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setStartedAt(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return active && startedAt ? Math.max(0, now - startedAt) / 1000 : null;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${minutes}:${rest}`;
}

function Person({
  person,
  speaking,
  badge,
}: {
  person: Friend;
  speaking: boolean;
  badge: IconName | null;
}) {
  return (
    <View style={styles.person}>
      <View>
        <Avatar
          url={person.avatarUrl}
          name={person.name}
          size={48}
          frame={speaking ? colors.speaking : 'transparent'}
          glow={speaking}
        />
        {badge && (
          <View style={styles.badge}>
            <Ionicons name={badge} size={12} color={colors.bright} />
          </View>
        )}
      </View>
      <Text style={styles.personName} numberOfLines={1}>
        {person.name}
      </Text>
    </View>
  );
}

function badgeFor(muted: boolean, deafened: boolean, noMic: boolean) {
  if (deafened) return 'volume-mute';
  if (muted || noMic) return 'mic-off';
  return null;
}

/** The voice chat you are in: who is talking and the call controls, pinned to the bottom. */
export function CallDock({
  voice,
  session,
  title,
  speaker,
  setSpeaker,
}: {
  voice: SteamVoice;
  session: VoiceSession;
  title: string;
  speaker: boolean;
  setSpeaker: (on: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const elapsed = useElapsed(session.state === 'connected');
  const connected = session.state === 'connected';
  return (
    <View style={[styles.dock, { paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.titleRow}>
        <View
          style={[
            styles.dot,
            { backgroundColor: connected ? colors.speaking : colors.warning },
          ]}
        />
        <View style={styles.grow}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text
            style={[
              styles.state,
              { color: connected ? colors.speaking : colors.warning },
            ]}
          >
            {elapsed !== null
              ? `Connected · ${formatDuration(elapsed)}`
              : STATE_LABELS[session.state]}
          </Text>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.people}
      >
        <Person
          person={voice.me}
          speaking={session.speaking.includes(voice.me.steamid)}
          badge={badgeFor(
            session.micMuted,
            session.outputMuted,
            !session.microphone,
          )}
        />
        {session.participants.map((p) => (
          <Person
            key={p.steamid}
            person={voice.connection.user(p.steamid)}
            speaking={session.speaking.includes(p.steamid)}
            badge={badgeFor(p.micMuted, p.outputMuted, p.noMic)}
          />
        ))}
      </ScrollView>
      <View style={styles.controls}>
        <RoundButton
          icon={session.micMuted ? 'mic-off' : 'mic'}
          label={session.micMuted ? 'Unmute' : 'Mute'}
          active={session.micMuted}
          onPress={() => session.setMicMuted(!session.micMuted)}
        />
        <RoundButton
          icon="headset"
          label={session.outputMuted ? 'Undeafen' : 'Deafen'}
          active={session.outputMuted}
          onPress={() => setDeafened(session, !session.outputMuted)}
        />
        <RoundButton
          icon={speaker ? 'volume-high' : 'ear'}
          label={speaker ? 'Speaker' : 'Earpiece'}
          onPress={() => setSpeaker(!speaker)}
        />
        <RoundButton
          icon="call"
          label="Leave"
          background={colors.danger}
          rotate="135deg"
          onPress={() => void session.leave()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    gap: 14,
    paddingTop: 16,
    paddingHorizontal: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.border,
    experimental_backgroundImage: gradients.dock,
    boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.45)',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  grow: { flex: 1 },
  title: { color: colors.bright, fontSize: 17, fontWeight: '700' },
  state: { fontSize: 13, fontWeight: '600', marginTop: 1 },
  people: { gap: 14, paddingVertical: 4 },
  person: { alignItems: 'center', gap: 6, width: 64 },
  personName: { color: colors.text, fontSize: 12, maxWidth: 64 },
  badge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 4,
  },
});
