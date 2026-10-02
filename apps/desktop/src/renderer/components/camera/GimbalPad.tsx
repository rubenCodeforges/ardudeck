/**
 * Gimbal + zoom control strip. Behaviour follows the operator's per-vehicle
 * gimbal setup (camera-store.gimbalByVehicle):
 *   - manager / auto : drag = rate-slew (release stops), via DO_GIMBAL_MANAGER_PITCHYAW
 *   - mount          : drag = absolute aim within limits (release holds), via DO_MOUNT_CONTROL
 *   - rc             : read-only — the mount is flown from the transmitter
 *   - off            : not rendered (CameraPanel hides the footer)
 * Commands target the configured gimbal device id (0 = all, 1 = MNT1, 2 = MNT2).
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import type { GimbalCommand } from '../../../shared/camera-types';
import { DEFAULT_GIMBAL_CONFIG } from '../../../shared/camera-types';
import { useCameraStore } from '../../stores/camera-store';
import { useTranslation } from 'react-i18next';

interface GimbalPadProps {
  vehicleKey: string | null;
  /** Max slew rate at full deflection (manager mode), deg/s. */
  maxRate?: number;
}

export function GimbalPad({ vehicleKey, maxRate = 30 }: GimbalPadProps) {
  const { t } = useTranslation();
  const padRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [dot, setDot] = useState({ x: 0.5, y: 0.5 });

  const cfg = useCameraStore((s) => (vehicleKey ? s.gimbalByVehicle[vehicleKey] : undefined)) ?? DEFAULT_GIMBAL_CONFIG;
  const info = useCameraStore((s) => (vehicleKey ? s.gimbalInfo[vehicleKey] : undefined));
  const isMount = cfg.mode === 'mount';
  const readOnly = cfg.mode === 'rc';

  // Travel limits for absolute (mount) aiming — discovered if advertised, else sane defaults.
  const pitchMax = Math.abs(info?.pitchMaxDeg ?? 90);
  const yawMax = Math.abs(info?.yawMaxDeg ?? 160);

  const send = useCallback((cmd: GimbalCommand) => {
    if (!vehicleKey || readOnly) return;
    void window.electronAPI.cameraGimbalCommand(vehicleKey, cmd);
  }, [vehicleKey, readOnly]);

  // nx,ny in [-1,1]; up = look up.
  const aim = useCallback((nx: number, ny: number) => {
    if (isMount) {
      send({ kind: 'pitchyaw', via: 'mount', deviceId: cfg.deviceId, pitchDeg: -ny * pitchMax, yawDeg: nx * yawMax });
    } else {
      send({ kind: 'pitchyaw', via: 'manager', deviceId: cfg.deviceId, rate: true, pitchDeg: -ny * maxRate, yawDeg: nx * maxRate });
    }
  }, [isMount, send, cfg.deviceId, pitchMax, yawMax, maxRate]);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    const el = padRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const rx = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const ry = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    setDot({ x: rx, y: ry });
    aim(rx * 2 - 1, ry * 2 - 1);
  }, [aim]);

  useEffect(() => {
    if (!active) return;
    const move = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const up = () => {
      setActive(false);
      if (isMount) {
        // Absolute aim holds where released — leave the dot in place.
      } else {
        setDot({ x: 0.5, y: 0.5 });
        send({ kind: 'pitchyaw', via: 'manager', deviceId: cfg.deviceId, rate: true, pitchDeg: 0, yawDeg: 0 });
      }
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
  }, [active, handleMove, send, isMount, cfg.deviceId]);

  const disabled = !vehicleKey || readOnly;

  return (
    <div className="flex items-center gap-2">
      <div
        ref={padRef}
        onMouseDown={(e) => { if (!disabled) { setActive(true); handleMove(e.clientX, e.clientY); } }}
        className={`relative h-16 w-16 rounded-lg border border-default bg-surface-base ${disabled ? 'opacity-40' : 'cursor-crosshair'}`}
        title={readOnly ? t('camera:gimbalPad.rcTip') : isMount ? t('camera:gimbalPad.aimTip') : t('camera:gimbalPad.slewTip')}
      >
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="absolute h-full w-px bg-border opacity-40" />
          <div className="absolute h-px w-full bg-border opacity-40" />
        </div>
        <div
          className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500 shadow"
          style={{ left: `${dot.x * 100}%`, top: `${dot.y * 100}%` }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <button
          disabled={disabled}
          onClick={() => send({ kind: 'center', deviceId: cfg.deviceId })}
          className="rounded bg-surface-raised px-2 py-1 text-[11px] text-content hover:bg-surface-raised disabled:opacity-40"
          title={t('camera:gimbalPad.centerTip')}
        >{t('common:center')}</button>
        <button
          disabled={disabled}
          onClick={() => send({ kind: 'roi-none' })}
          className="rounded bg-surface-raised px-2 py-1 text-[11px] text-content hover:bg-surface-raised disabled:opacity-40"
          title={t('camera:gimbalPad.roiOffTip')}
        >{t('camera:gimbalPad.roiOff')}</button>
      </div>

      <div className="flex flex-col gap-1">
        <ZoomHoldButton vehicleKey={vehicleKey} direction={1} label={t('camera:gimbalPad.zoomIn')} title={t('camera:gimbalPad.zoomInTip')} />
        <ZoomHoldButton vehicleKey={vehicleKey} direction={-1} label={t('camera:gimbalPad.zoomOut')} title={t('camera:gimbalPad.zoomOutTip')} />
      </div>

      {readOnly && <span className="text-[10px] text-content-tertiary">{t('camera:gimbalPad.rcDriven')}</span>}
    </div>
  );
}

/** Zooms while held. Any way the hold can end (release, cancel, blur, unmount) sends the stop. */
function ZoomHoldButton({ vehicleKey, direction, label, title }: { vehicleKey: string | null; direction: 1 | -1; label: string; title: string }) {
  const zoomingRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    const key = zoomingRef.current;
    if (!key) return;
    zoomingRef.current = null;
    void window.electronAPI.cameraCameraCommand(key, { kind: 'zoom', mode: 'continuous', value: 0 });
  }, []);

  useEffect(() => {
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('blur', stop);
      stop();
    };
  }, [stop]);

  return (
    <button
      disabled={!vehicleKey}
      onPointerDown={(e) => {
        if (!vehicleKey || e.button !== 0) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        zoomingRef.current = vehicleKey;
        void window.electronAPI.cameraCameraCommand(vehicleKey, { kind: 'zoom', mode: 'continuous', value: direction });
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      className="rounded bg-surface-raised px-2 py-1 text-[11px] text-content hover:bg-surface-raised disabled:opacity-40 select-none touch-none"
      title={title}
    >{label}</button>
  );
}
