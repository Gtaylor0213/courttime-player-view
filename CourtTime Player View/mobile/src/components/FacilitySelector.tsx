/**
 * FacilitySelector
 * Dropdown for switching between facilities. Only shows when user belongs to 2+ facilities.
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

export function FacilitySelector() {
  const { facilityId, facilities, setFacilityId } = useAuth();
  const [open, setOpen] = useState(false);

  // Don't render if user has 0 or 1 facility
  if (facilities.length <= 1) return null;

  const currentFacility = facilities.find(f => f.id === facilityId);

  return (
    <>
      <TouchableOpacity style={styles.selector} onPress={() => setOpen(true)}>
        {currentFacility?.logoUrl ? (
          <CachedImage uri={currentFacility.logoUrl} style={styles.logo} />
        ) : (
          <Ionicons name="business-outline" size={16} color={Colors.primary} />
        )}
        <Text style={styles.selectorText} numberOfLines={1}>
          {currentFacility?.name || 'Select Facility'}
        </Text>
        <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
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
                  style={[
                    styles.option,
                    item.id === facilityId && styles.optionSelected,
                  ]}
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
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  selectorText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  logo: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.borderLight,
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
