import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import {
  type GameFit,
  getGameFit,
  getQueueVote,
  getVaporlensReport,
  hasVaporlensSession,
  requestAnalysis,
  requestUpdate,
  type VaporlensAnswer,
} from '../vaporlens';

// VaporLens features for the account signed in to vaporlens.app. Loaded fresh on every page, not
// from the cache: an old answer would show a stale vote, or no taste profile right after an import.

/** What the server answered, its "already analyzed" message has a link in it. */
function answerText({ error, message }: VaporlensAnswer) {
  return (error ?? message ?? '').replace(/<[^>]*>/g, '');
}

/** How close the game is to what the user plays, null while signed out of vaporlens.app or loading. */
export function useGameFit(appid: number) {
  const [fit, setFit] = useState<GameFit | null>(null);
  useEffect(() => {
    let shown = true;
    setFit(null);
    getGameFit(appid)
      .then((loaded) => shown && setFit(loaded))
      // vaporlens down: the gauge stays empty
      .catch(() => {});
    return () => {
      shown = false;
    };
  }, [appid]);
  return fit;
}

/**
 * Asks VaporLens to analyze the game, or votes for it when it's queued already. Only for games
 * it hasn't analyzed, nothing while signed out of vaporlens.app.
 */
export function RequestAnalysis({ appid }: { appid: number }) {
  const [requested, setRequested] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const [answer, setAnswer] = useState('');
  useEffect(() => {
    let shown = true;
    setRequested(null);
    setAnswer('');
    // the page's report starts out null while it loads, so this asks itself (from the CDN)
    getVaporlensReport(appid)
      .then((report) => (report ? null : getQueueVote(appid)))
      .then((vote) => {
        if (shown && vote) setRequested(vote.hasUserVote);
      })
      // vaporlens down: the page works without it
      .catch(() => {});
    return () => {
      shown = false;
    };
  }, [appid]);
  if (requested === null) return null;

  const request = () => {
    setSending(true);
    requestAnalysis(appid)
      .then((answered) => {
        setAnswer(answerText(answered));
        // asked again, it would say "updated" while the vote counts once
        if (!answered.error) setRequested(true);
      })
      .finally(() => setSending(false));
  };
  return (
    <View style={styles.request}>
      <Text style={styles.text}>VaporLens hasn't analyzed this game yet</Text>
      <Pressable
        disabled={requested || sending}
        onPress={request}
        style={({ pressed }) => [
          styles.button,
          requested && styles.buttonDone,
          (pressed || sending) && styles.pressed,
        ]}
      >
        <Text style={[styles.buttonText, requested && styles.buttonTextDone]}>
          {requested ? '✓ Requested' : 'Request analysis'}
        </Text>
      </Pressable>
      {answer !== '' && <Text style={styles.muted}>{answer}</Text>}
    </View>
  );
}

// vaporlens.app offers an update a week after the last analysis
const UPDATE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** A text action like the report's "Full report", muted while off. */
function LinkButton({
  text,
  icon,
  disabled,
  onPress,
}: {
  text: string;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const color = disabled ? colors.muted : colors.accent;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}
    >
      {icon && <Ionicons name={icon} size={13} color={color} />}
      <Text style={[styles.linkText, { color }]}>{text}</Text>
    </Pressable>
  );
}

/**
 * Asks VaporLens to analyze the game again once its report is a week old, confirmed first like
 * vaporlens.app's "Request update". Nothing while signed out of vaporlens.app.
 */
export function RequestUpdate({
  appid,
  lastUpdated,
}: {
  appid: number;
  /** the report's ISO date */
  lastUpdated: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let shown = true;
    hasVaporlensSession().then((has) => shown && setSignedIn(has));
    return () => {
      shown = false;
    };
  }, []);
  if (!signedIn || Date.now() - Date.parse(lastUpdated) < UPDATE_AFTER_MS)
    return null;

  const request = () => {
    setSending(true);
    setError('');
    requestUpdate(appid)
      .then((answered) => {
        setConfirming(false);
        // vaporlens.app shows it processing once it's in the queue
        if (!answered.error) setQueued(true);
        else {
          setError(answerText(answered));
          // a 401 dropped the session: signed out, it hides
          hasVaporlensSession().then(setSignedIn);
        }
      })
      .finally(() => setSending(false));
  };
  return (
    <View style={styles.update}>
      <View style={styles.updateLinks}>
        {confirming ? (
          <>
            <LinkButton
              text="No, cancel"
              onPress={() => setConfirming(false)}
            />
            <LinkButton
              text="Yes, request update"
              disabled={sending}
              onPress={request}
            />
          </>
        ) : (
          <LinkButton
            text={queued ? 'Already processing...' : 'Request update'}
            icon="refresh"
            disabled={queued}
            onPress={() => setConfirming(true)}
          />
        )}
      </View>
      {error !== '' && <Text style={styles.muted}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  // apart from the report's tappable points above
  update: { gap: 8, marginTop: 16 },
  // the two answers apart from each other
  updateLinks: { flexDirection: 'row', gap: 32 },
  muted: { color: colors.muted, fontSize: 13 },
  text: { color: colors.text, fontSize: 14 },
  request: {
    gap: 8,
    padding: 12,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  button: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.accentBackground,
  },
  buttonDone: { backgroundColor: colors.surfaceRaised },
  buttonText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  buttonTextDone: { color: colors.muted },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
