/**
 * Maintenance-flag derivation from a vehicle's flight history. Pure trend logic,
 * shared by the main process and the Fleet Forensics renderer panel, and
 * unit-testable. Operates on newest-first flights.
 */
import type { VehicleFlightHistory, MaintenanceFlag } from './fleet-log-types.js';
import { t } from './i18n/index.js';

export function deriveMaintenanceFlags(history: VehicleFlightHistory): MaintenanceFlag[] {
  const flags: MaintenanceFlag[] = [];
  const flights = history.flights;
  if (flights.length === 0) return flags;
  const key = history.vehicleKey;

  // Vibration trend: mean of the 3 most recent flights vs the prior 3. A >50%
  // rise above 30 m/s^2 is worth a look.
  const recent = flights.slice(0, 3).map((f) => f.maxVibe).filter((v) => v > 0);
  const prior = flights.slice(3, 6).map((f) => f.maxVibe).filter((v) => v > 0);
  if (recent.length >= 2 && prior.length >= 2) {
    const rAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const pAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
    if (rAvg > 30 && rAvg > pAvg * 1.5) {
      flags.push({
        vehicleKey: key,
        severity: 'warn',
        title: t('shared:fleetLogMaintenance.vibrationTitle'),
        detail: t('shared:fleetLogMaintenance.vibrationDetail', { recent: rAvg.toFixed(0), prior: pAvg.toFixed(0) }),
      });
    }
  }

  // Repeated GPS/compass/vibration/power faults across recent flights.
  const checkRepeat = (id: string, label: string): void => {
    const window = flights.slice(0, 5);
    const bad = window.filter((f) => f.health.some((h) => h.id === id && (h.status === 'fail' || h.status === 'warn')));
    if (bad.length >= 3) {
      const failing = window.filter((f) => f.health.some((h) => h.id === id && h.status === 'fail')).length;
      flags.push({
        vehicleKey: key,
        severity: failing >= 2 ? 'fail' : 'warn',
        title: t('shared:fleetLogMaintenance.recurringTitle', { label }),
        detail: t('shared:fleetLogMaintenance.recurringDetail', { bad: bad.length, total: window.length, label }),
      });
    }
  };
  checkRepeat('gps', 'GPS');
  checkRepeat('compass', t('shared:fleetLogMaintenance.labelCompass'));
  checkRepeat('vibration', t('shared:fleetLogMaintenance.labelVibration'));
  checkRepeat('power', t('shared:fleetLogMaintenance.labelPower'));

  // Battery sag: min pack voltage dropping flight-over-flight suggests aging cells.
  const volts = flights.filter((f) => f.minBatteryV > 0).slice(0, 6).map((f) => f.minBatteryV);
  if (volts.length >= 4) {
    const recentV = volts.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
    const olderV = volts.slice(-2).reduce((a, b) => a + b, 0) / 2;
    if (olderV - recentV > 0.4) {
      flags.push({
        vehicleKey: key,
        severity: 'warn',
        title: t('shared:fleetLogMaintenance.batteryTitle'),
        detail: t('shared:fleetLogMaintenance.batteryDetail', { drop: (olderV - recentV).toFixed(1) }),
      });
    }
  }

  return flags;
}
