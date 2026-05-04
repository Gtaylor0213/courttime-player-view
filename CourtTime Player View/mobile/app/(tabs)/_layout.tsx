/**
 * Tab Navigation Layout
 * Bottom tab bar with player-facing screens
 */

import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, TouchTarget, FontFamily } from '../../src/constants/theme';
import { HeaderFacilitySelector } from '../../src/components/HeaderFacilitySelector';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';

export const ErrorBoundary = createRouteErrorBoundary('Tabs');

export default function TabLayout() {
  const router = useRouter();

  const makeTabButton =
    (tabName: string) =>
    ({ onPress, children, accessibilityState, ...rest }: any) => {
      const selected = Boolean(accessibilityState?.selected);
      return (
        <Pressable
          {...rest}
          accessibilityState={accessibilityState}
          style={({ pressed }) => [styles.tabButton, pressed && styles.tabButtonPressed]}
          onPress={(event) => {
            console.log(`[tabs] pressed ${tabName} (selected=${selected})`);
            onPress?.(event);
          }}
        >
          {children}
        </Pressable>
      );
    };

  return (
    <Tabs
      initialRouteName="book"
      screenOptions={{
        sceneStyle: { backgroundColor: Colors.surface },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        headerStyle: styles.header,
        headerTintColor: Colors.text,
        headerTitleStyle: styles.headerTitle,
      }}
    >
      <Tabs.Screen
        name="book"
        options={{
          title: 'Book',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
          tabBarButton: makeTabButton('book'),
          headerTitle: () => <HeaderFacilitySelector fallbackTitle="Book a Court" />,
        }}
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            console.log('[tabs] tabPress book');
            router.navigate('/(tabs)/book');
          },
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Community',
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
          tabBarButton: makeTabButton('community'),
          headerTitle: () => <HeaderFacilitySelector fallbackTitle="Community" />,
        }}
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            console.log('[tabs] tabPress community');
            router.navigate('/(tabs)/community');
          },
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
          tabBarButton: makeTabButton('index'),
          headerTitle: () => <HeaderFacilitySelector fallbackTitle="CourtTime" />,
        }}
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            console.log('[tabs] tabPress index');
            router.navigate('/(tabs)');
          },
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color} />,
          tabBarButton: makeTabButton('messages'),
          headerTitle: () => <HeaderFacilitySelector fallbackTitle="Messages" />,
        }}
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            console.log('[tabs] tabPress messages');
            router.navigate('/(tabs)/messages');
          },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
          tabBarButton: makeTabButton('profile'),
          headerTitle: 'My Profile',
        }}
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            console.log('[tabs] tabPress profile');
            router.navigate('/(tabs)/profile');
          },
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
    paddingBottom: 10,
    paddingTop: 8,
    height: 74,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 10,
  },
  tabButton: {
    flex: 1,
    minHeight: TouchTarget.min,
  },
  tabButtonPressed: {
    opacity: 0.85,
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
