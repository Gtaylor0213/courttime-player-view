/**
 * Tab Navigation Layout
 * Bottom tab bar with player-facing screens
 */

import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily } from '../../src/constants/theme';
import { HeaderFacilitySelector } from '../../src/components/HeaderFacilitySelector';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';

export const ErrorBoundary = createRouteErrorBoundary('Tabs');

/**
 * Bottom tabs call `tabBarButton` as `button(props)` (a plain function).
 * `React.forwardRef` returns an object, which crashes with "button is not a function".
 */
function renderNavTabButton(props: Record<string, unknown>) {
  const { children, onPress, onLongPress, style, accessibilityRole, accessibilityState, testID, ref } =
    props;
  return (
    <TouchableOpacity
      ref={ref as never}
      activeOpacity={0.75}
      style={style as never}
      onPress={onPress as never}
      onLongPress={onLongPress as never}
      accessibilityRole={(accessibilityRole as never) ?? 'button'}
      accessibilityState={accessibilityState as never}
      testID={testID as never}
      hitSlop={{ top: 10, bottom: 14, left: 6, right: 6 }}
      collapsable={false}
    >
      {children as React.ReactNode}
    </TouchableOpacity>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  const screenOptions = useMemo(
    () => ({
      sceneStyle: { backgroundColor: Colors.surface },
      tabBarActiveTintColor: Colors.primary,
      tabBarInactiveTintColor: Colors.textMuted,
      freezeOnBlur: false,
      // Do not set a fixed tabBar height — it can clip touch targets vs. safe area / font scale.
      tabBarStyle: [
        styles.tabBar,
        {
          paddingBottom: Math.max(insets.bottom, 10),
          paddingTop: 8,
        },
      ],
      tabBarLabelStyle: styles.tabLabel,
      headerStyle: styles.header,
      headerTintColor: Colors.text,
      headerTitleStyle: styles.headerTitle,
      tabBarButton: renderNavTabButton,
    }),
    [insets.bottom]
  );

  return (
    <Tabs initialRouteName="book" detachInactiveScreens={false} screenOptions={screenOptions}>
      <Tabs.Screen
        name="book"
        options={{
          title: 'Book',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
          headerTitle: () => <HeaderFacilitySelector fallbackTitle="Book a Court" />,
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Community',
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
          headerTitle: () => <HeaderFacilitySelector fallbackTitle="Community" />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
          headerTitle: () => <HeaderFacilitySelector fallbackTitle="CourtTime" />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color} />,
          headerTitle: () => <HeaderFacilitySelector fallbackTitle="Messages" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
          headerTitle: 'My Profile',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.card,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 24,
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: FontFamily.bold,
  },
  header: {
    backgroundColor: Colors.card,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  headerTitle: {
    color: Colors.text,
    fontFamily: FontFamily.bold,
    fontSize: 18,
  },
});
