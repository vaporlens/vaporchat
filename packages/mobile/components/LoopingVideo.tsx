import { type Ref, useImperativeHandle, useMemo, useRef } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

export interface LoopingVideoControls {
  play: () => void;
  pause: () => void;
}

// as script strings, `<` escaped so they can't end the script
function script(value: string) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function page(url: string, posterUrl: string | null) {
  return `<!doctype html>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html, body { margin: 0; height: 100%; background: transparent; }
  video { display: block; width: 100%; height: 100%; object-fit: contain; }
</style>
<video autoplay muted loop playsinline></video>
<script>
  const video = document.querySelector('video');
  video.onerror = () => window.ReactNativeWebView?.postMessage('error');
  ${posterUrl ? `video.poster = ${script(posterUrl)};` : ''}
  video.src = ${script(url)};
</script>`;
}

/**
 * A silent looping video, the way Steam plays the animations in its descriptions. WebKit plays
 * the webm Steam has them in (native players don't), far lighter than an animated picture
 * decoded frame by frame. Not touchable, taps go to what's around. `onError` when it can't play.
 */
export function LoopingVideo({
  url,
  posterUrl,
  style,
  onError,
  ref,
}: {
  url: string;
  posterUrl: string | null;
  style: StyleProp<ViewStyle>;
  onError?: () => void;
  ref?: Ref<LoopingVideoControls>;
}) {
  const source = useMemo(
    () => ({ html: page(url, posterUrl) }),
    [url, posterUrl],
  );
  const web = useRef<WebView>(null);
  const paused = useRef(false);
  const apply = () => {
    // `play()` rejects when autoplay isn't allowed, the poster stays then
    web.current?.injectJavaScript(
      `${paused.current ? 'video.pause()' : 'video.play().catch(() => {})'}; true;`,
    );
  };
  useImperativeHandle(ref, () => ({
    play: () => {
      paused.current = false;
      apply();
    },
    pause: () => {
      paused.current = true;
      apply();
    },
  }));
  return (
    <View style={[styles.box, style]} pointerEvents="none">
      <WebView
        ref={web}
        source={source}
        style={styles.web}
        scrollEnabled={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        onMessage={onError}
        // paused before the page was there, before autoplay starts
        onLoadEnd={() => paused.current && apply()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  web: { backgroundColor: 'transparent' },
});
