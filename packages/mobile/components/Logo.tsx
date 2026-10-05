import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { StyleSheet, Text, View } from 'react-native';
import { colors, gradients } from '../theme';

export function Logo() {
  return (
    <View style={styles.logo}>
      <View style={styles.tile}>
        <FontAwesome6 name="microscope" size={38} color="#fff" />
      </View>
      <Text style={styles.name}>Vaporlens</Text>
      <Text style={styles.tagline}>Steam, in your pocket</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { alignItems: 'center', gap: 6 },
  tile: {
    width: 80,
    height: 80,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    experimental_backgroundImage: gradients.primary,
    boxShadow: '0 8px 24px rgba(26, 159, 255, 0.35)',
  },
  name: {
    color: colors.bright,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tagline: { color: colors.muted, fontSize: 15 },
});
