import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  IncomingCall as Call,
  SteamVoice,
} from 'vaporchat/client/steamVoice';
import { Avatar } from '../components/Avatar';
import { RoundButton } from '../components/RoundButton';
import { useLastShown } from '../components/useLastShown';
import { colors, gradients } from '../theme';
import { startVoice } from '../voice';

const AVATAR_SIZE = 132;

/** A ring pulsing out from behind the caller's picture. */
function Pulse() {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1600,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);
  return (
    <Animated.View
      style={[
        styles.pulse,
        {
          opacity: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.6, 0],
          }),
          transform: [
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.6],
              }),
            },
          ],
        },
      ]}
    />
  );
}

/** A friend calling, over everything else like a phone call. Others calling at once show below, a tap answers theirs instead. */
export function IncomingCall({
  voice,
  calls,
  onError,
}: {
  voice: SteamVoice;
  calls: Call[];
  onError: (err: Error) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  // the call answered or declined stays shown as the screen slides away
  const call = useLastShown(
    calls.find((c) => c.voiceChatId === picked) ?? calls[0],
  );
  const caller = call ? voice.connection.user(call.steamid) : null;
  const others = calls.filter((c) => c.voiceChatId !== call?.voiceChatId);
  return (
    <Modal
      visible={calls.length > 0}
      animationType="slide"
      presentationStyle="fullScreen"
    >
      {call && caller && (
        <View style={styles.screen}>
          <Text style={styles.kicker}>STEAM VOICE CALL</Text>
          <View style={styles.caller}>
            <View style={styles.avatar}>
              <Pulse />
              <Avatar
                url={caller.avatarUrl}
                name={caller.name}
                size={AVATAR_SIZE}
                frame={colors.online}
              />
            </View>
            <Text style={styles.name} numberOfLines={2}>
              {caller.name}
            </Text>
            <Text style={styles.calling}>is calling you…</Text>
          </View>
          {others.length > 0 && (
            <View style={styles.others}>
              <Text style={styles.kicker}>ALSO CALLING</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.otherList}
              >
                {others.map((other) => {
                  const person = voice.connection.user(other.steamid);
                  return (
                    <Pressable
                      key={other.voiceChatId}
                      onPress={() => setPicked(other.voiceChatId)}
                      accessibilityLabel={`${person.name} is calling, show their call`}
                      style={({ pressed }) => [
                        styles.other,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Avatar
                        url={person.avatarUrl}
                        name={person.name}
                        size={28}
                      />
                      <Text style={styles.otherName} numberOfLines={1}>
                        {person.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}
          <View style={styles.actions}>
            <RoundButton
              icon="call"
              label="Decline"
              size={72}
              background={colors.danger}
              rotate="135deg"
              onPress={() => voice.declineCall(call).catch(onError)}
            />
            <RoundButton
              icon="call"
              label="Accept"
              size={72}
              background={colors.accept}
              onPress={() =>
                startVoice((mic) => voice.acceptCall(call, mic)).catch(onError)
              }
            />
          </View>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 96,
    paddingBottom: 72,
    paddingHorizontal: 24,
    backgroundColor: colors.background,
    experimental_backgroundImage: gradients.screen,
  },
  kicker: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  caller: { alignItems: 'center', gap: 10 },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  pulse: {
    position: 'absolute',
    width: AVATAR_SIZE + 12,
    height: AVATAR_SIZE + 12,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: colors.online,
  },
  name: {
    color: colors.bright,
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
  },
  calling: { color: colors.muted, fontSize: 17 },
  others: { alignItems: 'center', gap: 10, alignSelf: 'stretch' },
  otherList: { gap: 8, flexGrow: 1, justifyContent: 'center' },
  other: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 200,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 12,
    borderRadius: 20,
    backgroundColor: colors.surfaceRaised,
  },
  otherName: { color: colors.bright, fontSize: 15, flexShrink: 1 },
  pressed: { opacity: 0.6 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    width: '100%',
  },
});
