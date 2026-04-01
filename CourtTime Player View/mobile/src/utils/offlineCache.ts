/**
 * Offline Cache
 * Caches API responses in AsyncStorage so screens can show data when offline.
 * Also queues write actions (booking create/cancel) for retry when back online.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'cache_';
const QUEUE_KEY = 'offline_action_queue';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CachedItem<T = any> {
  data: T;
  timestamp: number;
}

interface QueuedAction {
  id: string;
  endpoint: string;
  method: 'POST' | 'DELETE' | 'PATCH';
  body?: any;
  createdAt: number;
}

// ── Read Cache ──

export async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;

    const item: CachedItem<T> = JSON.parse(raw);

    // Check TTL
    if (Date.now() - item.timestamp > CACHE_TTL_MS) {
      await AsyncStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }

    return item.data;
  } catch {
    return null;
  }
}

export async function setCachedData<T>(key: string, data: T): Promise<void> {
  try {
    const item: CachedItem<T> = { data, timestamp: Date.now() };
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(item));
  } catch {
    // Cache write failed — non-critical
  }
}

export async function clearCachedData(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_PREFIX + key);
  } catch {
    // Non-critical
  }
}

// ── Action Queue (for offline writes) ──

export async function queueAction(action: Omit<QueuedAction, 'id' | 'createdAt'>): Promise<void> {
  try {
    const queue = await getActionQueue();
    queue.push({
      ...action,
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
    });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Non-critical
  }
}

export async function getActionQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearActionQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch {
    // Non-critical
  }
}

export async function removeActionFromQueue(actionId: string): Promise<void> {
  try {
    const queue = await getActionQueue();
    const filtered = queue.filter(a => a.id !== actionId);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
  } catch {
    // Non-critical
  }
}

// ── Clear all cache (on logout) ──

export async function clearAllCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch {
    // Non-critical
  }
}
