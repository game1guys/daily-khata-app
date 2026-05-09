import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';

/**
 * Auth / full-screen forms:
 * - Android: ONLY ScrollView — matches windowSoftInputMode=adjustResize. No KeyboardAvoidingView (avoids resize fights).
 * - iOS: KeyboardAvoidingView + ScrollView + automatic insets.
 */
export function AuthFormScroll({
  children,
  contentContainerStyle,
}: {
  children: React.ReactNode;
  contentContainerStyle: StyleProp<ViewStyle>;
}) {
  const scroll = (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
    >
      {children}
    </ScrollView>
  );

  if (Platform.OS === 'android') {
    return scroll;
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      {scroll}
    </KeyboardAvoidingView>
  );
}

/**
 * Modal overlay: no KeyboardAvoidingView on Android (same reason as above).
 */
export function ModalKeyboardRoot({
  style,
  children,
}: {
  style: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  if (Platform.OS === 'android') {
    return <View style={style}>{children}</View>;
  }
  return (
    <KeyboardAvoidingView behavior="padding" style={style}>
      {children}
    </KeyboardAvoidingView>
  );
}
