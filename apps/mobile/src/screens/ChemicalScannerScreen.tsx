import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useCodeScanner } from 'react-native-vision-camera';
import * as Location from 'expo-location';
import { generateUuidV7 } from '@cropvision/domain';
import { Btn, s } from '../components/ui';
import { upsertRow, type SqlExecutor } from '../db/sql-store';
import { PESTICIDE_CATALOGUE } from '../data/pesticide-catalogue';
import { evaluateScan, locateBlock, type LocatedBlock, type ScanVerdict } from '../services/scouting';

const DAY = 86_400_000;

export function ChemicalScannerScreen({ exec }: { exec: SqlExecutor }) {
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

  return (
    <View style={s.screen}>
      <Text style={s.h1}>Quét thuốc BVTV</Text>
      {hasPermission && device ? <Camera style={{ height: 180, borderRadius: 10 }} device={device} isActive codeScanner={scanner} /> : <Text style={s.muted}>Camera chưa sẵn sàng — nhập mã thủ công bên dưới.</Text>}
      <View style={[s.row, { marginVertical: 8 }]}>
        <TextInput testID="barcode-input" style={[s.input, { flex: 1 }]} value={code} onChangeText={setCode} placeholder="Mã vạch" keyboardType="number-pad" />
        <Btn title="Kiểm tra" testID="check" onPress={() => check(code)} disabled={!code} />
      </View>
      {verdict && (
        <View testID="verdict" style={verdict.status === 'OK' ? s.alertGreen : s.alertRed}>
          {verdict.status === 'OK' && <><Text style={s.alertText}>✔ ĐƯỢC PHÉP — {verdict.product.name}</Text>
            <Text style={{ color: '#fff' }}>Lô {block?.name}. Thu hoạch an toàn từ {new Date(verdict.safeHarvestUnlockDate).toLocaleDateString('vi-VN')} (PHI {verdict.product.phiDays} ngày).</Text></>}
          {verdict.status === 'BLOCKED' && <><Text style={s.alertText}>⛔ PHI_VIOLATION_BLOCKED</Text>
            <Text style={{ color: '#fff' }}>{verdict.product.name}: PHI {verdict.product.phiDays} ngày vượt ngày thu hoạch dự kiến của lô {block?.name} ({block?.expectedHarvestDate ? new Date(block.expectedHarvestDate).toLocaleDateString('vi-VN') : '—'}). Không được phun.</Text></>}
          {verdict.status === 'UNKNOWN_PRODUCT' && <Text style={s.alertText}>Không có trong danh mục thuốc — không thể xác nhận an toàn.</Text>}
          {verdict.status === 'NO_BLOCK' && <Text style={s.alertText}>Không xác định được lô (GPS không nằm trong lô nào).</Text>}
        </View>
      )}
      {verdict?.status === 'OK' && (
        <View style={[s.row, { marginTop: 8 }]}>
          <TextInput style={[s.input, { width: 90 }]} value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
          <Text>lít</Text>
          <Btn title={saved ? 'Đã ghi ✓' : 'Ghi nhật ký (1 chạm)'} testID="log-one-tap" onPress={log} disabled={saved} />
        </View>
      )}
    </View>
  );
}
