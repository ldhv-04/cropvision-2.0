import { useCallback, useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import type { SqlExecutor } from '../db/sql-store';

export const colors = { green: '#2e7d32', red: '#c62828', amber: '#e0a100', ink: '#1c2a1c', bg: '#f3f6f1', card: '#fff' };
export const severityColor = (pct: number) => (pct < 5 ? colors.green : pct < 15 ? colors.amber : colors.red);

export function Btn({ title, onPress, disabled, color = colors.green, style, testID }: { title: string; onPress: () => void; disabled?: boolean; color?: string; style?: ViewStyle; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled }} onPress={disabled ? undefined : onPress}
      style={[s.btn, { backgroundColor: disabled ? '#9e9e9e' : color }, style]}>
      <Text style={s.btnText}>{title}</Text>
    </Pressable>
  );
}

/** Re-runs `sql` when `deps` change or `reload()` is called. */
export function useDbQuery<T = any>(exec: SqlExecutor | undefined, sql: string, params: unknown[] = [], deps: unknown[] = []) {
  const [rows, setRows] = useState<T[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => { let live = true; if (exec) exec.all<T>(sql, params).then((r) => live && setRows(r)); return () => { live = false; }; }, [exec, tick, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { rows, reload: useCallback(() => setTick((t) => t + 1), []) };
}

/** Drag slider (0..100, step 1) for the manual disease-severity fallback. */
export function Slider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const width = useRef(1);
  const set = (x: number) => onChange(Math.round(Math.max(0, Math.min(1, x / width.current)) * 100));
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => set(e.nativeEvent.locationX), onPanResponderMove: (e) => set(e.nativeEvent.locationX),
  })).current;
  return (
    <View testID="severity-slider" style={s.sliderTrack} onLayout={(e: LayoutChangeEvent) => { width.current = e.nativeEvent.layout.width; }} {...pan.panHandlers}>
      <View pointerEvents="none" style={[s.sliderFill, { width: `${value}%`, backgroundColor: severityColor(value) }]} />
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 12 },
  h1: { fontSize: 20, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  card: { backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 8, elevation: 1 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  muted: { color: '#667', fontSize: 13 },
  input: { borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 10, backgroundColor: '#fff', color: colors.ink },
  alertRed: { backgroundColor: colors.red, padding: 16, borderRadius: 10 },
  alertGreen: { backgroundColor: colors.green, padding: 16, borderRadius: 10 },
  alertText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  sliderTrack: { height: 36, borderRadius: 18, backgroundColor: '#ddd', overflow: 'hidden', justifyContent: 'center' },
  sliderFill: { height: 36 },
});
