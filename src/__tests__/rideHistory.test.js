import { describe, it, expect } from 'vitest';

// Pulled directly from useRideHistory.js — testing pure logic
function statusMeta(status) {
  switch (status) {
    case 'paid':
    case 'payment_done':
    case 'finished':    return { label: 'Completed', color: 'text-emerald-600 bg-emerald-50' };
    case 'cancelled':   return { label: 'Cancelled',  color: 'text-red-500 bg-red-50' };
    case 'rejected':    return { label: 'Rejected',   color: 'text-orange-500 bg-orange-50' };
    case 'completed':   return { label: 'Awaiting Payment', color: 'text-amber-600 bg-amber-50' };
    default:            return { label: status,        color: 'text-slate-500 bg-slate-100' };
  }
}

describe('statusMeta', () => {
  it('payment_done → Completed', () => {
    expect(statusMeta('payment_done').label).toBe('Completed');
  });

  it('finished → Completed', () => {
    expect(statusMeta('finished').label).toBe('Completed');
  });

  it('cancelled → Cancelled', () => {
    expect(statusMeta('cancelled').label).toBe('Cancelled');
  });

  it('rejected → Rejected', () => {
    expect(statusMeta('rejected').label).toBe('Rejected');
  });

  it('completed → Awaiting Payment', () => {
    expect(statusMeta('completed').label).toBe('Awaiting Payment');
  });

  it('unknown status → returned as-is', () => {
    expect(statusMeta('pending').label).toBe('pending');
  });
});
