export const FARE_DEFAULTS = {
  savaariBaseFare: 20,
  savaariIncludedKm: 1.5,
  savaariPerKm: 10,
  logisticsBaseFare: 150,
  logisticsIncludedKm: 1.5,
  logisticsPerKm: 20,
  waitingRatePerMin: 1,
  nightMultiplier: 1.25,
  nightStartHour: 22,
  nightEndHour: 5,
  minFare: 20,
};

function isNightTime(rideTime, nightStartHour, nightEndHour) {
  const hour = rideTime.getHours();
  // Night window crosses midnight: 22 → 5
  if (nightStartHour > nightEndHour) {
    return hour >= nightStartHour || hour < nightEndHour;
  }
  return hour >= nightStartHour && hour < nightEndHour;
}

/**
 * @param {number} distanceKm
 * @param {number} waitingSeconds
 * @param {'savaari'|'logistics'} serviceType
 * @param {object} config - keys from FARE_DEFAULTS
 * @param {Date} [rideTime] - defaults to now
 * @returns {{ base, distance, waiting, subtotal, nightSurcharge, total, isNight, breakdown }}
 */
export function computeFare(distanceKm, waitingSeconds = 0, serviceType = 'savaari', config = {}, rideTime = new Date()) {
  const cfg = { ...FARE_DEFAULTS, ...config };

  const baseFare    = serviceType === 'logistics' ? cfg.logisticsBaseFare  : cfg.savaariBaseFare;
  const includedKm  = serviceType === 'logistics' ? cfg.logisticsIncludedKm : cfg.savaariIncludedKm;
  const perKm       = serviceType === 'logistics' ? cfg.logisticsPerKm      : cfg.savaariPerKm;

  const extraKm      = Math.max(0, distanceKm - includedKm);
  const distanceCharge = Math.round(extraKm * perKm);

  const waitingMins  = Math.floor(waitingSeconds / 60);
  const waitingCharge = Math.round(waitingMins * cfg.waitingRatePerMin);

  const subtotal = baseFare + distanceCharge + waitingCharge;

  const night = isNightTime(rideTime, cfg.nightStartHour, cfg.nightEndHour);
  const nightSurcharge = night ? Math.round(subtotal * (cfg.nightMultiplier - 1)) : 0;

  const total = Math.max(cfg.minFare, subtotal + nightSurcharge);

  return {
    base: baseFare,
    distance: distanceCharge,
    waiting: waitingCharge,
    waitingMins,
    subtotal,
    isNight: night,
    nightSurcharge,
    total,
    breakdown: `Base ₹${baseFare} + Distance ₹${distanceCharge}${waitingCharge ? ` + Waiting ₹${waitingCharge}` : ''}${night ? ` + Night ₹${nightSurcharge}` : ''}`,
  };
}
