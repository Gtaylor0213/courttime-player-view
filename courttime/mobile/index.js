/**
 * App entry — gesture-handler first, then disable native screens before expo-router loads
 * so bottom tab presses are not stolen by `react-native-screens` in Expo Go.
 */
import 'react-native-gesture-handler';
import { enableScreens } from 'react-native-screens';

enableScreens(false);

import 'expo-router/entry';
