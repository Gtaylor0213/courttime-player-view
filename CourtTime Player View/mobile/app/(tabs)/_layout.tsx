/**
 * Tab Navigation Layout
 * Bottom tab bar with player-facing screens only
 */

import { Tabs } from 'expo-router';
import { Text, StyleSheet } from 'react-native';
import { Colors } from '../../src/constants/theme';

// Simple text-based tab icons (replace with proper icons later)
function TabIcon({ name, color }: { name: string; color: string }) {
  const icons: Record<string, string> = {
    home: '\u2302',
    book: '\u{1F3BE}',
    messages: '\u2709',
    profile: '\u263A',
  };
  return <Text style={[styles.icon, { color }]}>{icons[name] || '?'}</Text>;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        headerStyle: styles.header,
        headerTintColor: Colors.textInverse,
        headerTitleStyle: styles.headerTitle,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <TabIcon name="home" color={color} />,
          headerTitle: 'CourtTime',
        }}
      />
      <Tabs.Screen
        name="book"
        options={{
          title: 'Book Court',
          tabBarIcon: ({ color }) => <TabIcon name="book" color={color} />,
          headerTitle: 'Book a Court',
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color }) => <TabIcon name="messages" color={color} />,
          headerTitle: 'Messages',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabIcon name="profile" color={color} />,
          headerTitle: 'My Profile',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.background,
    borderTopColor: Colors.border,
    paddingBottom: 4,
    height: 60,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  header: {
    backgroundColor: Colors.primary,
  },
  headerTitle: {
    color: Colors.textInverse,
    fontWeight: '700',
    fontSize: 18,
  },
  icon: {
    fontSize: 22,
  },
});
