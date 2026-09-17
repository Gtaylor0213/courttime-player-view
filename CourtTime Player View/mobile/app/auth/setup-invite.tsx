/**
 * Setup Invite
 * An invited member creates their account from the club's invite email.
 * Opened via deep link: courttime://auth/setup-invite?token=...
 *
 * Mirrors web's UserRegistration with ?setupToken=: the email is fixed to the
 * invitation, the last name is prefilled, and the account joins the inviting
 * facility on creation.
 */

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';

export const ErrorBoundary = createRouteErrorBoundary('Setup Invite');

interface InviteInfo {
  email: string;
  facilityId: string;
  facilityName: string;
  lastName?: string | null;
  address?: string | null;
}

export default function SetupInviteScreen() {
  const { register } = useAuth();
  const { token: rawToken } = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [validating, setValidating] = useState(true);
  const [inviteError, setInviteError] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setValidating(false);
      setInviteError('This invitation link is missing its token. Open the link from your email again.');
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await api.get(`/api/auth/setup-invite/${encodeURIComponent(token)}`);
      if (cancelled) return;
      setValidating(false);
      const data = res.data as Partial<InviteInfo> | undefined;
      if (res.success && data?.email && data.facilityId) {
        setInvite({
          email: data.email,
          facilityId: data.facilityId,
          facilityName: data.facilityName || 'your club',
          lastName: data.lastName ?? null,
          address: data.address ?? null,
        });
        if (data.lastName) setLastName(data.lastName);
      } else {
        setInviteError(res.error || 'This invitation has expired or is invalid. Ask your club to send a new one.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleCreate() {
    if (!invite || !token) return;
    if (!firstName.trim() || !lastName.trim() || !password.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setLoading(true);
    const result = await register({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: invite.email,
      password,
      phone: phone.trim() || undefined,
      setupToken: token,
    });
    if (!result.success) setError(result.error || 'Could not create your account.');
    setLoading(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.logo}>CourtTime</Text>
            <Text style={styles.subtitle}>{invite ? `Welcome to ${invite.facilityName}!` : 'Set up your account'}</Text>
          </View>

          <View style={styles.formCard}>
            {validating ? (
              <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.lg }} />
            ) : inviteError ? (
              <>
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{inviteError}</Text>
                </View>
                <Link href="/auth/login" style={styles.link}>
                  <Text style={styles.linkText}>Back to sign in</Text>
                </Link>
              </>
            ) : invite ? (
              <View style={styles.form}>
                <Text style={styles.intro}>
                  You are joining <Text style={styles.bold}>{invite.facilityName}</Text>. Complete the form below to create your account.
                </Text>
                {error ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Text style={styles.label}>Email</Text>
                <TextInput style={[styles.input, styles.inputLocked]} value={invite.email} editable={false} accessibilityLabel="Email (from your invitation)" />
                <Text style={styles.hint}>Set by your invitation and cannot be changed.</Text>

                <View style={styles.row}>
                  <View style={styles.halfField}>
                    <Text style={styles.label}>First Name *</Text>
                    <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="First" placeholderTextColor={Colors.textMuted} autoComplete="given-name" />
                  </View>
                  <View style={styles.halfField}>
                    <Text style={styles.label}>Last Name *</Text>
                    <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="Last" placeholderTextColor={Colors.textMuted} autoComplete="family-name" />
                  </View>
                </View>

                <Text style={styles.label}>Phone</Text>
                <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="(optional)" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" autoComplete="tel" />

                <Text style={styles.label}>Password *</Text>
                <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="At least 8 characters" placeholderTextColor={Colors.textMuted} secureTextEntry autoComplete="new-password" />
                <Text style={styles.label}>Confirm Password *</Text>
                <TextInput style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter password" placeholderTextColor={Colors.textMuted} secureTextEntry autoComplete="new-password" />

                <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={() => void handleCreate()} disabled={loading} accessibilityRole="button" accessibilityLabel="Create account">
                  <Text style={styles.buttonText}>{loading ? 'Creating Account…' : 'Create Account'}</Text>
                </TouchableOpacity>

                <Link href="/auth/login" style={styles.link}>
                  <Text style={styles.linkText}>Already have an account? Sign in</Text>
                </Link>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xl * 2 },
  header: { alignItems: 'center', marginVertical: Spacing.xl },
  logo: { fontSize: 32, fontWeight: '800', color: Colors.primary },
  subtitle: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.xs, textAlign: 'center' },
  formCard: { backgroundColor: Colors.card, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg },
  form: { gap: Spacing.xs },
  intro: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.sm },
  bold: { fontWeight: '700', color: Colors.text },
  label: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary, marginTop: Spacing.sm, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: FontSize.md, color: Colors.text, backgroundColor: Colors.surface },
  inputLocked: { color: Colors.textMuted },
  hint: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  row: { flexDirection: 'row', gap: Spacing.sm },
  halfField: { flex: 1 },
  button: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.lg },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: '700' },
  errorBox: { backgroundColor: Colors.error + '12', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  errorText: { color: Colors.error, fontSize: FontSize.sm },
  link: { alignSelf: 'center', marginTop: Spacing.md },
  linkText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '600' },
});
