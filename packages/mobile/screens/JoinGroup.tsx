import { useState } from 'react';
import { Button, StyleSheet, TextInput, View } from 'react-native';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import { useColors } from '../colors';

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
  const colors = useColors();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);

  async function join() {
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
    <View style={styles.row}>
      <TextInput
        style={[
          styles.input,
          { color: colors.text, borderColor: colors.border },
        ]}
        value={link}
        onChangeText={setLink}
        placeholder="Invite link (https://s.team/chat/…)"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        onSubmitEditing={join}
      />
      <Button
        title={busy ? 'Joining…' : 'Join'}
        disabled={busy || link.trim() === ''}
        onPress={join}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 10 },
});
