import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { StyleSheet, View } from 'react-native';
import type { LoopingVideoProps } from './LoopingVideo';

/** Plays `url` silently over and over, `onError` when it can't. */
function Player({ url, onError }: { url: string; onError?: () => void }) {
  const player = useVideoPlayer(url, (player) => {
    player.muted = true;
    player.loop = true;
    // a silent animation must not interrupt a voice call or music
    player.audioMixingMode = 'mixWithOthers';
    player.play();
  });
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') onError?.();
  });
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      nativeControls={false}
      contentFit="contain"
      // clipped to the rounded box, and see-through to the poster until its first frame
      surfaceType="textureView"
    />
  );
}

/**
 * A silent looping video, the way Steam plays the animations in its descriptions. A web view
 * each, like iOS has, stalls Android's UI thread as it starts. Its player plays the webm Steam
 * has them in and decodes off the UI thread. Over its poster, and only while `playing`: an
 * idle player still holds a decoder, which phones have few of.
 */
export function LoopingVideo({
  url,
  posterUrl,
  style,
  playing = true,
  onError,
}: LoopingVideoProps) {
  return (
    <View style={[styles.box, style]} pointerEvents="none">
      {posterUrl && (
        <Image
          source={posterUrl}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
        />
      )}
      {playing && <Player url={url} onError={onError} />}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
});
