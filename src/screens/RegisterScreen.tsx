import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Mail, Lock, User, Phone, ArrowRight } from 'lucide-react-native';
import { API_URL } from '../config/api';
import { cacheMeFromLoginSession } from '../utils/profileCache';
import { configureGoogleSignIn, getGoogleIdToken, isGoogleSignInCancelled } from '../auth/googleSignIn';
import { AuthFormScroll } from '../components/KeyboardSafeViews';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Register'>;
};

export default function RegisterScreen({ navigation }: Props) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    configureGoogleSignIn();
  }, []);

  const handleRegister = async () => {
    if (!fullName || !email || !password || !phone) {
      setError('Please populate all node parameters.');
      return;
    }
    try {
      setLoading(true);
      setError('');

      const response = await axios.post(`${API_URL}/auth/register`, {
        email,
        password,
        full_name: fullName,
        phone
      });

      // If registration bypasses to session generation or alerts success.
      // Usually requires user to verify email, or we just redirect them to Login to get token
      setLoading(false);
      navigation.replace('Login');

    } catch (err: any) {
      setLoading(false);
      setError(err.response?.data?.error || err.message || 'System Registration failed');
    }
  };

  const handleGoogleSignUp = async () => {
    try {
      setLoading(true);
      setError('');
      const idToken = await getGoogleIdToken();
      const response = await axios.post(`${API_URL}/auth/google`, { id_token: idToken });
      if (response.data?.session?.access_token) {
        await AsyncStorage.setItem('khata_session', response.data.session.access_token);
        await cacheMeFromLoginSession(response.data.session, response.data.profile);
        setLoading(false);
        navigation.replace('Main');
      } else {
        throw new Error('Invalid response from server.');
      }
    } catch (err: any) {
      setLoading(false);
      if (isGoogleSignInCancelled(err)) {
        return;
      }
      setError(err.response?.data?.error || err.message || 'Google sign-up failed');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <AuthFormScroll contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Image source={require('../../assets/logo.png')} style={styles.topLogo} resizeMode="contain" />
            <Text style={styles.subtitle}>Provision a New Active Node.</Text>
          </View>

          <View style={styles.card}>
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.inputWrapper}>
              <User color="#94a3b8" size={20} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Full Entity Name"
                placeholderTextColor="#94a3b8"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputWrapper}>
              <Phone color="#94a3b8" size={20} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Secure Phone Terminal"
                placeholderTextColor="#94a3b8"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputWrapper}>
              <Mail color="#94a3b8" size={20} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Authentication Email"
                placeholderTextColor="#94a3b8"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputWrapper}>
              <Lock color="#94a3b8" size={20} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Access Password"
                placeholderTextColor="#94a3b8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={styles.buttonContent}>
                  <Text style={styles.buttonText}>Provision Device</Text>
                  <ArrowRight color="#fff" size={18} />
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleSignUp}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Text style={styles.googleButtonText}>Sign up with Google</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.linkButton} onPress={() => navigation.navigate('Login')}>
              <Text style={styles.linkText}>Already Registered? <Text style={styles.linkTextBold}>Authenticate</Text></Text>
            </TouchableOpacity>
          </View>
      </AuthFormScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 120,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 20,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  topLogo: {
    width: 200,
    height: 120,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    padding: 30,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    shadowColor: '#94a3b8',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 35,
    elevation: 8,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    marginBottom: 20,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center'
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 20,
    height: 60,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    height: '100%',
  },
  button: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 5,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginRight: 8,
  },
  linkButton: {
    marginTop: 24,
    alignItems: 'center',
    paddingVertical: 10,
  },
  linkText: {
    color: '#64748b',
    fontSize: 15,
    fontWeight: '600',
  },
  linkTextBold: {
    color: '#0f172a',
    fontWeight: '900',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 6,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0',
  },
  dividerText: {
    marginHorizontal: 14,
    fontSize: 13,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  googleButton: {
    marginTop: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  googleButtonText: {
    color: '#334155',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
