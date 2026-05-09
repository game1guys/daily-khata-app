import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Vibration } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Lock, Delete, ShieldCheck } from 'lucide-react-native';
import { theme } from '../theme/colors';

type Props = {
  navigation: any;
  route: any;
};

export default function LockScreen({ navigation, route }: Props) {
  const [pin, setPin] = useState('');
  const [savedPin, setSavedPin] = useState<string | null>(null);
  const [mode, setMode] = useState<'verify' | 'setup' | 'confirm'>('verify');
  const [setupPin, setSetupPin] = useState('');
  const [error, setError] = useState('');

  const isSetup = route.params?.mode === 'setup';

  useEffect(() => {
    if (isSetup) {
      setMode('setup');
    } else {
      AsyncStorage.getItem('app_pin').then(val => {
        setSavedPin(val);
        if (!val) {
          // If no PIN but lock enabled (shouldn't happen but fallback)
          navigation.replace('Main');
        }
      });
    }
  }, [isSetup]);

  const onNumberPress = (num: number) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      setError('');

      if (newPin.length === 4) {
        handleComplete(newPin);
      }
    }
  };

  const onDelete = () => {
    setPin(pin.slice(0, -1));
  };

  const handleComplete = async (finalPin: string) => {
    if (mode === 'setup') {
      setSetupPin(finalPin);
      setPin('');
      setMode('confirm');
    } else if (mode === 'confirm') {
      if (finalPin === setupPin) {
        await AsyncStorage.setItem('app_pin', finalPin);
        await AsyncStorage.setItem('app_lock_enabled', 'true');
        navigation.goBack();
      } else {
        setPin('');
        setError('PINs do not match. Try again.');
        Vibration.vibrate(200);
      }
    } else if (mode === 'verify') {
      if (finalPin === savedPin) {
        navigation.replace('Main');
      } else {
        setPin('');
        setError('Incorrect PIN');
        Vibration.vibrate(400);
      }
    }
  };

  const renderDots = () => {
    return (
      <View style={styles.dotsContainer}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              pin.length >= i && styles.dotActive,
              error ? styles.dotError : null
            ]}
          />
        ))}
      </View>
    );
  };

  const renderKeypad = () => {
    const rows = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];

    return (
      <View style={styles.keypad}>
        {rows.map((row, i) => (
          <View key={i} style={styles.keypadRow}>
            {row.map((num) => (
              <TouchableOpacity
                key={num}
                style={styles.key}
                onPress={() => onNumberPress(num)}
              >
                <Text style={styles.keyText}>{num}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
        <View style={styles.keypadRow}>
          <View style={styles.keyEmpty} />
          <TouchableOpacity style={styles.key} onPress={() => onNumberPress(0)}>
            <Text style={styles.keyText}>0</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.key} onPress={onDelete}>
            <Delete size={24} color={theme.black} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          {mode === 'verify' ? <Lock size={32} color={theme.black} /> : <ShieldCheck size={32} color={theme.black} />}
        </View>
        <Text style={styles.title}>
          {mode === 'setup' ? 'Set App PIN' : mode === 'confirm' ? 'Confirm PIN' : 'Enter PIN'}
        </Text>
        <Text style={styles.subtitle}>
          {mode === 'setup' ? 'Choose a 4-digit PIN for security' : mode === 'confirm' ? 'Enter the same PIN again' : 'Please verify your identity'}
        </Text>
      </View>

      <View style={styles.content}>
        {renderDots()}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      {renderKeypad()}

      {mode === 'verify' && (
        <TouchableOpacity style={styles.forgotBtn} onPress={() => navigation.replace('Login')}>
          <Text style={styles.forgotTxt}>Forgot PIN? Sign in again</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.yellow, alignItems: 'center' },
  header: { alignItems: 'center', marginTop: 60, marginBottom: 40 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '900', color: theme.black, marginBottom: 8 },
  subtitle: { fontSize: 14, fontWeight: '600', color: theme.textMuted },
  
  content: { height: 100, justifyContent: 'center', alignItems: 'center' },
  dotsContainer: { flexDirection: 'row', gap: 24 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(0,0,0,0.2)' },
  dotActive: { backgroundColor: theme.black, borderColor: theme.black },
  dotError: { borderColor: '#ef4444' },
  errorText: { marginTop: 16, color: '#ef4444', fontWeight: '700', fontSize: 14 },

  keypad: { paddingHorizontal: 40, gap: 20, width: '100%', marginBottom: 40 },
  keypadRow: { flexDirection: 'row', justifyContent: 'space-between' },
  key: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' },
  keyEmpty: { width: 72, height: 72 },
  keyText: { fontSize: 28, fontWeight: '800', color: theme.black },

  forgotBtn: { padding: 20 },
  forgotTxt: { fontSize: 14, fontWeight: '700', color: theme.textMuted, textDecorationLine: 'underline' },
});
