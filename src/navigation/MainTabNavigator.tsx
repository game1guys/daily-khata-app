import React, { useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureFcmToken } from '../notifications/fcm';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ListOrdered, PieChart, FileText, User, Plus } from 'lucide-react-native';
import type { NavigationProp } from '@react-navigation/native';
import type { MainTabParamList, RootStackParamList } from '../../App';
import { theme } from '../theme/colors';

import RecordsScreen from '../screens/RecordsScreen';
import ChartScreen from '../screens/ChartScreen';
import ReportsScreen from '../screens/ReportsScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

function YellowTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 10);
  const stackNav = navigation.getParent() as NavigationProp<RootStackParamList> | undefined;

  const renderTab = (index: number) => {
    const route = state.routes[index];
    const { options } = descriptors[route.key];
    const label =
      options.tabBarLabel !== undefined
        ? String(options.tabBarLabel)
        : options.title !== undefined
          ? options.title
          : route.name;
    const isFocused = state.index === index;
    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };
    const color = isFocused ? theme.black : theme.textMuted;
    const icon =
      route.name === 'Records' ? (
        <ListOrdered color={color} size={22} strokeWidth={isFocused ? 2.5 : 2} />
      ) : route.name === 'Chart' ? (
        <PieChart color={color} size={22} strokeWidth={isFocused ? 2.5 : 2} />
      ) : route.name === 'Reports' ? (
        <FileText color={color} size={22} strokeWidth={isFocused ? 2.5 : 2} />
      ) : (
        <User color={color} size={22} strokeWidth={isFocused ? 2.5 : 2} />
      );
    return (
      <TouchableOpacity
        key={route.key}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        onPress={onPress}
        style={styles.tabItem}
        activeOpacity={0.85}
      >
        {icon}
        <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.tabWrap, { paddingBottom: bottom }]}>
      <View style={styles.tabRow}>
        {renderTab(0)}
        {renderTab(1)}
        <View style={styles.fabGap} />
        {renderTab(2)}
        {renderTab(3)}
      </View>

      <TouchableOpacity
        style={[styles.fab, { bottom: bottom + 18 }]}
        activeOpacity={0.9}
        onPress={() => stackNav?.navigate('AddTransaction', { type: 'expense' })}
      >
        <Plus color={theme.black} size={30} strokeWidth={2.5} />
      </TouchableOpacity>
    </View>
  );
}

export default function MainTabNavigator() {
  // Second chance: login runs ensureFcmToken very early; Firebase/FCM is sometimes ready only after Main is shown.
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const session = await AsyncStorage.getItem('khata_session');
        if (!session || cancelled) return;
        await ensureFcmToken(session);
      } catch {
        // ensureFcmToken logs internally
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, []);

  return (
    <Tab.Navigator
      tabBar={(props) => <YellowTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Records"
        component={RecordsScreen}
        options={{ tabBarLabel: 'Records' }}
      />
      <Tab.Screen name="Chart" component={ChartScreen} options={{ tabBarLabel: 'Chart' }} />
      <Tab.Screen name="Reports" component={ReportsScreen} options={{ tabBarLabel: 'Reports' }} />
      <Tab.Screen name="Me" component={ProfileScreen} options={{ tabBarLabel: 'Me' }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabWrap: {
    backgroundColor: theme.white,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 12 },
    }),
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 10,
    minHeight: 56,
  },
  fabGap: {
    width: 64,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: theme.textMuted,
  },
  tabLabelActive: {
    color: theme.black,
    fontWeight: '800',
  },
  fab: {
    position: 'absolute',
    alignSelf: 'center', // This centers the FAB horizontally
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: theme.white,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3, // Slightly increased shadow opacity for better visibility
        shadowRadius: 8,
      },
      android: {
        elevation: 12, // Increased elevation to ensure it sits above the tab bar shadow
      },
    }),
  },
});
