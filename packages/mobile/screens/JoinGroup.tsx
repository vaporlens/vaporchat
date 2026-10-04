import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import { Field } from '../components/Field';
import { GradientButton } from '../components/GradientButton';
import { colors } from '../theme';

/** Joins a Steam group chat from an `https://s.team/chat/…` invite link. */
export function JoinGroup({
  voice,
  onJoined,
  onError,
}: {
  voice: SteamVoice;
  onJoined: () => void;
  onError: (err: Error) => void;
}) {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);

  async function join() {
    if (link.trim() === '') return;
    setBusy(true);
    try {
      await voice.connection.joinGroupByInviteLink(link.trim());
      setLink('');
      onJoined();
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Join a group chat</Text>
      <Text style={styles.hint}>
        Paste the invite link someone shared from Steam chat.
      </Text>
      <Field
        icon="link"
        value={link}
        onChangeText={setLink}
        placeholder="https://s.team/chat/…"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="join"
        autoFocus
        onSubmitEditing={join}
      />
      <GradientButton
        title="Join group"
        busy={busy}
        disabled={link.trim() === ''}
        onPress={join}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    marginHorizontal: 12,
    marginTop: 12,
    padding: 16,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { color: colors.bright, fontSize: 16, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 13 },
});
