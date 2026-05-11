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
} from 'react-native';
import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Gradients, Spacing, FontSize, BorderRadius, FontFamily } from '../../src/constants/theme';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';

export const ErrorBoundary = createRouteErrorBoundary('Login');

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      <StatusBar style="light" />
      <LinearGradient colors={[...Gradients.login]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.blob, styles.blob1]} />
      <View style={[styles.blob, styles.blob2]} />
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
              <View style={styles.logoCard}>
                <Image
                  source={require('../../assets/splash-logo.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                  accessibilityLabel="CourtTime logo"
                />
              </View>
              <Text style={styles.tagline}>Book courts · Find partners · Play better</Text>
            </View>

            <Card style={styles.formCard}>
            <View style={styles.form}>
              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Text style={styles.label}>Email</Text>
              <Input
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                accessibilityLabel="Email address"
              />

              <Text style={styles.label}>Password</Text>
              <Input
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry
                autoComplete="password"
                accessibilityLabel="Password"
              />

              <Button
                style={styles.button}
                title={loading ? 'Signing in...' : 'Sign In'}
                onPress={handleLogin}
                disabled={loading}
              />

              <Link href="/auth/forgot-password" style={styles.forgotLink}>
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </Link>

              <View style={styles.footer}>
                <Text style={styles.footerText}>Don't have an account? </Text>
                <Link href="/auth/register" style={styles.link}>
                  <Text style={styles.linkText}>Sign Up</Text>
                </Link>
              </View>
            </View>
          </Card>

          <View style={styles.adminNote}>
            <Text style={styles.adminNoteText}>
              Admin features are available on the web app.
            </Text>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#022018',
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.35,
  },
  blob1: {
    width: 280,
    height: 280,
    backgroundColor: '#4FFFB0',
    top: -80,
    right: -100,
  },
  blob2: {
    width: 220,
    height: 220,
    backgroundColor: '#0EA5E9',
    bottom: 120,
    left: -90,
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
  logoCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
    marginBottom: Spacing.md,
  },
  logoImage: {
    width: 220,
    height: 56,
  },
  tagline: {
    fontSize: FontSize.md,
    color: 'rgba(255,255,255,0.92)',
    fontFamily: FontFamily.medium,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  formCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.98)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    elevation: 16,
  },
  form: {
    gap: Spacing.md,
  },
  label: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
    marginTop: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.inputBackground,
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
  forgotLink: {
    alignSelf: 'center',
    marginTop: Spacing.md,
  },
  forgotText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.lg,
  },
  footerText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
  },
  link: {},
  linkText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
  },
  adminNote: {
    alignItems: 'center',
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.25)',
  },
  adminNoteText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
  },
});
