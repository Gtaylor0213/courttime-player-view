/**
 * Login Screen
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Pressable,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../../src/constants/theme';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';

export const ErrorBoundary = createRouteErrorBoundary('Login');

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    setError('');
    setLoading(true);

    const result = await login(email.trim(), password);

    if (!result.success) {
      setError(result.error || 'Login failed');
    }

    setLoading(false);
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <Image
                source={require('../../assets/splash-logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
                accessibilityLabel="CourtTime logo"
              />
              <Text style={styles.tagline}>Book courts with ease</Text>
            </View>

            <Card style={styles.formCard}>
              <View style={styles.form}>
                <Text style={styles.title}>Welcome to CourtTime</Text>
                <Text style={styles.subtitle}>Sign in to manage facilities and book courts</Text>

                {error ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Text style={styles.label}>Email</Text>
                <Input
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter your email"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  accessibilityLabel="Email address"
                />

                <View style={styles.passwordLabelRow}>
                  <Text style={styles.label}>Password</Text>
                  <Link href="/auth/forgot-password" style={styles.forgotLink}>
                    <Text style={styles.forgotText}>Forgot password?</Text>
                  </Link>
                </View>
                <View style={styles.passwordField}>
                  <Input
                    style={styles.passwordInput}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter your password"
                    secureTextEntry={!showPassword}
                    autoComplete="password"
                    accessibilityLabel="Password"
                  />
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    style={styles.eyeButton}
                    hitSlop={8}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={Colors.textMuted}
                    />
                  </Pressable>
                </View>

                <Button
                  style={styles.button}
                  title={loading ? 'Signing in...' : 'Sign In'}
                  onPress={handleLogin}
                  disabled={loading}
                />

                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>New to CourtTime?</Text>
                  <View style={styles.dividerLine} />
                </View>

                <Button
                  variant="secondary"
                  title="Create Player Account"
                  onPress={() => router.push('/auth/register')}
                />
                <Button
                  variant="secondary"
                  title="Register a Facility"
                  onPress={() => router.push('/auth/register-facility')}
                />
              </View>
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  logoImage: {
    width: 220,
    height: 56,
    marginBottom: Spacing.sm,
  },
  tagline: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
  },
  formCard: {
    padding: Spacing.lg,
  },
  form: {
    gap: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: -Spacing.sm,
  },
  label: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
    marginTop: Spacing.xs,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  forgotLink: {},
  forgotText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    color: Colors.primary,
  },
  passwordField: {
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: Spacing.xxl,
  },
  eyeButton: {
    position: 'absolute',
    right: Spacing.md,
    height: '100%',
    justifyContent: 'center',
  },
  button: {
    marginTop: Spacing.md,
  },
  errorBox: {
    backgroundColor: Colors.error + '12',
    borderColor: Colors.error,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
  },
});
