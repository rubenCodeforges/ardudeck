import { useEffect, useState } from 'react';
import { usePseudoTxStore, rcFunctionsFromParams } from '../stores/pseudo-tx-store';
import { useParameterStore } from '../stores/parameter-store';
import { useTelemetryStore } from '../stores/telemetry-store';
import { useVehicleClass } from './useVehicleClass';
import { checkHandover, type ControlCheck } from '../utils/joystick-safety';

/** A radio reading older than this is not a radio that is flying the vehicle. */
const RADIO_FRESH_MS = 1500;

/** The handover check against what the joystick would put on the wire right now. */
export function useHandoverCheck(): ControlCheck {
  const mapping = usePseudoTxStore((s) => s.mapping);
  const channels = usePseudoTxStore((s) => s.channels);
  const params = useParameterStore((s) => s.parameters);
  const rc = useTelemetryStore((s) => s.rcChannels);
  const rcAt = useTelemetryStore((s) => s.lastRcChannels);
  const vehicleClass = useVehicleClass();
  // re-evaluate radio freshness even when no new RC frame arrives
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const liveRc = rcAt > 0 && now - rcAt < RADIO_FRESH_MS && rc.channels.length >= 4 ? rc.channels : null;
  return checkHandover(
    {
      roles: rcFunctionsFromParams(),
      vehicleClass,
      param: (name) => {
        const v = params.get(name)?.value;
        return typeof v === 'number' ? v : undefined;
      },
      liveRc,
      safeAt: mapping.map((m) => m.safeAt),
    },
    (ch) => (mapping[ch - 1] && mapping[ch - 1]!.source.kind !== 'none' ? channels[ch - 1] ?? null : null),
  );
}
