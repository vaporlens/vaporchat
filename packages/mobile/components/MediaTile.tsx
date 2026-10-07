import Ionicons from '@expo/vector-icons/Ionicons';
import { useEventListener } from 'expo';
import { Image, type ImageStyle } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useRef, useState } from 'react';
import { Pressable, type StyleProp, StyleSheet, View } from 'react-native';
import type { GameDetails } from 'vaporchat/protocol';
import { colors, imageFadeMs } from '../theme';

/** A trailer or a screenshot of a game. */
export type MediaItem =
  | GameDetails['trailers'][number]
  | GameDetails['screenshots'][number];

function plural(count: number, noun: string) {
  return count > 0 ? `${count} ${noun}${count === 1 ? '' : 's'}` : '';
}

/** Like `2 trailers · 14 screenshots`. */
export function mediaCount(media: MediaItem[]) {
  const trailers = media.filter((item) => 'posterUrl' in item).length;
  return [
    plural(trailers, 'trailer'),
    plural(media.length - trailers, 'screenshot'),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Plays `url` fullscreen, `onExit` when the user leaves fullscreen or it can't play. */
function Player({ url, onExit }: { url: string; onExit: () => void }) {
  const player = useVideoPlayer(url, (player) => player.play());
  const view = useRef<VideoView>(null);
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') onExit();
  });
  return (
    <VideoView
      ref={view}
      player={player}
      style={StyleSheet.absoluteFill}
      nativeControls
      // iOS ignores it before the view is on screen, which it is by the first frame
      onFirstFrameRender={() => view.current?.enterFullscreen()}
      onFullscreenExit={() => {
        // expo-video resumes it on leaving fullscreen, it stops right away instead of on unmounting
        player.pause();
        onExit();
      }}
    />
  );
}

/**
 * A screenshot, opened with `onOpenImage` when tapped, or a trailer's poster with a play button.
 * A trailer loads only once tapped, plays fullscreen and stops on leaving it.
 */
export function MediaTile({
  item,
  style,
  onOpenImage,
}: {
  item: MediaItem;
  style: StyleProp<ImageStyle>;
  onOpenImage: (url: string) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const trailer = 'posterUrl' in item;
  return (
    <Pressable
      onPress={() => (trailer ? setPlaying(true) : onOpenImage(item.url))}
      disabled={playing}
      accessibilityLabel={trailer ? 'Play trailer' : undefined}
    >
      <Image
        source={trailer ? item.posterUrl : item.thumbnailUrl}
        transition={imageFadeMs}
        style={style}
        contentFit="cover"
      />
      {trailer && (
        <View style={styles.center}>
          <View style={styles.play}>
            <Ionicons name="play" size={22} color={colors.bright} />
          </View>
        </View>
      )}
      {/* unmounting it releases the player, which stops it */}
      {playing && <Player url={item.url} onExit={() => setPlaying(false)} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    width: 44,
    height: 44,
    borderRadius: 22,
    // the triangle's weight is left of its box's middle
    paddingLeft: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
});
