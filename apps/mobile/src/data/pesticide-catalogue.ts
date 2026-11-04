import type { PesticideProduct } from '@cropvision/domain';

/**
 * DEMO DATA ONLY. Names, barcodes and PHI days below are placeholders so the PHI lock can be exercised end to end.
 * Replace with the farm's registered products (label PHI) before field use — see docs/work/cropvision/UNVERIFIED.md.
 */
export const PESTICIDE_CATALOGUE: readonly PesticideProduct[] = [
  { name: 'DEMO Fungicide A (PHI 14d)', activeIngredient: 'demo-active-1', phiDays: 14, barcodes: ['8930000000011'] },
  { name: 'DEMO Fungicide B (PHI 45d)', activeIngredient: 'demo-active-2', phiDays: 45, barcodes: ['8930000000028'] },
];
