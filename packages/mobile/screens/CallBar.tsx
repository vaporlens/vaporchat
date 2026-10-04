import { Button, Image, StyleSheet, Text, View } from 'react-native';
import type { IncomingCall, SteamVoice } from 'vaporchat/client/steamVoice';
import type { VoiceSession } from 'vaporchat/client/voiceSession';
import type { Friend } from 'vaporchat/protocol';
import { useColors } from '../colors';
import { setDeafened, startVoice } from '../voice';

function Person({
  person,
  speaking,
  note,
}: {
  person: Friend;
  speaking: boolean;
  note?: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.person}>
      <View
        style={[
          styles.ring,
          { borderColor: speaking ? colors.online : 'transparent' },
        ]}
      >
        {person.avatarUrl ? (
          <Image source={{ uri: person.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.border }]} />
        )}
      </View>
      <Text style={{ color: colors.text, fontSize: 12 }} numberOfLines={1}>
        {person.name}
      </Text>
      {note && (
        <Text style={{ color: colors.muted, fontSize: 11 }}>{note}</Text>
      )}
    </View>
  );
}

function IncomingCallRow({
  voice,
  call,
  onError,
}: {
  voice: SteamVoice;
  call: IncomingCall;
  onError: (err: Error) => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <Text style={{ color: colors.text, flex: 1 }}>
        {voice.connection.user(call.steamid).name} is calling
      </Text>
      <Button
        title="Accept"
        onPress={() =>
          startVoice((mic) => voice.acceptCall(call, mic)).catch(onError)
        }
      />
      <Button
        title="Decline"
        color={colors.error}
        onPress={() => voice.declineCall(call).catch(onError)}
      />
    </View>
  );
}

interface SpeakerControl {
  speaker: boolean;
  setSpeaker: (on: boolean) => void;
}

function Session({
  voice,
  session,
  title,
  speaker,
  setSpeaker,
}: {
  voice: SteamVoice;
  session: VoiceSession;
  title: string;
} & SpeakerControl) {
  const colors = useColors();
  const note = (muted: boolean, deafened: boolean, noMic: boolean) =>
    [muted && 'muted', deafened && 'deafened', noMic && 'no mic']
      .filter(Boolean)
      .join(', ') || undefined;
  return (
    <>
      <Text style={{ color: colors.text, fontWeight: '600' }}>
        {title} · {session.state}
      </Text>
      <View style={styles.people}>
        <Person
          person={voice.me}
          speaking={session.speaking.includes(voice.me.steamid)}
          note={note(
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
            note={note(p.micMuted, p.outputMuted, p.noMic)}
          />
        ))}
      </View>
      <View style={styles.row}>
        <Button
          title={session.micMuted ? 'Unmute' : 'Mute'}
          onPress={() => session.setMicMuted(!session.micMuted)}
        />
        <Button
          title={session.outputMuted ? 'Undeafen' : 'Deafen'}
          onPress={() => setDeafened(session, !session.outputMuted)}
        />
        <Button
          title={speaker ? 'Earpiece' : 'Speaker'}
          onPress={() => setSpeaker(!speaker)}
        />
        <Button
          title="Leave"
          color={colors.error}
          onPress={() => void session.leave()}
        />
      </View>
    </>
  );
}

/** Incoming calls and the voice chat you are in, shown above everything else. */
export function CallBar({
  voice,
  session,
  incomingCalls,
  title,
  onError,
  speaker,
  setSpeaker,
}: {
  voice: SteamVoice;
  session: VoiceSession | null;
  incomingCalls: IncomingCall[];
  title: string;
  onError: (err: Error) => void;
} & SpeakerControl) {
  const colors = useColors();
  if (!session && incomingCalls.length === 0) return null;
  return (
    <View style={[styles.bar, { borderColor: colors.border }]}>
      {incomingCalls.map((call) => (
        <IncomingCallRow
          key={call.voiceChatId}
          voice={voice}
          call={call}
          onError={onError}
        />
      ))}
      {session && (
        <Session
          voice={voice}
          session={session}
          title={title}
          speaker={speaker}
          setSpeaker={setSpeaker}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    gap: 8,
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  person: { alignItems: 'center', width: 64 },
  ring: { borderWidth: 2, borderRadius: 24, padding: 2 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
});
