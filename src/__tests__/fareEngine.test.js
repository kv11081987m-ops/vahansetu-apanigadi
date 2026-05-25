import { describe, it, expect } from 'vitest';
import { computeFare, FARE_DEFAULTS } from '../utils/fareEngine';

describe('computeFare — savaari', () => {
  it('base fare only for 0 km', () => {
    const result = computeFare(0, 0, 'savaari', {}, new Date('2025-01-01T10:00:00'));
    expect(result.total).toBe(FARE_DEFAULTS.savaariBaseFare);
    expect(result.base).toBe(20);
    expect(result.distance).toBe(0);
    expect(result.isNight).toBe(false);
  });

  it('included km has no extra charge', () => {
    const result = computeFare(1.5, 0, 'savaari', {}, new Date('2025-01-01T10:00:00'));
    expect(result.distance).toBe(0);
    expect(result.total).toBe(20);
  });

  it('charges per km beyond included distance', () => {
    const result = computeFare(3.5, 0, 'savaari', {}, new Date('2025-01-01T10:00:00'));
    // extra = 3.5 - 1.5 = 2 km → 2 * 10 = 20
    expect(result.distance).toBe(20);
    expect(result.total).toBe(40);
  });

  it('night surcharge applied after 10 PM', () => {
    const night = new Date('2025-01-01T23:00:00');
    const result = computeFare(0, 0, 'savaari', {}, night);
    expect(result.isNight).toBe(true);
    expect(result.nightSurcharge).toBeGreaterThan(0);
  });

  it('night surcharge NOT applied at 10 AM', () => {
    const day = new Date('2025-01-01T10:00:00');
    const result = computeFare(0, 0, 'savaari', {}, day);
    expect(result.isNight).toBe(false);
    expect(result.nightSurcharge).toBe(0);
  });

  it('waiting charge calculated correctly', () => {
    const result = computeFare(0, 300, 'savaari', {}, new Date('2025-01-01T10:00:00'));
    // 300s = 5 min → 5 * 1 = 5
    expect(result.waiting).toBe(5);
    expect(result.waitingMins).toBe(5);
  });
});

describe('computeFare — logistics', () => {
  it('logistics base fare is higher', () => {
    const result = computeFare(0, 0, 'logistics', {}, new Date('2025-01-01T10:00:00'));
    expect(result.base).toBe(FARE_DEFAULTS.logisticsBaseFare);
    expect(result.total).toBe(150);
  });

  it('logistics per km rate applied correctly', () => {
    const result = computeFare(3.5, 0, 'logistics', {}, new Date('2025-01-01T10:00:00'));
    // extra = 3.5 - 1.5 = 2 km → 2 * 20 = 40
    expect(result.distance).toBe(40);
    expect(result.total).toBe(190);
  });
});

describe('computeFare — custom config', () => {
  it('respects custom baseFare from config', () => {
    const result = computeFare(0, 0, 'savaari', { savaariBaseFare: 30 }, new Date('2025-01-01T10:00:00'));
    expect(result.base).toBe(30);
  });

  it('respects custom perKm from config', () => {
    const result = computeFare(3.5, 0, 'savaari', { savaariPerKm: 12 }, new Date('2025-01-01T10:00:00'));
    // extra = 2 km → 2 * 12 = 24
    expect(result.distance).toBe(24);
  });

  it('minFare floor enforced', () => {
    const result = computeFare(0, 0, 'savaari', { savaariBaseFare: 5, minFare: 20 }, new Date('2025-01-01T10:00:00'));
    expect(result.total).toBe(20);
  });
});
