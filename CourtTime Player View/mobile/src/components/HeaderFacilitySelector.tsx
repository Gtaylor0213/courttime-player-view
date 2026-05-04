/**
 * HeaderFacilitySelector
 * Compact facility switcher rendered as the tab navigator's header title.
 * Hidden when the user belongs to 0 or 1 facilities (in those cases a static
 * title is fine — the parent provides a fallback).
 */

import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { CachedImage } from './CachedImage';

interface Props {
  fallbackTitle: string;
}

export function HeaderFacilitySelector({ fallbackTitle }: Props) {
  const { facilityId, facilities, setFacilityId } = useAuth();
  const [open, setOpen] = useState(false);

  // Single-facility (or facility-less) users see a static title.
  if (facilities.length <= 1) {
    return <Text style={styles.titleStatic}>{fallbackTitle}</Text>;
  }

  const currentFacility = facilities.find(f => f.id === facilityId);
  const facilityName = currentFacility?.name || 'Select Facility';
  const useTwoLines = facilityName.length > 30;

  return (
    <>
      <TouchableOpacity
        style={[styles.button, useTwoLines && styles.buttonLong]}
        onPress={() => setOpen(true)}
      >
        {currentFacility?.logoUrl ? (
          <CachedImage uri={currentFacility.logoUrl} style={styles.logo} />
        ) : (
          <View style={styles.logoFallback}>
            <Ionicons name="business-outline" size={14} color={Colors.primary} />
          </View>
        )}
        <View style={styles.titleWrap}>
          <Text
            style={[styles.buttonText, useTwoLines && styles.buttonTextLong]}
            numberOfLines={useTwoLines ? 2 : 1}
            adjustsFontSizeToFit={!useTwoLines}
            minimumFontScale={0.7}
            ellipsizeMode="tail"
          >
            {facilityName}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
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
  titleStatic: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: FontSize.lg,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 260,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 40,
  },
  buttonLong: {
    borderRadius: BorderRadius.md,
    alignItems: 'flex-start',
    paddingVertical: Spacing.sm,
    minHeight: 56,
  },
  titleWrap: {
    flex: 1,
    flexShrink: 1,
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
    backgroundColor: Colors.primary + '12',
  },
  buttonText: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: FontSize.lg,
    flexShrink: 1,
  },
  buttonTextLong: {
    lineHeight: 20,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
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
    shadowColor: '#0f172a',
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
