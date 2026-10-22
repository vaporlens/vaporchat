import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Alert, Linking, Vibration } from 'react-native';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { VoiceSession } from 'vaporchat/client/voiceSession';
import {
  hasHeadset,
  resetAudioRoute,
  setRinging,
  setSpeakerOn,
} from './modules/audio-route';
import { onLeaveTapped, setCallActive } from './modules/call-service';

// buzz, pause, repeated while a call rings
const RING_PATTERN = [0, 800, 1200];

/** Null when there is no microphone or permission was denied, voice then joins listen-only. */
async function getMicrophone() {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.warn('No microphone, joining listen-only:', err);
    return null;
  }
}

function stopTracks(stream: MediaStream | null) {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

// react-native-webrtc plays remote audio by itself, deafening means disabling those tracks
function syncPlayback(session: VoiceSession) {
  for (const participant of session.participants) {
    for (const track of participant.stream?.getAudioTracks() ?? []) {
      track.enabled = !session.outputMuted;
    }
  }
}

/** Starts voice with the microphone, which is released again if starting fails. */
export async function startVoice(
  start: (microphone: MediaStream | null) => Promise<VoiceSession>,
) {
  const microphone = await getMicrophone();
  try {
    await start(microphone);
  } catch (err) {
    stopTracks(microphone);
    throw err;
  }
}

/** Takes the microphone in voice that joined listen-only, pointing to Settings when it's not allowed. */
export async function addMicrophone(session: VoiceSession) {
  let microphone: MediaStream;
  try {
    microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    // react-native-webrtc's name for a permission denied
    if ((err as Error).name === 'SecurityError') {
      Alert.alert(
        'Microphone access is off',
        'Allow Vaporlens to use the microphone in Settings to talk.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
    } else {
      Alert.alert("Couldn't use the microphone", (err as Error).message);
    }
    return;
  }
  // tapped twice, the first one has it already
  if (session.microphone) {
    stopTracks(microphone);
    return;
  }
  await session.setMicrophone(microphone);
  // the session ended meanwhile and didn't take it
  if (session.microphone !== microphone) {
    stopTracks(microphone);
    return;
  }
  // Android stops the microphone in the background unless the call's service says it uses it
  setCallActive(true);
}

export function setDeafened(session: VoiceSession, deafened: boolean) {
  session.setOutputMuted(deafened);
  syncPlayback(session);
}

/**
 * Re-renders on the session's state, participants, who is speaking (several times a second in a
 * lively call) and our mute and deafen. Only for what shows them, not the screens around.
 */
export function useSessionChanges(session: VoiceSession) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const offs = [
      session.on('state', rerender),
      session.on('speaking', rerender),
      session.on('participants', rerender),
      session.on('muted', rerender),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [session]);
}

/**
 * The current voice session, incoming calls (the phone rings and vibrates while they do), the
 * speaker setting and whether a headset is connected, re-rendering when they change. Not on the
 * session's own changes, see `useSessionChanges`.
 */
export function useVoice(voice: SteamVoice) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  // group voice is meant for the loudspeaker, not for holding the phone to your ear, unless a
  // headset is connected when voice starts
  const [speaker, setSpeaker] = useState(true);
  const speakerRef = useRef(speaker);
  const [headset, setHeadset] = useState(false);

  useEffect(() => {
    // sessions also start without a tap (taking over a simultaneous call), so wire them all here
    const wire = (session: VoiceSession) => {
      session.on('state', (state) => {
        // the audio route is only set up once audio flows
        if (state === 'connected') setSpeakerOn(speakerRef.current);
      });
      session.on('participants', () => syncPlayback(session));
      session.on('ended', ({ reason }) => {
        console.log('Voice ended:', reason);
        // a session taking over a simultaneous call detaches the microphone before this one ends
        stopTracks(session.microphone);
      });
    };
    // in voice chat a call coming in beeps, without ringing and buzzing over it
    const ring = () => {
      const ringing = voice.incomingCalls.length > 0;
      const inCall = voice.session !== null;
      if (ringing && !inCall) Vibration.vibrate(RING_PATTERN, true);
      else Vibration.cancel();
      setRinging(ringing, inCall);
    };
    if (voice.session) wire(voice.session);
    setCallActive(voice.session !== null);
    let inVoice = voice.session !== null;
    const offSession = voice.on('session', (session) => {
      if (session && !inVoice) {
        const plugged = hasHeadset();
        speakerRef.current = !plugged;
        setSpeaker(!plugged);
        setHeadset(plugged);
      }
      inVoice = session !== null;
      // null only once the last one ended, a session taking over another keeps voice going
      setCallActive(session !== null);
      if (session) wire(session);
      else resetAudioRoute();
      ring();
      rerender();
    });
    const offIncoming = voice.on('incomingCalls', () => {
      ring();
      rerender();
    });
    const offLeave = onLeaveTapped(() => void voice.session?.leave());
    return () => {
      offSession();
      offIncoming();
      offLeave();
      Vibration.cancel();
      setRinging(false, false);
      setCallActive(false);
    };
  }, [voice]);

  const changeSpeaker = useCallback((on: boolean) => {
    speakerRef.current = on;
    setSpeaker(on);
    setSpeakerOn(on);
  }, []);

  return {
    session: voice.session,
    incomingCalls: voice.incomingCalls,
    speaker,
    setSpeaker: changeSpeaker,
    headset,
  };
}
