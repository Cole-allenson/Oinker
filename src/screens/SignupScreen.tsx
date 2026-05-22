import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../constants/theme';
import { RootStackParamList } from '../navigation/types';
import { useUser } from '../context/UserContext';
import OinkerLogo from '../components/OinkerLogo';

type Props = NativeStackScreenProps<RootStackParamList, 'Signup'>;

type UserRole = 'driver' | 'eater' | null;

export default function SignupScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(false);
  const { signUp } = useUser();

  const handleSignup = async () => {
    if (!email || !password || !name || !role) {
      Alert.alert('Error', 'Please fill in all fields and select a role');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    const { error } = await signUp(email, password, name, role);
    setLoading(false);

    if (error) {
      Alert.alert('Signup Failed', error);
    } else {
      Alert.alert(
        'Check your email',
        'We sent you a confirmation link. Please verify your email to continue.',
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Login'),
          },
        ]
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <OinkerLogo size="large" />
          <Text style={styles.subtitle}>Join the pig pen</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Full Name"
            placeholderTextColor={theme.colors.textMuted}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={theme.colors.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={theme.colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Text style={styles.roleLabel}>I want to:</Text>
          <View style={styles.roleContainer}>
            <TouchableOpacity
              style={[
                styles.roleButton,
                role === 'driver' && [styles.roleButtonActive, { backgroundColor: theme.colors.driver + '20' }],
                { borderColor: role === 'driver' ? theme.colors.driver : theme.colors.border },
              ]}
              onPress={() => setRole('driver')}
            >
              {role === 'driver' && (
                <View style={styles.checkmark}>
                  <Text style={styles.checkmarkText}>✓</Text>
                </View>
              )}
              <Text style={[styles.roleIcon, { color: theme.colors.driver }]}>🚗</Text>
              <Text style={[styles.roleText, role === 'driver' && { color: theme.colors.driver }]}>
                Drive & Earn
              </Text>
              <Text style={styles.roleDescription}>Deliver food, set your own rates</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.roleButton,
                role === 'eater' && [styles.roleButtonActive, { backgroundColor: theme.colors.eater + '20' }],
                { borderColor: role === 'eater' ? theme.colors.eater : theme.colors.border },
              ]}
              onPress={() => setRole('eater')}
            >
              {role === 'eater' && (
                <View style={styles.checkmark}>
                  <Text style={styles.checkmarkText}>✓</Text>
                </View>
              )}
              <Text style={[styles.roleIcon, { color: theme.colors.eater }]}>🍔</Text>
              <Text style={[styles.roleText, role === 'eater' && { color: theme.colors.eater }]}>
                Order Food
              </Text>
              <Text style={styles.roleDescription}>Find local drivers near you</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, (!role || loading) && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={!role || loading}
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.text} />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkButton} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.linkText}>
              Already have an account? <Text style={styles.linkHighlight}>Log In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  logo: {
    fontSize: 42,
    fontWeight: '800',
    color: theme.colors.primary,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.sm,
  },
  form: {
    gap: theme.spacing.md,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    fontSize: 16,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  roleLabel: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginTop: theme.spacing.sm,
  },
  roleContainer: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  roleButton: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  roleButtonActive: {
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 3,
  },
  roleIcon: {
    fontSize: 32,
    marginBottom: theme.spacing.sm,
  },
  roleText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  roleDescription: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: theme.colors.success,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  linkButton: {
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  linkText: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  linkHighlight: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
});
