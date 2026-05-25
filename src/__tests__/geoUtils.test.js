import { describe, it, expect } from 'vitest';
import { calculateDistance } from '../utils/geoUtils';

describe('calculateDistance', () => {
  it('same point returns 0', () => {
    expect(calculateDistance(28.6, 77.2, 28.6, 77.2)).toBeCloseTo(0, 4);
  });

  it('Delhi to Mumbai is approximately 1150 km', () => {
    const km = calculateDistance(28.6139, 77.2090, 19.0760, 72.8777);
    expect(km).toBeGreaterThan(1100);
    expect(km).toBeLessThan(1200);
  });

  it('Deoria area short distance is less than 10 km', () => {
    const km = calculateDistance(26.502, 83.778, 26.520, 83.800);
    expect(km).toBeLessThan(10);
    expect(km).toBeGreaterThan(0);
  });
});
