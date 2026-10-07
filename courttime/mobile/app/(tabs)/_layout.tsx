/**
 * Tab Navigation Layout
 * Bottom tab bar with player-facing screens
 */

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, useNavigation, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily, FontSize, Gradients, Spacing, TouchTarget } from '../../src/constants/theme';
import { HeaderFacilitySelector } from '../../src/components/HeaderFacilitySelector';
import { NotificationBell } from '../../src/components/NotificationBell';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { useAuth } from '../../src/contexts/AuthContext';
import { MessageUnreadProvider, useMessageUnread } from '../../src/contexts/MessageUnreadContext';
import { useFeatureFlags } from '../../src/contexts/FeatureFlagContext';
import { shouldShowMoreTab } from '../../src/utils/moreMenu';

export const ErrorBoundary = createRouteErrorBoundary('Tabs');

/** iOS stack back label for screens pushed above the tab group (e.g. Payments). */
const TAB_BACK_TITLES: Record<string, string> = {
  index: 'Home',
  book: 'Book',
  community: 'Community',
  messages: 'Messages',
  more: 'More',
  profile: 'Profile',
  admin: 'Admin',
};

function useTabsStackBackTitle() {
  const navigation = useNavigation();
  const segments: string[] = useSegments();
  const tabKey = segments[0] === '(tabs)' ? (segments[1] ?? 'index') : 'index';

  useEffect(() => {
    const title = TAB_BACK_TITLES[tabKey] ?? 'Home';
    navigation.getParent()?.setOptions({ title });
  }, [navigation, tabKey]);
}

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
  useTabsStackBackTitle();
  const insets = useSafeAreaInsets();
  const { user, facilityId } = useAuth();
  const { hasUnreadMessages } = useMessageUnread();
  const isAdmin = user?.adminFacilities?.includes(facilityId || '') || false;
  const { isFeatureEnabled } = useFeatureFlags();
  // Always true — Community lives under More with no flag of its own.
  const showMore = shouldShowMoreTab(isFeatureEnabled);

  const screenOptions = useMemo(
    () => ({
      sceneStyle: { backgroundColor: Colors.background },
      tabBarActiveTintColor: Colors.chromeAccent,
      tabBarInactiveTintColor: Colors.chromeTextMuted,
      freezeOnBlur: false,
      tabBarBackground: () => (
        <View style={StyleSheet.absoluteFill}>
          <LinearGradient
            colors={[...Gradients.chrome]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
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
      headerBackground: () => (
        <LinearGradient
          colors={[...Gradients.chrome]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ),
      headerStyle: styles.header,
      headerTintColor: Colors.chromeText,
      headerTitleStyle: styles.headerTitle,
      /** Centered club-name chip; the tab headers have no side buttons, so the title slot still spans nearly the full bar */
      headerTitleAlign: 'center' as const,
      headerTitleContainerStyle: styles.headerTitleContainer,
      /** Side slots size to content (bell on the right, an equal spacer on the left) so the title slot stays centred */
      headerLeftContainerStyle: styles.headerSideContainer,
      headerRightContainerStyle: styles.headerSideContainer,
      headerLeft: () => <View style={styles.headerSpacer} />,
      headerRight: () => <NotificationBell />,
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
          href: null,
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
        name="more"
        options={{
          title: 'More',
          href: showMore ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="apps" size={size} color={color} />,
          headerTitle: () => <HeaderFacilitySelector fallbackTitle="More" />,
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
    backgroundColor: 'transparent',
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
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    maxWidth: '100%',
  },
  headerSideContainer: {
    flexGrow: 0,
    flexBasis: 'auto',
  },
  headerSpacer: {
    width: TouchTarget.min,
  },
});
