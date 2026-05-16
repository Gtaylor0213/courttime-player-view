/**
 * Tab Navigation Layout
 * Bottom tab bar with player-facing screens
 */

import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily, FontSize, Gradients, Spacing } from '../../src/constants/theme';
import { HeaderFacilitySelector } from '../../src/components/HeaderFacilitySelector';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { useAuth } from '../../src/contexts/AuthContext';
import { MessageUnreadProvider, useMessageUnread } from '../../src/contexts/MessageUnreadContext';

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
    >
      {children as React.ReactNode}
    </TouchableOpacity>
  );
}

function TabsShell() {
  const insets = useSafeAreaInsets();
  const { user, facilityId } = useAuth();
  const { hasUnreadMessages } = useMessageUnread();
  const isAdmin = user?.adminFacilities?.includes(facilityId || '') || false;

  const screenOptions = useMemo(
    () => ({
      sceneStyle: { backgroundColor: Colors.surface },
      tabBarActiveTintColor: Colors.chromeAccent,
      tabBarInactiveTintColor: Colors.chromeTextMuted,
      freezeOnBlur: false,
      tabBarBackground: () => (
        <View style={StyleSheet.absoluteFill}>
          <LinearGradient colors={[...Gradients.tabBar]} style={StyleSheet.absoluteFill} />
        </View>
      ),
      // Do not set a fixed tabBar height — it can clip touch targets vs. safe area / font scale.
      tabBarStyle: [
        styles.tabBar,
        {
          paddingBottom: Math.max(insets.bottom, 12),
          paddingTop: 10,
          backgroundColor: 'transparent',
        },
      ],
      tabBarLabelStyle: styles.tabLabel,
      headerStyle: styles.header,
      headerTintColor: Colors.chromeText,
      headerTitleStyle: styles.headerTitle,
      /** Left-aligned title uses most of the bar width so long club names are not clipped in a narrow center slot */
      headerTitleAlign: 'left' as const,
      headerTitleContainerStyle: styles.headerTitleContainer,
      tabBarButton: renderNavTabButton,
    }),
    [insets.bottom]
  );

  return (
    <>
      <StatusBar style="light" />
      <Tabs initialRouteName="index" detachInactiveScreens={false} screenOptions={screenOptions}>
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
          tabBarIcon: ({ color, size }) => (
            <View style={styles.tabIconWrap}>
              <Ionicons name="chatbubbles" size={size} color={color} />
              {hasUnreadMessages ? <View style={styles.messagesUnreadDot} /> : null}
            </View>
          ),
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
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark" size={size} color={color} />,
          headerTitle: 'Admin',
        }}
      />
    </Tabs>
    </>
  );
}

export default function TabLayout() {
  return (
    <MessageUnreadProvider>
      <TabsShell />
    </MessageUnreadProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.chromeChipBorder,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -8 },
    elevation: 20,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: FontFamily.semiBold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  tabIconWrap: {
    minWidth: 28,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesUnreadDot: {
    position: 'absolute',
    top: -1,
    right: -5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.error,
    borderWidth: 1.5,
    borderColor: Colors.chromeBackground,
  },
  header: {
    backgroundColor: Colors.chromeBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.chromeBorder,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  headerTitle: {
    color: Colors.chromeText,
    fontFamily: FontFamily.bold,
    fontSize: FontSize.md,
  },
  headerTitleContainer: {
    flexGrow: 1,
    flexShrink: 1,
    alignItems: 'flex-start',
    marginLeft: Spacing.sm,
    marginRight: Spacing.xs,
    maxWidth: '100%',
  },
});
