import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Mail, Lock, ArrowRight, ArrowLeft, ShieldCheck } from 'lucide-react-native';
import { API_URL } from '../config/api';
import type { RootStackParamList } from '../../App';
import { AuthFormScroll } from '../components/KeyboardSafeViews';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ForgotPassword'>;
};

type Step = 'email' | 'otp' | 'password';

const SEND_OTP_TIMEOUT_MS = 75_000;
const RESET_TIMEOUT_MS = 45_000;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const otpRef = useRef<TextInput>(null);
  const newPassRef = useRef<TextInput>(null);
  const confirmPassRef = useRef<TextInput>(null);

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const handleSendOtp = async () => {
    clearMessages();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError('Please enter your email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      await axios.post(
        `${API_URL}/auth/forgot-password/send-otp`,
        { email: trimmed },
        {
          timeout: SEND_OTP_TIMEOUT_MS,
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        },
      );
      setSuccess('OTP sent. Check your inbox and spam folder.');
      setStep('otp');
      setTimeout(() => otpRef.current?.focus(), 300);
    } catch (err: any) {
      const data = err.response?.data;
      const fromServer =
        typeof data === 'string' && data.trim()
          ? data.replace(/<[^>]+>/g, '').trim().slice(0, 240)
          : data?.error != null
            ? String(data.error)
            : data?.message != null
              ? String(data.message)
              : null;
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('Request timed out. Check connection or try again in a minute.');
      } else if (fromServer) {
        setError(fromServer);
      } else if (!err.response) {
        setError('Could not reach the server.');
      } else {
        setError(
          `Failed to send OTP email. Please try again.${err.response?.status ? ` (${err.response.status})` : ''}`,
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = () => {
    clearMessages();
    if (!otp.trim()) {
      setError('Enter the OTP from your email.');
      return;
    }
    const digits = otp.trim();
    if (digits.length < 6 || digits.length > 12) {
      setError('Enter the full code from your email (6–8 digits).');
      return;
    }
    setStep('password');
    setTimeout(() => newPassRef.current?.focus(), 300);
  };

  const handleResetPassword = async () => {
    clearMessages();
    if (!newPassword) {
      setError('Enter a new password.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await axios.post(
        `${API_URL}/auth/forgot-password/reset`,
        {
          email: email.trim().toLowerCase(),
          otp: otp.trim(),
          newPassword,
        },
        {
          timeout: RESET_TIMEOUT_MS,
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        },
      );
      setSuccess('Password reset. You can sign in now.');
      setTimeout(() => navigation.replace('Login'), 1800);
    } catch (err: any) {
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('Request timed out. Try again.');
      } else {
        setError(err.response?.data?.error || 'Reset failed. Try again.');
      }
      if (err.response?.data?.error?.toLowerCase?.().includes('otp')) {
        setStep('otp');
      }
    } finally {
      setLoading(false);
    }
  };

  const stepTitles: Record<Step, string> = {
    email: 'Forgot password',
    otp: 'Enter OTP',
    password: 'New password',
  };

  const stepSubtitles: Record<Step, string> = {
    email: 'We will email you a verification code (often 6–8 digits).',
    otp: `Code sent to ${email}`,
    password: 'Choose a strong password.',
  };

  return (
    <SafeAreaView style={styles.container}>
      <AuthFormScroll contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Image source={require('../../assets/logo.png')} style={styles.topLogo} resizeMode="contain" />
        </View>

        <View style={styles.card}>
          <View style={styles.stepRow}>
            {(['email', 'otp', 'password'] as Step[]).map((s, i) => (
              <View key={s} style={styles.stepItem}>
                <View
                  style={[
                    styles.stepDot,
                    step === s && styles.stepDotActive,
                    stepIndex(step) > stepIndex(s) && styles.stepDotDone,
                  ]}
                >
                  <Text
                    style={[
                      styles.stepDotTxt,
                      (step === s || stepIndex(step) > stepIndex(s)) && styles.stepDotTxtActive,
                    ]}
                  >
                    {i + 1}
                  </Text>
                </View>
                {i < 2 && (
                  <View style={[styles.stepLine, stepIndex(step) > stepIndex(s) && styles.stepLineDone]} />
                )}
              </View>
            ))}
          </View>

          <Text style={styles.title}>{stepTitles[step]}</Text>
          <Text style={styles.subtitle}>{stepSubtitles[step]}</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {success ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>{success}</Text>
            </View>
          ) : null}

          {step === 'email' && (
            <>
              <View style={styles.inputWrapper}>
                <Mail color="#94a3b8" size={20} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="your@email.com"
                  placeholderTextColor="#94a3b8"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  returnKeyType="send"
                  onSubmitEditing={handleSendOtp}
                />
              </View>
              <TouchableOpacity style={styles.button} onPress={handleSendOtp} disabled={loading} activeOpacity={0.85}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <View style={styles.btnRow}>
                    <Text style={styles.buttonText}>Send OTP</Text>
                    <ArrowRight color="#fff" size={18} />
                  </View>
                )}
              </TouchableOpacity>
            </>
          )}

          {step === 'otp' && (
            <>
              <View style={styles.otpWrapper}>
                <ShieldCheck color="#94a3b8" size={20} style={styles.inputIcon} />
                <TextInput
                  ref={otpRef}
                  style={[styles.input, styles.otpInput]}
                  placeholder="Code from email"
                  placeholderTextColor="#94a3b8"
                  value={otp}
                  onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 12))}
                  keyboardType="number-pad"
                  maxLength={12}
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  returnKeyType="next"
                  onSubmitEditing={handleVerifyOtp}
                />
              </View>
              <TouchableOpacity style={styles.button} onPress={handleVerifyOtp} disabled={loading} activeOpacity={0.85}>
                <View style={styles.btnRow}>
                  <Text style={styles.buttonText}>Verify OTP</Text>
                  <ArrowRight color="#fff" size={18} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.resendBtn}
                onPress={() => {
                  setStep('email');
                  setOtp('');
                  clearMessages();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.resendTxt}>
                  Did not receive? <Text style={styles.resendBold}>Resend OTP</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'password' && (
            <>
              <View style={styles.inputWrapper}>
                <Lock color="#94a3b8" size={20} style={styles.inputIcon} />
                <TextInput
                  ref={newPassRef}
                  style={styles.input}
                  placeholder="New password (min 8 characters)"
                  placeholderTextColor="#94a3b8"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  returnKeyType="next"
                  onSubmitEditing={() => confirmPassRef.current?.focus()}
                />
              </View>
              <View style={styles.inputWrapper}>
                <Lock color="#94a3b8" size={20} style={styles.inputIcon} />
                <TextInput
                  ref={confirmPassRef}
                  style={styles.input}
                  placeholder="Confirm password"
                  placeholderTextColor="#94a3b8"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  returnKeyType="send"
                  onSubmitEditing={handleResetPassword}
                />
              </View>
              <TouchableOpacity style={styles.button} onPress={handleResetPassword} disabled={loading} activeOpacity={0.85}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <View style={styles.btnRow}>
                    <Text style={styles.buttonText}>Reset password</Text>
                    <ArrowRight color="#fff" size={18} />
                  </View>
                )}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('Login')} activeOpacity={0.7}>
            <ArrowLeft size={16} color="#64748b" />
            <Text style={styles.backTxt}>Back to login</Text>
          </TouchableOpacity>
        </View>
      </AuthFormScroll>
    </SafeAreaView>
  );
}

function stepIndex(s: Step): number {
  const order: Step[] = ['email', 'otp', 'password'];
  return order.indexOf(s);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 80,
  },
  header: { alignItems: 'center', marginBottom: 24 },
  topLogo: { width: 160, height: 96 },
  card: {
    backgroundColor: '#ffffff',
    padding: 28,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.8)',
    maxWidth: 480,
    alignSelf: 'center',
    width: '100%',
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  stepItem: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDotActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  stepDotDone: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  stepDotTxt: { fontSize: 13, fontWeight: '800', color: '#94a3b8' },
  stepDotTxtActive: { color: '#ffffff' },
  stepLine: { width: 36, height: 2, backgroundColor: '#e2e8f0', marginHorizontal: 4 },
  stepLineDone: { backgroundColor: '#22c55e' },
  title: { fontSize: 22, fontWeight: '900', color: '#0f172a', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#64748b', marginBottom: 16, fontWeight: '500' },
  errorBox: {
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    marginBottom: 14,
  },
  errorText: { color: '#dc2626', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  successBox: {
    backgroundColor: '#f0fdf4',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    marginBottom: 14,
  },
  successText: { color: '#15803d', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 14,
    height: 56,
  },
  otpWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#0f172a',
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 14,
    height: 60,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 16, fontWeight: '600', color: '#0f172a', height: '100%' },
  otpInput: { fontSize: 22, fontWeight: '800', letterSpacing: 4, textAlign: 'center' },
  button: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  resendBtn: { alignItems: 'center', paddingVertical: 12 },
  resendTxt: { color: '#64748b', fontSize: 14, fontWeight: '600' },
  resendBold: { color: '#0f172a', fontWeight: '900' },
  backBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 },
  backTxt: { color: '#64748b', fontSize: 14, fontWeight: '600' },
});
