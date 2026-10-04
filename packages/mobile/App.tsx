import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { SteamVoice } from 'vaporchat/client/steamVoice';

/** The server prints `http://host:port/#key=…`, the client talks to `ws://host:port/ws?key=…`. */
// parsed by hand, React Native's URL polyfill doesn't implement host/hash
function socketUrl(link: string) {
  const match = link.trim().match(/^http(s?):\/\/([^/#]+).*#key=([^&]+)$/);
  if (!match) throw new Error('not a vaporchat server link');
  const [, secure, host, key] = match;
  return `ws${secure}://${host}/ws?key=${key}`;
}

export default function App() {
  const [link, setLink] = useState('');
  const [status, setStatus] = useState(
    'Paste the link the vaporchat server printed',
  );

  async function connect() {
    setStatus('Connecting…');
    try {
      const voice = await SteamVoice.connect(socketUrl(link));
      setStatus(`Signed in as ${voice.me.name}`);
    } catch (err) {
      setStatus(
        `Could not connect: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={link}
        onChangeText={setLink}
        placeholder="http://192.168.1.10:3000/#key=…"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button title="Connect" onPress={connect} />
      <Text>{status}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 8,
    padding: 12,
  },
});
