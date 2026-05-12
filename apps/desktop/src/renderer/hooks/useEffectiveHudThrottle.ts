import { useMemo } from 'react';
import { useTelemetryStore } from '../stores/telemetry-store';
import { useConnectionStore } from '../stores/connection-store';
import { getVehicleClass } from '../../shared/telemetry-types';
import { effectiveThrottleDisplayPercent } from '../../shared/telemetry-throttle-display';

/** Best-effort motor % for HUD (VFR_HUD vs SERVO_OUTPUT_RAW). */
export function useEffectiveHudThrottle(): {
  value: number;
  source: 'vfr_hud' | 'servo_pwm';
} {
  const vfrThrottle = useTelemetryStore((s) => s.vfrHud.throttle);
  const armed = useTelemetryStore((s) => s.flight.armed);
  const outputs = useTelemetryStore((s) => s.servoOutput?.outputs);
  const lastServo = useTelemetryStore((s) => s.lastServoOutput);
  const mavType = useConnectionStore((s) => s.connectionState.mavType);

  return useMemo(() => {
    const now = Date.now();
    return effectiveThrottleDisplayPercent({
      vfrThrottle,
      armed,
      servoOutputs: outputs ?? null,
      servoLastUpdateMs: lastServo,
      nowMs: now,
      vehicleClass: getVehicleClass(mavType),
    });
  }, [vfrThrottle, armed, outputs, lastServo, mavType]);
}
