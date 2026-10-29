/**
 * Tab Navigation Layout
 * Bottom tab bar with player-facing screens
 */

import React, { useEffect, useMemo } from 'react';
import { type ColorValue, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, useNavigation, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  ChromeMaxFontScale,
  Colors,
  FontFamily,
  FontSize,
  Gradients,
  Shadows,
  Spacing,
  TouchTarget,
} from '../../src/constants/theme';
import { HeaderFacilitySelector } from '../../src/components/HeaderFacilitySelector';
import { NotificationBell } from '../../src/components/NotificationBell';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { useAuth } from '../../src/contexts/AuthContext';
import { MessageUnreadProvider, useMessageUnread } from '../../src/contexts/MessageUnreadContext';
import { useFeatureFlags } from '../../src/contexts/FeatureFlagContext';
import { shouldShowMoreTab } from '../../src/utils/moreMenu';

export const ErrorBoundary = createRouteErrorBoundary('Tabs');

const TAB_BAR_PADDING_TOP = 10;
const TAB_LABEL_LINE_HEIGHT = 15;

/**
 * The tab navigator fixes the bar's height at 49 + the bottom inset unless a height is
 * given, and our padding comes out of that. Without an explicit height the labels were
 * pushed into the Android navigation bar, under its translucent scrim.
 */
function tabBarHeight(insetBottom: number, fontScale: number): number {
  const labelHeight = Math.ceil(TAB_LABEL_LINE_HEIGHT * Math.min(fontScale, ChromeMaxFontScale));
  // The navigator's tab item: 5pt padding above and below a 28pt icon slot.
  const content = 5 + 28 + labelHeight + 5;
  return TAB_BAR_PADDING_TOP + content + Math.max(insetBottom, 12);
}

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
  const { fontScale } = useWindowDimensions();
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
      // Height follows the safe area and the (capped) font scale; see tabBarHeight.
      tabBarStyle: [
        styles.tabBar,
        {
          height: tabBarHeight(insets.bottom, fontScale),
          paddingBottom: Math.max(insets.bottom, 12),
          paddingTop: TAB_BAR_PADDING_TOP,
          backgroundColor: 'transparent',
        },
      ],
      tabBarLabel: ({ color, children }: { color: ColorValue; children: string }) => (
        // Six labels on a narrow phone: shrink to fit rather than show "Mes…".
        <Text
          style={[styles.tabLabel, { color }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          maxFontSizeMultiplier={ChromeMaxFontScale}
        >
          {children}
        </Text>
      ),
      headerStyle: styles.header,
      headerTintColor: Colors.headerText,
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
    [insets.bottom, fontScale]
  );

  return (
    <>
      <StatusBar style="dark" />
      <Tabs initialRouteName="index" detachInactiveScreens={false} screenOptions={screenOptions}>
      <Tabs.Screen
        name="book"
        options={{
          title: 'Book',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
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
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
          headerTitle: () => <HeaderFacilitySelector fallbackTitle="CourtTime" />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size }) => (
            <View style={styles.tabIconWrap}>
              <Ionicons name="chatbubbles-outline" size={size} color={color} />
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
          tabBarIcon: ({ color, size }) => <Ionicons name="apps-outline" size={size} color={color} />,
          headerTitle: () => <HeaderFacilitySelector fallbackTitle="More" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
          headerTitle: 'My Profile',
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark-outline" size={size} color={color} />,
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
    // web shadow-md, cast upward
    ...Shadows.md,
    shadowOffset: { width: 0, height: -Shadows.md.shadowOffset.height },
    elevation: 12,
  },
  // 11px: one step under the web's smallest text so six tab labels still fit a small phone.
  tabLabel: {
    fontSize: 11,
    lineHeight: TAB_LABEL_LINE_HEIGHT,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
    alignSelf: 'stretch',
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
    backgroundColor: Colors.headerBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.headerBorder,
    shadowOpacity: 0,
    elevation: 0,
  },
  headerTitle: {
    color: Colors.headerText,
    fontFamily: FontFamily.semiBold,
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
