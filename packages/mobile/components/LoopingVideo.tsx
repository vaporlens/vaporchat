import { useEffect, useMemo, useRef } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

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

/** What both platforms' `LoopingVideo` take. */
export interface LoopingVideoProps {
  url: string;
  posterUrl: string | null;
  style: StyleProp<ViewStyle>;
  /** paused (Android: released) while false, scrolled away say */
  playing?: boolean;
  onError?: () => void;
}

/**
 * A silent looping video, the way Steam plays the animations in its descriptions, far lighter
 * than an animated picture decoded frame by frame. A web view plays it, the webm some only come
 * in too. Not touchable, taps go to what's around. `onError` when it can't play. Android plays
 * them natively, see `LoopingVideo.android.tsx`.
 */
export function LoopingVideo({
  url,
  posterUrl,
  style,
  playing = true,
  onError,
}: LoopingVideoProps) {
  const source = useMemo(
    () => ({ html: page(url, posterUrl) }),
    [url, posterUrl],
  );
  const web = useRef<WebView>(null);
  // `play()` rejects when autoplay isn't allowed, the poster stays then
  const command = playing ? 'video.play().catch(() => {})' : 'video.pause()';
  useEffect(() => {
    web.current?.injectJavaScript(`${command}; true;`);
  }, [command]);
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
        onLoadEnd={() =>
          !playing && web.current?.injectJavaScript('video.pause(); true;')
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  web: { backgroundColor: 'transparent' },
});
