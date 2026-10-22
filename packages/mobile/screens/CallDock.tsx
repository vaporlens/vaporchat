import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type {
  VoiceSession,
  VoiceSessionState,
} from 'vaporchat/client/voiceSession';
import type { Friend } from 'vaporchat/protocol';
import { Appear } from '../components/Appear';
import { Avatar } from '../components/Avatar';
import { InfoSheet } from '../components/InfoSheet';
import { type IconName, RoundButton } from '../components/RoundButton';
import { SubTabs } from '../components/SubTabs';
import type { AudioOutput } from '../modules/audio-route';
import { colors, gradients } from '../theme';
import {
  addMicrophone,
  playbackOf,
  setDeafened,
  setPlayback,
  useSessionChanges,
} from '../voice';

// gains on what someone sends, Big Picture's per-user slider goes to double
const VOLUMES = ['0.25', '0.5', '1', '1.5', '2'] as const;

const OUTPUT_ICONS: Record<AudioOutput['kind'], IconName> = {
  speaker: 'volume-high',
  earpiece: 'ear',
  wired: 'headset',
  bluetooth: 'bluetooth',
  usb: 'headset',
};

const OUTPUT_LABELS: Record<AudioOutput['kind'], string> = {
  speaker: 'Speaker',
  earpiece: 'Earpiece',
  wired: 'Headset',
  bluetooth: 'Bluetooth',
  usb: 'Headset',
};

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

/** Green once connected, pulsing amber while it gets there. */
function StatusDot({ connected }: { connected: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (connected) {
      opacity.setValue(1);
      return;
    }
    const pulse = (toValue: number) =>
      Animated.timing(opacity, {
        toValue,
        duration: 700,
        useNativeDriver: true,
      });
    const loop = Animated.loop(Animated.sequence([pulse(0.3), pulse(1)]));
    loop.start();
    return () => loop.stop();
  }, [connected, opacity]);
  return (
    <Animated.View
      style={[
        styles.dot,
        {
          opacity,
          backgroundColor: connected ? colors.speaking : colors.warning,
        },
      ]}
    />
  );
}

function Person({
  person,
  speaking,
  badge,
  mutedHere = false,
  onPress,
}: {
  person: Friend;
  speaking: boolean;
  badge: IconName | null;
  /** muted by us, they still talk to the others */
  mutedHere?: boolean;
  /** to set how they play here, not for ourselves */
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.person, pressed && styles.pressed]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityHint={onPress ? 'Sets their volume here' : undefined}
      accessibilityLabel={[
        person.name,
        speaking && 'speaking',
        badge && BADGE_LABELS[badge],
        mutedHere && 'muted by you',
      ]
        .filter(Boolean)
        .join(', ')}
    >
      <View style={mutedHere && styles.mutedHere}>
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
    </Pressable>
  );
}

/** Someone's volume here and muting them, only for us, while `person` is set. */
function PlaybackSheet({
  session,
  person,
  onChange,
  onClose,
}: {
  session: VoiceSession;
  person: Friend | null;
  /** after each change, the playback lives in voice.ts */
  onChange: () => void;
  onClose: () => void;
}) {
  const playback = person ? playbackOf(person.steamid) : null;
  const change = (volume: number, muted: boolean) => {
    if (!person) return;
    setPlayback(session, person.steamid, { volume, muted });
    onChange();
  };
  return (
    <InfoSheet
      info={
        person && playback
          ? {
              title: person.name,
              subtitle: 'Only for you, they aren’t told',
              body: (
                <View style={styles.playback}>
                  <Text style={styles.playbackLabel}>Volume</Text>
                  <SubTabs
                    tabs={VOLUMES.map((volume) => ({
                      tab: volume,
                      title: `${Number(volume) * 100}%`,
                    }))}
                    tab={
                      VOLUMES.find((v) => Number(v) === playback.volume) ?? '1'
                    }
                    onChange={(volume) =>
                      change(Number(volume), playback.muted)
                    }
                  />
                  <RoundButton
                    icon={playback.muted ? 'volume-mute' : 'volume-high'}
                    label={playback.muted ? 'Unmute' : 'Mute'}
                    active={playback.muted}
                    onPress={() => change(playback.volume, !playback.muted)}
                  />
                </View>
              ),
            }
          : null
      }
      onClose={onClose}
    />
  );
}

const BADGE_LABELS: Partial<Record<IconName, string>> = {
  'volume-mute': 'deafened',
  'mic-off': 'muted',
};

function badgeFor(muted: boolean, deafened: boolean, noMic: boolean) {
  if (deafened) return 'volume-mute';
  if (muted || noMic) return 'mic-off';
  return null;
}

/** Where voice can play, to pick one, while `shown`. */
function OutputSheet({
  shown,
  outputs,
  output,
  onPick,
  onClose,
}: {
  shown: boolean;
  outputs: AudioOutput[];
  output: AudioOutput | null;
  onPick: (output: AudioOutput) => void;
  onClose: () => void;
}) {
  return (
    <InfoSheet
      info={
        shown
          ? {
              title: 'Play through',
              body: (
                <View>
                  {outputs.map((o) => (
                    <Pressable
                      key={o.id}
                      onPress={() => {
                        onPick(o);
                        onClose();
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: o.id === output?.id }}
                      style={({ pressed }) => [
                        styles.output,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons
                        name={OUTPUT_ICONS[o.kind]}
                        size={22}
                        color={colors.text}
                      />
                      <Text style={styles.outputName} numberOfLines={1}>
                        {isBuiltIn(o) ? OUTPUT_LABELS[o.kind] : o.name}
                      </Text>
                      {o.id === output?.id && (
                        <Ionicons
                          name="checkmark"
                          size={22}
                          color={colors.accent}
                        />
                      )}
                    </Pressable>
                  ))}
                </View>
              ),
            }
          : null
      }
      onClose={onClose}
    />
  );
}

function isBuiltIn(output: AudioOutput) {
  return output.kind === 'speaker' || output.kind === 'earpiece';
}

/**
 * The voice chat you are in: who is talking and the call controls, pinned to the bottom.
 * Memoized, it renders for the session's own changes, not for Home's.
 */
export const CallDock = memo(function CallDock({
  voice,
  session,
  title,
  outputs,
  output,
  setOutput,
}: {
  voice: SteamVoice;
  session: VoiceSession;
  title: string;
  /** where voice can play, headsets first */
  outputs: AudioOutput[];
  output: AudioOutput | null;
  setOutput: (output: AudioOutput) => void;
}) {
  const insets = useSafeAreaInsets();
  useSessionChanges(session);
  // whose volume is being set
  const [setting, setSetting] = useState<Friend | null>(null);
  // the sheet and the dimmed avatars show the playback's changes
  const [, setPlaybackChanges] = useState(0);
  const [picking, setPicking] = useState(false);
  const elapsed = useElapsed(session.state === 'connected');
  const connected = session.state === 'connected';
  return (
    <Appear
      from="bottom"
      style={[styles.dock, { paddingBottom: insets.bottom + 12 }]}
    >
      <View style={styles.titleRow}>
        <StatusDot connected={connected} />
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
        {session.participants.map((p) => {
          const person = voice.connection.user(p.steamid);
          return (
            <Person
              key={p.steamid}
              person={person}
              speaking={session.speaking.includes(p.steamid)}
              badge={badgeFor(p.micMuted, p.outputMuted, p.noMic)}
              mutedHere={playbackOf(p.steamid).muted}
              onPress={() => setSetting(person)}
            />
          );
        })}
      </ScrollView>
      <PlaybackSheet
        session={session}
        person={setting}
        onChange={() => setPlaybackChanges((n) => n + 1)}
        onClose={() => setSetting(null)}
      />
      <OutputSheet
        shown={picking}
        outputs={outputs}
        output={output}
        onPick={setOutput}
        onClose={() => setPicking(false)}
      />
      <View style={styles.controls}>
        {session.microphone ? (
          <RoundButton
            icon={session.micMuted ? 'mic-off' : 'mic'}
            label={session.micMuted ? 'Unmute' : 'Mute'}
            active={session.micMuted}
            onPress={() => session.setMicMuted(!session.micMuted)}
          />
        ) : (
          // joined listen-only, without the permission or with the microphone busy
          <RoundButton
            icon="mic-off"
            label="Use mic"
            onPress={() => void addMicrophone(session)}
          />
        )}
        <RoundButton
          icon="headset"
          label={session.outputMuted ? 'Undeafen' : 'Deafen'}
          active={session.outputMuted}
          onPress={() => setDeafened(session, !session.outputMuted)}
        />
        <RoundButton
          icon={OUTPUT_ICONS[output?.kind ?? 'speaker']}
          label={OUTPUT_LABELS[output?.kind ?? 'speaker']}
          // two switch on a tap, like a phone call's speaker button
          onPress={() => {
            const others = outputs.filter((o) => o.id !== output?.id);
            if (others.length === 1) setOutput(others[0]);
            else if (others.length > 1) setPicking(true);
          }}
        />
        <RoundButton
          icon="call"
          label="Leave"
          background={colors.danger}
          rotate="135deg"
          onPress={() => void session.leave()}
        />
      </View>
    </Appear>
  );
});

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
  pressed: { opacity: 0.6 },
  mutedHere: { opacity: 0.4 },
  playback: { gap: 12, alignItems: 'flex-start' },
  playbackLabel: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  output: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
  },
  outputName: { flex: 1, color: colors.bright, fontSize: 16 },
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
