/**
 * HeaderFacilitySelector
 * Compact facility switcher rendered as the tab navigator's header title.
 * 0 facilities: static fallback title from parent.
 * 1 facility: static club name (no chevron).
 * 2+ facilities: tappable chip with logo, name, and facility picker modal.
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../constants/theme';
import { CachedImage } from './CachedImage';

interface Props {
  fallbackTitle: string;
}

export function HeaderFacilitySelector({ fallbackTitle }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const { facilityId, facilities, setFacilityId } = useAuth();
  const [open, setOpen] = useState(false);

  const currentFacility = facilities.find(f => f.id === facilityId);
  const facilityName =
    currentFacility?.name ?? (facilities.length > 0 ? facilities[0].name : 'Select Facility');

  useEffect(() => {
    if (!__DEV__) return;
    console.log(
      '[header] facilities=',
      facilities.map(f => ({ id: f.id, name: f.name, logoUrl: !!f.logoUrl })),
      'facilityId=',
      facilityId,
      'currentFacility=',
      currentFacility ? { id: currentFacility.id, name: currentFacility.name } : null
    );
  }, [facilities, facilityId, currentFacility]);

  if (facilities.length === 1) {
    const name = facilities[0].name;
    const n = name.length;
    return (
      <View style={styles.titleStaticWrap}>
        <Text
          style={[styles.titleStatic, n > 42 && styles.titleStaticSm, n > 58 && styles.titleStaticXs]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {name}
        </Text>
      </View>
    );
  }

  if (facilities.length === 0) {
    return (
      <View style={styles.titleStaticWrap}>
        <Text style={styles.titleStatic} numberOfLines={1} ellipsizeMode="tail">
          {fallbackTitle}
        </Text>
      </View>
    );
  }

  const nameLen = facilityName.length;
  const textStyles = [styles.buttonText, nameLen > 28 ? styles.buttonTextXs : styles.buttonTextSm];

  const chipMaxWidth = Math.max(160, Math.round(windowWidth - Spacing.sm - Spacing.xs));

  return (
    <>
      <TouchableOpacity
        style={[styles.button, { maxWidth: chipMaxWidth }]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Current club ${facilityName}. Tap to switch.`}
      >
        <View style={styles.logoSlot}>
          {currentFacility?.logoUrl ? (
            <CachedImage uri={currentFacility.logoUrl} style={styles.logo} />
          ) : (
            <View style={styles.logoFallback}>
              <Ionicons name="business-outline" size={14} color={Colors.chromeAccent} />
            </View>
          )}
        </View>
        <View style={styles.titleFlex}>
          <Text style={textStyles} numberOfLines={1} ellipsizeMode="tail">
            {facilityName}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={14} color={Colors.chromeTextMuted} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View style={styles.dropdown}>
            <Text style={styles.dropdownTitle}>Switch Facility</Text>
            <FlatList
              data={facilities}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.option, item.id === facilityId && styles.optionSelected]}
                  onPress={() => {
                    setFacilityId(item.id);
                    setOpen(false);
                  }}
                >
                  {item.logoUrl ? (
                    <CachedImage uri={item.logoUrl} style={styles.optionLogo} />
                  ) : (
                    <View style={styles.optionLogoFallback}>
                      <Ionicons name="business-outline" size={14} color={Colors.textSecondary} />
                    </View>
                  )}
                  <Text
                    style={[
                      styles.optionText,
                      item.id === facilityId && styles.optionTextSelected,
                    ]}
                  >
                    {item.name}
                  </Text>
                  {item.id === facilityId && (
                    <Ionicons name="checkmark" size={20} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  titleStaticWrap: {
    flex: 1,
    minWidth: 0,
    maxWidth: '100%',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  titleStatic: {
    color: Colors.chromeText,
    fontFamily: FontFamily.bold,
    fontSize: FontSize.sm,
    lineHeight: 17,
  },
  titleStaticSm: {
    fontSize: FontSize.sm,
    lineHeight: 17,
  },
  titleStaticXs: {
    fontSize: FontSize.xs,
    lineHeight: 15,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.chromeChipBg,
    borderWidth: 1,
    borderColor: Colors.chromeChipBorder,
    minHeight: 36,
  },
  logoSlot: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.borderLight,
  },
  logoFallback: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  titleFlex: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  buttonText: {
    color: Colors.chromeText,
    fontFamily: FontFamily.bold,
    fontSize: FontSize.sm,
    flexShrink: 1,
    minWidth: 0,
  },
  buttonTextSm: {
    fontSize: FontSize.sm,
    lineHeight: 17,
  },
  buttonTextXs: {
    fontSize: FontSize.xs,
    lineHeight: 15,
  },
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  dropdown: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    maxHeight: 400,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  dropdownTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: Spacing.sm,
  },
  optionLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.borderLight,
  },
  optionLogoFallback: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  optionSelected: {
    backgroundColor: Colors.primary + '08',
  },
  optionText: {
    fontSize: FontSize.md,
    color: Colors.text,
    flex: 1,
  },
  optionTextSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
});
