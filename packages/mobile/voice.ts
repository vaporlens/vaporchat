import { useEffect, useReducer, useRef, useState } from 'react';
import { Vibration } from 'react-native';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { VoiceSession } from 'vaporchat/client/voiceSession';
import { setSpeakerOn } from './modules/audio-route';

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

export function setDeafened(session: VoiceSession, deafened: boolean) {
  session.setOutputMuted(deafened);
  syncPlayback(session);
}

/**
 * The current voice session, incoming calls (the phone vibrates while they ring) and the
 * speaker setting, re-rendering on every change.
 */
export function useVoice(voice: SteamVoice) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  // group voice is meant for the loudspeaker, not for holding the phone to your ear
  const [speaker, setSpeaker] = useState(true);
  const speakerRef = useRef(speaker);

  useEffect(() => {
    // sessions also start without a tap (taking over a simultaneous call), so wire them all here
    const wire = (session: VoiceSession) => {
      session.on('state', (state) => {
        // the audio route is only set up once audio flows
        if (state === 'connected') setSpeakerOn(speakerRef.current);
        rerender();
      });
      session.on('speaking', rerender);
      session.on('participants', () => {
        syncPlayback(session);
        rerender();
      });
      session.on('ended', ({ reason }) => {
        console.log('Voice ended:', reason);
        // a session taking over a simultaneous call detaches the microphone before this one ends
        stopTracks(session.microphone);
      });
    };
    if (voice.session) wire(voice.session);
    const offSession = voice.on('session', (session) => {
      if (session) wire(session);
      rerender();
    });
    const offIncoming = voice.on('incomingCalls', (calls) => {
      if (calls.length > 0) Vibration.vibrate(RING_PATTERN, true);
      else Vibration.cancel();
      rerender();
    });
    return () => {
      offSession();
      offIncoming();
      Vibration.cancel();
    };
  }, [voice]);

  return {
    session: voice.session,
    incomingCalls: voice.incomingCalls,
    speaker,
    setSpeaker: (on: boolean) => {
      speakerRef.current = on;
      setSpeaker(on);
      setSpeakerOn(on);
    },
  };
}
