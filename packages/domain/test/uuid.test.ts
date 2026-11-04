import { describe, expect, it } from 'vitest';
import { generateUuidV7 } from '../src/uuid';

describe('uuidv7 (AC-04)', () => {
  it('has v7 layout', () => {
    expect(generateUuidV7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('is unique and strictly increasing over 10k ids even in the same ms', () => {
    const ids = Array.from({ length: 10_000 }, () => generateUuidV7(1_700_000_000_000));
    expect(new Set(ids).size).toBe(10_000);
    expect([...ids].sort()).toEqual(ids);
  });
  it('encodes the timestamp in the first 48 bits', () => {
    const id = generateUuidV7(1_700_000_000_123);
    expect(parseInt(id.replace(/-/g, '').slice(0, 12), 16)).toBeGreaterThanOrEqual(1_700_000_000_123);
  });
  it('orders by time across ms', () => {
    expect(generateUuidV7(1_700_000_000_000) < generateUuidV7(1_700_000_005_000)).toBe(true);
  });
});
