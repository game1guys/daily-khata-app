import React, { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, ImageBackground, Dimensions } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from '../theme/colors';
import { getBiometricSessionToken } from '../auth/biometric';
import { ensureFcmToken, registerFcmRefreshListener } from '../notifications/fcm';

const { width, height } = Dimensions.get('window');

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Splash'>;
};

export default function SplashScreen({ navigation }: Props) {
  // --- OLD ANIMATION VALUES (COMMENTED) ---
  /*
  const scaleValue = useRef(new Animated.Value(0.6)).current;
  const opacityValue = useRef(new Animated.Value(0)).current;
  const slideUpValue = useRef(new Animated.Value(20)).current;
  const auraPulse = useRef(new Animated.Value(0.3)).current;
  */

  useEffect(() => {
    /*
    Animated.parallel([
      Animated.timing(scaleValue, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.timing(opacityValue, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideUpValue, {
        toValue: 0,
        duration: 900,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      })
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(auraPulse, {
          toValue: 0.6,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(auraPulse, {
          toValue: 0.3,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        })
      ])
    ).start();
    */

    const timer = setTimeout(async () => {
      try {
        let token = await AsyncStorage.getItem('khata_session');
        const lockEnabled = await AsyncStorage.getItem('app_lock_enabled');
        const biometricEnabled = await AsyncStorage.getItem('biometric_enabled');
        
        if (token) {
          if (lockEnabled === 'true') {
            // Prefer biometric unlock when enabled; fallback to PIN lock
            if (biometricEnabled === 'true') {
              const bioToken = await getBiometricSessionToken();
              if (bioToken) {
                token = bioToken;
                await AsyncStorage.setItem('khata_session', bioToken);
                // Fire-and-forget token sync
                ensureFcmToken(bioToken).catch(() => {});
                registerFcmRefreshListener(bioToken);
                navigation.replace('Main');
                return;
              }
            }
            navigation.replace('Lock', { mode: 'verify' });
          } else {
            ensureFcmToken(token).catch(() => {});
            registerFcmRefreshListener(token);
            navigation.replace('Main');
          }
        } else {
          navigation.replace('Login');
        }
      } catch {
        navigation.replace('Login');
      }
    }, 2800);

    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../assets/splash_bg.jpeg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={theme.white} style={styles.loader} />
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundImage: {
    width: width,
    height: height,
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 100,
  },
  loader: {
    marginBottom: 20,
  },
  // --- OLD STYLES (KEEPING FOR REFERENCE) ---
  /*
  auraWrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 350,
    height: 350,
    zIndex: 0,
  },
  auraBlob: {
    width: '100%',
    height: '100%',
    borderRadius: 175,
    opacity: 0.12,
  },
  logo: {
    width: 220,
    height: 220,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  */
});
