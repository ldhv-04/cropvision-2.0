import { useEffect, useRef, useState } from 'react';
import { Modal, Text, TextInput, View } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useCodeScanner } from 'react-native-vision-camera';
import * as Location from 'expo-location';
import { generateUuidV7 } from '@cropvision/domain';
import { readableOn } from '@cropvision/theme-tokens';
import { Btn, useHmi } from '../components/ui';
import { upsertRow, type SqlExecutor } from '../db/sql-store';
import { PESTICIDE_CATALOGUE } from '../data/pesticide-catalogue';
import { evaluateScan, locateBlock, type LocatedBlock, type ScanVerdict } from '../services/scouting';
import { fmtDMY, phiLockout } from '../lib/hmi';

export function ChemicalScannerScreen({ exec }: { exec: SqlExecutor }) {
  const { c, s } = useHmi();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [block, setBlock] = useState<LocatedBlock | null>(null);
  const [verdict, setVerdict] = useState<ScanVerdict>();
  const [code, setCode] = useState('');
  const [qty, setQty] = useState('1');
  const [saved, setSaved] = useState(false);
  const lastScan = useRef(0);

  useEffect(() => { void requestPermission(); void Location.requestForegroundPermissionsAsync(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const check = async (barcode: string) => {
    setSaved(false);
    // the block we are standing in decides the PHI window (GPS point-in-polygon on the offline table)
    let b: LocatedBlock | null = null;
    try { const p = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({})); b = await locateBlock(exec, p.coords); } catch { b = null; }
    setBlock(b);
    setVerdict(evaluateScan({ barcode, catalogue: PESTICIDE_CATALOGUE, block: b, nowMs: Date.now() }));
  };
  const scanner = useCodeScanner({
    codeTypes: ['ean-13', 'ean-8', 'code-128', 'qr'],
    onCodeScanned: (codes) => { const v = codes[0]?.value; if (v && Date.now() - lastScan.current > 2000) { lastScan.current = Date.now(); setCode(v); void check(v); } },
  });

  const log = async () => {
    if (verdict?.status !== 'OK' || !block) return;
    const t = Date.now();
    await upsertRow(exec, 'agronomicLogs', {
      id: generateUuidV7(), blockId: block.id, actionCategory: 'PESTICIDE', productName: verdict.product.name, activeIngredient: verdict.product.activeIngredient,
      barcodeString: code, quantityApplied: Number(qty) || 0, unit: 'LITER', totalCostVnd: 0, preHarvestIntervalDays: verdict.product.phiDays,
      safeHarvestUnlockDate: verdict.safeHarvestUnlockDate, executedAt: t, createdAt: t, updatedAt: t, deletedAt: null, syncStatus: 'PENDING',
    });
    setSaved(true);
  };

  const lock = verdict ? phiLockout(verdict, block?.expectedHarvestDate) : null;
  const reset = () => { setVerdict(undefined); setCode(''); };
  const notice = verdict && verdict.status !== 'OK' && verdict.status !== 'BLOCKED'
    ? (verdict.status === 'UNKNOWN_PRODUCT' ? 'Không có trong danh mục thuốc — không thể xác nhận an toàn.' : 'Không xác định được lô (GPS không nằm trong lô nào).')
    : null;

  return (
    <View style={s.screen}>
      <Text style={s.h1}>Quét thuốc BVTV</Text>
      {/* manual entry above the preview: the on-screen keyboard covered it when it sat below (seen on emulator) */}
      <View style={[s.row, { marginBottom: 12, flexWrap: 'nowrap' }]}>
        <TextInput testID="barcode-input" style={[s.input, { flex: 1 }]} value={code} onChangeText={setCode} placeholder="Mã vạch" placeholderTextColor={c.muted}
          keyboardType="number-pad" returnKeyType="done" onSubmitEditing={() => code && check(code)} />
        <Btn title="Kiểm tra" testID="check" onPress={() => check(code)} disabled={!code} />
      </View>
      {hasPermission && device
        // texture-view: a SurfaceView preview ignores RN layout/clipping on Android and was drawn over the header (seen on emulator).
        ? <View style={{ height: 200, borderRadius: 8, borderWidth: 2, borderColor: c.border, overflow: 'hidden', marginBottom: 12 }}>
            <Camera style={{ flex: 1 }} device={device} isActive={!lock} codeScanner={scanner} androidPreviewViewType="texture-view" />
          </View>
        : <Text style={[s.muted, { marginBottom: 12 }]}>Camera chưa sẵn sàng — nhập mã ở trên.</Text>}

      {verdict?.status === 'OK' && (
        <View testID="verdict" style={{ backgroundColor: c.healthy, borderRadius: 8, padding: 16, gap: 6 }}>
          <Text style={{ color: readableOn(c.healthy), fontWeight: '800', fontSize: 18 }}>✔ ĐƯỢC PHÉP — {verdict.product.name}</Text>
          <Text style={{ color: readableOn(c.healthy), fontSize: 15 }}>Lô {block?.name}. Thu hoạch an toàn từ {fmtDMY(verdict.safeHarvestUnlockDate)} (PHI {verdict.product.phiDays} ngày).</Text>
        </View>
      )}
      {notice && <View testID="verdict" style={{ backgroundColor: c.warning, borderRadius: 8, padding: 16 }}><Text style={{ color: readableOn(c.warning), fontWeight: '800', fontSize: 16 }}>{notice}</Text></View>}
      {verdict?.status === 'OK' && (
        <View style={[s.row, { marginTop: 12, flexWrap: 'nowrap' }]}>
          <TextInput style={[s.input, { width: 96 }]} value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
          <Text style={s.text}>lít</Text>
          <Btn title={saved ? 'Đã ghi ✓' : 'Ghi nhật ký (1 chạm)'} testID="log-one-tap" onPress={log} disabled={saved} style={{ flex: 1 }} />
        </View>
      )}

      {/* PHI violation: full-screen block. There is no "apply anyway" path; the only action is to scan something else. */}
      <Modal visible={verdict?.status === 'BLOCKED'} animationType="none" statusBarTranslucent onRequestClose={reset}>
        {verdict?.status === 'BLOCKED' && (
          <View testID="verdict" accessibilityRole="alert" style={{ flex: 1, backgroundColor: c.danger, padding: 24, paddingTop: 64, gap: 16 }}>
            <Text style={{ color: c.onDanger, fontSize: 28, fontWeight: '900' }}>⛔ CẤM PHUN</Text>
            <Text style={{ color: c.onDanger, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 }}>PHI_VIOLATION_BLOCKED</Text>
            <Text style={{ color: c.onDanger, fontSize: 18 }}>{verdict.product.name} — thời gian cách ly {verdict.product.phiDays} ngày, lô {block?.name ?? '—'}.</Text>
            <View style={{ borderWidth: 2, borderColor: c.onDanger, borderRadius: 8, padding: 16, gap: 10 }}>
              <Text style={{ color: c.onDanger, fontSize: 16 }}>Ngày thu hoạch dự kiến</Text>
              <Text testID="phi-harvest" style={{ color: c.onDanger, fontSize: 30, fontWeight: '900', fontFamily: 'monospace' }}>{lock?.harvest ?? '—'}</Text>
              <Text style={{ color: c.onDanger, fontSize: 16 }}>Ngày hết cách ly an toàn</Text>
              <Text testID="phi-safe" style={{ color: c.onDanger, fontSize: 30, fontWeight: '900', fontFamily: 'monospace' }}>{lock?.safe ?? fmtDMY(verdict.safeHarvestUnlockDate)}</Text>
              {lock && <Text style={{ color: c.onDanger, fontSize: 16, fontWeight: '700' }}>Vượt {lock.overDays} ngày — nông sản sẽ còn tồn dư thuốc khi thu hoạch.</Text>}
            </View>
            <View style={{ flex: 1 }} />
            <Btn title="QUÉT SẢN PHẨM KHÁC" testID="phi-scan-other" variant="outline" height={64} onPress={reset} />
          </View>
        )}
      </Modal>
    </View>
  );
}
