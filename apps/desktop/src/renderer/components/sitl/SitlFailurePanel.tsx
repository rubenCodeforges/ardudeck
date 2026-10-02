/**
 * SITL Failure Injection Panel
 *
 * Toggle cards for injecting sensor failures into the running SITL instance.
 * Supports GPS, Compass, Barometer, Accelerometer, and Gyroscope failures.
 * Also provides GPS advanced controls (satellite count, delay).
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSimParam, useResolvedSimParam } from '../../hooks/useSimParam';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { SENSOR_BITS } from '../../../shared/telemetry-types';

// --- Failure toggle card ---

interface FailureCardProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  available: boolean;
  fcHealthy: boolean | null; // null = no data yet
  onToggle: () => void;
}

function FailureCard({ label, icon, active, available, fcHealthy, onToggle }: FailureCardProps) {
  const { t } = useTranslation();
  if (!available) return null;

  return (
    <button
      onClick={onToggle}
      className={`relative flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${
        active
          ? 'bg-red-500/15 border-red-500/40 shadow-sm'
          : 'bg-surface border-subtle hover:bg-surface-raised'
      }`}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
        active ? 'bg-red-500/20 text-red-400' : 'bg-surface-raised text-content-tertiary'
      }`}>
        {icon}
      </div>
      <span className={`text-xs font-medium transition-colors ${
        active ? 'text-red-400' : 'text-content-secondary'
      }`}>
        {label}
      </span>
      <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full transition-colors ${
        active
          ? 'bg-red-500/20 text-red-400'
          : 'bg-surface-raised text-content-tertiary'
      }`}>
        {active ? t('sitl:failurePanel.failed') : t('sitl:failurePanel.ok')}
      </span>
      {/* FC-confirmed health indicator */}
      {fcHealthy !== null && (
        <span className={`text-[9px] transition-colors ${
          fcHealthy ? 'text-green-400' : 'text-red-400'
        }`}>
          {t('sitl:failurePanel.fcHealth', { state: fcHealthy ? t('sitl:failurePanel.healthy') : t('sitl:failurePanel.unhealthy') })}
        </span>
      )}
    </button>
  );
}

// --- SVG Icons ---

const GpsIcon = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a7 7 0 00-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z" />
  </svg>
);

const CompassIcon = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <circle cx="12" cy="12" r="9" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
  </svg>
);

const BaroIcon = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l3-9 4 18 3-9h4" />
  </svg>
);

const AccelIcon = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);

const GyroIcon = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <circle cx="12" cy="12" r="3" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4m0 12v4m10-10h-4M6 12H2m17.07-7.07l-2.83 2.83M9.76 14.24l-2.83 2.83m0-10.14l2.83 2.83m4.48 4.48l2.83 2.83" />
  </svg>
);

// --- Main panel ---

// Map each failure type to its SYS_STATUS sensor bit
const SENSOR_BIT_MAP: Record<string, number> = {
  gps: SENSOR_BITS.GPS,
  compass: SENSOR_BITS.MAG,
  baro: SENSOR_BITS.BARO,
  accel: SENSOR_BITS.ACCEL,
  gyro: SENSOR_BITS.GYRO,
};

export default function SitlFailurePanel({ bare = false }: { bare?: boolean }) {
  const { t } = useTranslation();
  // Failure toggles - try both old and new param naming conventions
  const gps = useResolvedSimParam(['SIM_GPS_DISABLE', 'SIM_GPS1_DISABLE'], 0);
  const compass = useResolvedSimParam(['SIM_MAG1_FAIL', 'SIM_MAG_FAIL'], 0);
  const baro = useResolvedSimParam(['SIM_BARO_DISABLE', 'SIM_BARO1_DISABLE'], 0);
  const accel = useResolvedSimParam(['SIM_ACC1_FAIL', 'SIM_ACC_FAIL'], 0);
  const gyro = useResolvedSimParam(['SIM_GYR1_FAIL', 'SIM_GYR_FAIL'], 0);

  // GPS advanced controls
  const gpsSats = useSimParam('SIM_GPS_NUMSATS', 10);
  const gpsDelay = useSimParam('SIM_GPS_DELAY', 0);

  // FC-reported sensor health from SYS_STATUS
  const sensorHealth = useTelemetryStore((s) => s.sensorHealth);

  /** Check if FC reports a specific sensor as healthy (null = no data) */
  const isFcHealthy = (sensorKey: string): boolean | null => {
    if (!sensorHealth) return null;
    const bit = SENSOR_BIT_MAP[sensorKey];
    if (bit === undefined) return null;
    // Only report health for sensors that are present on the vehicle
    if (!(sensorHealth.present & bit)) return null;
    return (sensorHealth.health & bit) !== 0;
  };

  const failures = [
    { key: 'gps', label: t('sitl:failurePanel.gps'), icon: GpsIcon, param: gps },
    { key: 'compass', label: t('common:compass'), icon: CompassIcon, param: compass },
    { key: 'baro', label: t('sitl:failurePanel.baro'), icon: BaroIcon, param: baro },
    { key: 'accel', label: t('sitl:failurePanel.accel'), icon: AccelIcon, param: accel },
    { key: 'gyro', label: t('sitl:failurePanel.gyro'), icon: GyroIcon, param: gyro },
  ] as const;

  const availableFailures = failures.filter((f) => f.param.available);
  const activeCount = failures.filter((f) => f.param.available && f.param.value > 0).length;

  const handleResetAll = useCallback(() => {
    for (const f of failures) {
      if (f.param.available && f.param.value > 0) {
        f.param.setValueImmediate(0);
      }
    }
    if (gpsSats.available) gpsSats.setValue(10);
    if (gpsDelay.available) gpsDelay.setValue(0);
  }, [failures, gpsSats, gpsDelay]);

  if (availableFailures.length === 0) {
    return bare ? (
      <div className="flex items-center justify-center h-full text-xs text-content-tertiary">
        {t('sitl:failurePanel.connectToInject')}
      </div>
    ) : null;
  }

  const content = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <h3 className="text-sm font-medium text-content">{t('sitl:failurePanel.title')}</h3>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-red-500/20 text-red-400">
              {t('sitl:failurePanel.activeCount', { count: activeCount })}
            </span>
          )}
        </div>
        {activeCount > 0 && (
          <button
            onClick={handleResetAll}
            className="px-2 py-1 text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded transition-colors"
          >
            {t('sitl:failurePanel.resetAll')}
          </button>
        )}
      </div>

      {/* Info text */}
      <p className="text-[10px] text-content-tertiary mb-3">
        {t('sitl:failurePanel.info')}
      </p>

      {/* Failure toggle grid */}
      <div className={`grid gap-2 mb-4 ${
        availableFailures.length <= 3 ? 'grid-cols-3' :
        availableFailures.length <= 4 ? 'grid-cols-4' : 'grid-cols-5'
      }`}>
        {failures.map((f) => (
          <FailureCard
            key={f.key}
            label={f.label}
            icon={f.icon}
            active={f.param.value > 0}
            available={f.param.available}
            fcHealthy={isFcHealthy(f.key)}
            onToggle={() => f.param.setValueImmediate(f.param.value > 0 ? 0 : 1)}
          />
        ))}
      </div>

      {/* GPS Advanced Controls */}
      {(gpsSats.available || gpsDelay.available) && (
        <div className="pt-3 border-t border-subtle">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium text-content-secondary uppercase tracking-wider">{t('sitl:failurePanel.gpsAdvanced')}</span>
            <div className="flex-1 h-px bg-surface-raised" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {gpsSats.available && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-content-secondary">{t('common:satellites')}</label>
                  <span className="text-xs font-mono text-content tabular-nums">{gpsSats.value}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={1}
                  value={gpsSats.value}
                  onChange={(e) => gpsSats.setValue(parseInt(e.target.value))}
                  className="w-full h-2 bg-surface-raised rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            )}

            {gpsDelay.available && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-content-secondary">{t('sitl:failurePanel.delay')}</label>
                  <span className="text-xs font-mono text-content tabular-nums">{t('sitl:failurePanel.delayMs', { value: gpsDelay.value })}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2000}
                  step={50}
                  value={gpsDelay.value}
                  onChange={(e) => gpsDelay.setValue(parseInt(e.target.value))}
                  className="w-full h-2 bg-surface-raised rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  if (bare) return content;

  return (
    <div className="bg-surface-input border border-subtle rounded-lg p-4">
      {content}
    </div>
  );
}
