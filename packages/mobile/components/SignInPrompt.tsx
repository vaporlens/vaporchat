import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { GradientButton } from './GradientButton';

/** In place of what needs an account while signed out. */
export function SignInPrompt({
  message,
  onSignIn,
}: {
  message: string;
  onSignIn: () => void;
}) {
  return (
    <View style={styles.prompt}>
      <Ionicons name="lock-closed-outline" size={48} color={colors.muted} />
      <Text style={styles.message}>{message}</Text>
      <GradientButton title="Sign in" onPress={onSignIn} />
    </View>
  );
}

const styles = StyleSheet.create({
  prompt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 32,
  },
  message: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
});
