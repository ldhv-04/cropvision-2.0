import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { severityTone } from '@cropvision/theme-tokens';
import { useTheme } from '@cropvision/theme-tokens/react';
import type { SqlExecutor } from '../db/sql-store';
import { BORDER, KNOB, TOUCH_MIN, hmiColors, lanBanner, pressureGauge, shouldActuate, slideProgress, type HmiColors } from '../lib/hmi';

export const MONO = 'monospace'; // JetBrains Mono is not bundled on mobile (no font asset pipeline yet); system mono keeps digits tabular.

function makeStyles(c: HmiColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg, padding: 16 },
    h1: { fontSize: 20, fontWeight: '700', color: c.ink, marginBottom: 8 },
    card: { backgroundColor: c.card, borderRadius: 8, borderWidth: BORDER, borderColor: c.border, padding: 12, marginBottom: 12 },
    row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
    muted: { color: c.muted, fontSize: 14 },
    text: { color: c.ink, fontSize: 16 },
    input: { minHeight: TOUCH_MIN, borderWidth: BORDER, borderColor: c.input, borderRadius: 8, paddingHorizontal: 12, backgroundColor: c.card, color: c.ink, fontSize: 16 },
    mono: { fontFamily: MONO, fontVariant: ['tabular-nums'], color: c.ink },
  });
}

/** Colours + styles of the active palette (tactical-daylight by default, high-noon-monochrome for extreme glare). */
export function useHmi() {
  const { palette, setTheme } = useTheme();
  return useMemo(() => { const c = hmiColors(palette); return { palette, c, s: makeStyles(c), setTheme }; }, [palette, setTheme]);
}

export const severityColor = (c: HmiColors, pct: number) => c[severityTone(pct)];

type Variant = 'primary' | 'secondary' | 'danger' | 'outline';
export function Btn({ title, onPress, disabled, variant = 'primary', selected, style, testID, height = TOUCH_MIN }: {
  title: string; onPress: () => void; disabled?: boolean; variant?: Variant; selected?: boolean; style?: ViewStyle; testID?: string; height?: number;
}) {
  const { c } = useHmi();
  const v = selected ? 'primary' : variant;
  const bg = { primary: c.primary, secondary: c.secondary, danger: c.danger, outline: c.card }[v];
  const fg = { primary: c.onPrimary, secondary: c.onSecondary, danger: c.onDanger, outline: c.ink }[v];
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [{
        minHeight: height, paddingHorizontal: 16, borderRadius: 8, borderWidth: BORDER, alignItems: 'center', justifyContent: 'center',
        backgroundColor: disabled ? c.surface : bg, borderColor: disabled ? c.border : v === 'outline' ? c.input : bg,
        transform: [{ translateY: pressed && !disabled ? 1 : 0 }], opacity: pressed && !disabled ? 0.85 : 1,
      }, style]}>
      <Text style={{ color: disabled ? c.muted : fg, fontWeight: '700', fontSize: 16, textAlign: 'center' }}>{title}</Text>
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
  const { c } = useHmi();
  const width = useRef(1);
  const set = (x: number) => onChange(Math.round(Math.max(0, Math.min(1, x / width.current)) * 100));
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => set(e.nativeEvent.locationX), onPanResponderMove: (e) => set(e.nativeEvent.locationX),
  })).current;
  return (
    <View testID="severity-slider" style={{ height: TOUCH_MIN, borderRadius: 8, borderWidth: BORDER, borderColor: c.border, backgroundColor: c.surface, overflow: 'hidden', justifyContent: 'center' }}
      onLayout={(e: LayoutChangeEvent) => { width.current = e.nativeEvent.layout.width; }} {...pan.panHandlers}>
      <View pointerEvents="none" style={{ height: '100%', width: `${value}%`, backgroundColor: severityColor(c, value) }} />
    </View>
  );
}

export function LanBanner({ reachable, pendingSamples, busy, onPress }: { reachable: boolean; pendingSamples: number; busy: boolean; onPress: () => void }) {
  const { palette } = useHmi();
  const b = lanBanner(palette, { reachable, pendingSamples });
  return (
    <Pressable testID="lan-banner" accessibilityRole="button" accessibilityLabel={b.text} accessibilityHint={reachable ? 'Chạm để đồng bộ ngay' : undefined}
      onPress={reachable && !busy ? onPress : undefined}
      style={({ pressed }) => ({ minHeight: 44, borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: b.fill, transform: [{ translateY: pressed ? 1 : 0 }] })}>
      <Text style={{ color: b.ink, fontWeight: '800', fontSize: 13, letterSpacing: 0.3 }}>{busy ? '⟳ ĐANG ĐỒNG BỘ…' : b.text}</Text>
    </Pressable>
  );
}

/** 0–4 bar horizontal gauge, 2.3–2.7 bar Venturi band in cobalt, needle at the live reading. */
export function PressureGauge({ bar }: { bar: number | null | undefined }) {
  const { c, s, palette } = useHmi();
  const g = pressureGauge(bar);
  const cobalt = palette.telemetry['hydraulic-border'];
  return (
    <View accessibilityLabel={`Áp suất ${bar?.toFixed(2) ?? 'chưa có'} bar`} style={{ gap: 4 }}>
      <View style={{ height: 28, borderRadius: 6, borderWidth: BORDER, borderColor: c.border, backgroundColor: c.surface, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: `${g.band[0] * 100}%`, width: `${(g.band[1] - g.band[0]) * 100}%`, backgroundColor: cobalt }} />
        {g.zone !== 'NO_DATA' && <View testID="gauge-needle" style={{ position: 'absolute', top: -2, bottom: -2, width: 4, marginLeft: -2, left: `${g.needle * 100}%`, backgroundColor: c.ink }} />}
      </View>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        {[0, 1, 2, 3, 4].map((n) => <Text key={n} style={[s.mono, { fontSize: 12, color: c.muted }]}>{n}</Text>)}
      </View>
    </View>
  );
}

/** Hydraulic actuation needs a deliberate slide of the 56px knob across the 64px track: no pocket taps. */
export function SlideToActuate({ label, onActuate, disabled, testID }: { label: string; onActuate: () => void; disabled?: boolean; testID?: string }) {
  const { c } = useHmi();
  const x = useRef(new Animated.Value(0)).current;
  const track = useRef(1);
  const cb = useRef(onActuate); cb.current = onActuate;
  const off = useRef(disabled); off.current = disabled;
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !off.current, onMoveShouldSetPanResponder: () => !off.current,
    onPanResponderMove: (_e, g) => x.setValue(slideProgress(g.dx, track.current) * (track.current - KNOB)),
    onPanResponderRelease: (_e, g) => {
      if (shouldActuate(slideProgress(g.dx, track.current))) cb.current();
      Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(),
  })).current;
  return (
    <View testID={testID} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
      accessibilityActions={[{ name: 'activate', label }]} onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'activate' && !disabled) onActuate(); }}
      onLayout={(e) => { track.current = e.nativeEvent.layout.width; }}
      style={{ height: 64, borderRadius: 8, borderWidth: BORDER, borderColor: disabled ? c.border : c.primary, backgroundColor: c.surface, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ position: 'absolute', left: KNOB + 16, right: 12, color: c.ink, fontWeight: '800', fontSize: 15 }}>{label}</Text>
      <Animated.View {...pan.panHandlers} style={{ width: KNOB, height: KNOB, marginLeft: 2, borderRadius: 6, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: x }] }}>
        <Text style={{ color: c.onPrimary, fontSize: 24, fontWeight: '900' }}>»</Text>
      </Animated.View>
    </View>
  );
}
