/**
 * TimePicker
 * Scroll wheel-style time picker for selecting start and end times.
 * Filters to only show available times based on existing bookings.
 */

import { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

interface TimePickerProps {
  times: string[];
  selectedTime: string;
  onSelect: (time: string) => void;
  label: string;
}

export function TimePicker({ times, selectedTime, onSelect, label }: TimePickerProps) {
  const flatListRef = useRef<FlatList>(null);
  const selectedIndex = times.indexOf(selectedTime);

  useEffect(() => {
    if (selectedIndex >= 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: selectedIndex,
          animated: false,
          viewOffset: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
        });
      }, 50);
    }
  }, [selectedIndex]);

  const formatTime = (time: string) => {
    const parts = time.split(':');
    const h = parseInt(parts[0]);
    const m = parts[1] || '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  };

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    const index = Math.round(offsetY / ITEM_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(index, times.length - 1));
    if (times[clampedIndex] && times[clampedIndex] !== selectedTime) {
      onSelect(times[clampedIndex]);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.pickerWrapper}>
        {/* Selection highlight */}
        <View style={styles.selectionHighlight} pointerEvents="none" />

        <FlatList
          ref={flatListRef}
          data={times}
          keyExtractor={(item) => item}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          contentContainerStyle={{
            paddingVertical: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
          }}
          getItemLayout={(_, index) => ({
            length: ITEM_HEIGHT,
            offset: ITEM_HEIGHT * index,
            index,
          })}
          renderItem={({ item, index }) => {
            const isSelected = item === selectedTime;
            return (
              <TouchableOpacity
                style={styles.item}
                onPress={() => {
                  onSelect(item);
                  flatListRef.current?.scrollToIndex({
                    index,
                    animated: true,
                    viewOffset: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
                  });
                }}
              >
                <Text style={[styles.itemText, isSelected && styles.itemTextSelected]}>
                  {formatTime(item)}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: Spacing.sm,
  },
  pickerWrapper: {
    height: PICKER_HEIGHT,
    overflow: 'hidden',
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    width: '100%',
  },
  selectionHighlight: {
    position: 'absolute',
    top: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    backgroundColor: Colors.primary + '12',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.primary + '30',
    zIndex: 1,
  },
  item: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    fontSize: FontSize.lg,
    color: Colors.textMuted,
  },
  itemTextSelected: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: FontSize.xl,
  },
});
