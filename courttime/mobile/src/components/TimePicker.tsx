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
  ScrollView,
  TouchableOpacity,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
/** Exported for booking modal layout (fixed column height). */
export const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

interface TimePickerProps {
  times: string[];
  selectedTime: string;
  onSelect: (time: string) => void;
  label: string;
}

export function TimePicker({ times, selectedTime, onSelect, label }: TimePickerProps) {
  const scrollRef = useRef<ScrollView>(null);
  const lastSyncedIndexRef = useRef<number>(-1);
  const selectedIndex = times.indexOf(selectedTime);

  useEffect(() => {
    if (selectedIndex < 0 || !scrollRef.current) return;
    if (lastSyncedIndexRef.current === selectedIndex) return;
    lastSyncedIndexRef.current = selectedIndex;
    scrollRef.current.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
  }, [selectedIndex, times.length]);

  useEffect(() => {
    lastSyncedIndexRef.current = -1;
  }, [times]);

  const formatTime = (time: string) => {
    const [hStr, m = '00'] = time.split(':');
    const h = parseInt(hStr, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  };

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(idx, times.length - 1));
    const value = times[clamped];
    if (value && value !== selectedTime) onSelect(value);
    lastSyncedIndexRef.current = clamped;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.pickerWrapper}>
        <View style={styles.selectionHighlight} pointerEvents="none" />
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          nestedScrollEnabled
          bounces={false}
          overScrollMode="never"
          onMomentumScrollEnd={onMomentumScrollEnd}
          onScrollEndDrag={onMomentumScrollEnd}
          contentContainerStyle={{
            paddingVertical: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
          }}
        >
          {times.map((item, index) => {
            const isSelected = item === selectedTime;
            return (
              <TouchableOpacity
                key={item}
                style={styles.item}
                onPress={() => {
                  onSelect(item);
                  scrollRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: true });
                  lastSyncedIndexRef.current = index;
                }}
                accessibilityRole="button"
                accessibilityLabel={`${label} time ${formatTime(item)}`}
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={[styles.itemText, isSelected && styles.itemTextSelected]}>
                  {formatTime(item)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surface,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.border,
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
