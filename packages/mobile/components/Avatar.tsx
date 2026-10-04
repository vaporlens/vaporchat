import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

function initial(name: string) {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?';
}

/**
 * A rounded square picture like Steam's, in a frame of the person's status color.
 * Shows the initial when there is no picture or it doesn't load.
 */
export function Avatar({
  url,
  name,
  size = 40,
  frame,
  glow = false,
}: {
  url: string | null;
  name: string;
  size?: number;
  frame?: string;
  glow?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const radius = Math.round(size * 0.2);
  const box = { width: size, height: size, borderRadius: radius };
  const picture =
    url && !failed ? (
      <Image
        source={{ uri: url }}
        style={box}
        onError={() => setFailed(true)}
      />
    ) : (
      <View style={[box, styles.initial]}>
        <Text style={[styles.initialText, { fontSize: size * 0.42 }]}>
          {initial(name)}
        </Text>
      </View>
    );
  if (!frame) return picture;
  return (
    <View
      style={[
        styles.frame,
        {
          borderColor: frame,
          borderRadius: radius + 4,
          boxShadow: glow ? `0 0 14px ${frame}` : undefined,
        },
      ]}
    >
      {picture}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderWidth: 2, padding: 2 },
  initial: {
    alignItems: 'center',
    justifyContent: 'center',
    experimental_backgroundImage:
      'linear-gradient(135deg, #3a4b60 0%, #253140 100%)',
  },
  initialText: { color: colors.text, fontWeight: '700' },
});
