import React, { useEffect } from 'react';
import { AppState, Platform, PermissionsAndroid } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import messaging from '@react-native-firebase/messaging';
import { AlertProvider } from './src/context/AlertContext';

import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import AddTransactionScreen from './src/screens/AddTransactionScreen';
import UpgradePlanScreen from './src/screens/UpgradePlanScreen';
import LockScreen from './src/screens/LockScreen';
import MainTabNavigator from './src/navigation/MainTabNavigator';
import { theme } from './src/theme/colors';
import { syncDailyExpenseReminder } from './src/reminders/dailyExpenseReminder';

export type MainTabParamList = {
  Records: undefined;
  Chart: undefined;
  Reports: undefined;
  Me: undefined;
};

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  Main: undefined;
  AddTransaction: { type: 'income' | 'expense'; transactionId?: string };
  UpgradePlan: undefined;
  Lock: { mode?: 'verify' | 'setup' };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  useEffect(() => {
    const requestNotificationPermission = async () => {
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
          );
          console.log('Notification Permission:', granted);
        } catch (err) {
          console.warn(err);
        }
      }
      
      // For iOS and general Firebase setup
      /*
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        console.log('Authorization status:', authStatus);
      }
      */
    };

    requestNotificationPermission();
    syncDailyExpenseReminder().catch(() => {});
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        syncDailyExpenseReminder().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <AlertProvider>
        <NavigationContainer>
          <Stack.Navigator initialRouteName="Splash" screenOptions={{ headerShown: false, animation: 'fade' }}>
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="Main" component={MainTabNavigator} />
            <Stack.Screen name="Lock" component={LockScreen} />
            <Stack.Screen
              name="AddTransaction"
              component={AddTransactionScreen}
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="UpgradePlan"
              component={UpgradePlanScreen}
              options={{
                presentation: 'modal',
                animation: 'slide_from_bottom',
                headerShown: true,
                title: 'Upgrade',
                headerStyle: { backgroundColor: theme.yellow },
                headerTintColor: '#000',
                headerTitleStyle: { fontWeight: '800' },
              }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </AlertProvider>
    </SafeAreaProvider>
  );
}
