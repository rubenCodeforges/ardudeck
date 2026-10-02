/**
 * Source configuration popover. Add a feed for the current vehicle from a
 * preset (SIYI / Herelink / RunCam / RubyFPV / RTSP / UVC / …), edit its url /
 * label / FOV, pick which configured source is live, and remove sources.
 */

import { useEffect, useState } from 'react';
import { useCameraStore, sourcesForVehicle } from '../../stores/camera-store';
import { CAMERA_PRESETS, presetById } from './camera-presets';
import { WfbngSetupGuide } from './WfbngSetupGuide';
import type { CameraSourceConfig, GimbalControlMode } from '../../../shared/camera-types';
import { DEFAULT_GIMBAL_CONFIG } from '../../../shared/camera-types';
import { useTranslation } from 'react-i18next';

interface CameraSourceMenuProps {
  vehicleKey: string | null;
  onClose: () => void;
  onOpenSettings?: (sourceId: string) => void;
}

export function CameraSourceMenu({ vehicleKey, onClose, onOpenSettings }: CameraSourceMenuProps) {
  const { t } = useTranslation();
  const store = useCameraStore();
  const sources = vehicleKey ? sourcesForVehicle(store, vehicleKey) : [];
  const selectedId = vehicleKey ? store.selectedByVehicle[vehicleKey] : undefined;
  const [presetId, setPresetId] = useState(CAMERA_PRESETS[0]?.id ?? 'mavlink');
  const [uvcDevices, setUvcDevices] = useState<MediaDeviceInfo[]>([]);

  const preset = presetById(presetId);

  useEffect(() => {
    if (preset?.kind !== 'uvc') return;
    void navigator.mediaDevices.enumerateDevices().then((d) =>
      setUvcDevices(d.filter((x) => x.kind === 'videoinput')),
    );
  }, [preset?.kind]);

  if (!vehicleKey) {
    return (
      <Shell onClose={onClose}>
        <p className="text-xs text-content-secondary">{t('camera:sourceMenu.selectVehicle')}</p>
      </Shell>
    );
  }

  const addFromPreset = (deviceId?: string) => {
    if (!preset) return;
    const source: CameraSourceConfig = {
      id: crypto.randomUUID(),
      vehicleKey,
      kind: preset.kind,
      label: preset.labelKey ? t(preset.labelKey) : preset.label,
      preset: preset.id,
      ...(preset.url ? { url: preset.url } : {}),
      ...(preset.hfovDeg ? { hfovDeg: preset.hfovDeg } : {}),
      ...(deviceId ? { deviceId } : {}),
      lowLatency: true,
    };
    store.addSource(source);
  };

  return (
    <Shell onClose={onClose}>
      {/* Add new */}
      <div className="mb-3">
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-content-secondary">{t('camera:sourceMenu.addFeed')}</div>
        <div className="flex gap-1.5">
          <select
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
            className="min-w-0 flex-1 rounded border border-default bg-surface-input px-2 py-1 text-xs text-content"
          >
            {CAMERA_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.labelKey ? t(p.labelKey) : p.label}</option>)}
          </select>
          {preset?.kind !== 'uvc' && (
            <button onClick={() => addFromPreset()} className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500">{t('common:add')}</button>
          )}
        </div>
        {preset?.noteKey && <p className="mt-1 text-[10px] leading-tight text-content-tertiary">{t(preset.noteKey)}</p>}
        {preset?.kind === 'wfbng' && <WfbngSetupGuide port={5600} />}
        {preset?.kind === 'uvc' && (
          <div className="mt-1.5 flex flex-col gap-1">
            {uvcDevices.length === 0 && <span className="text-[10px] text-content-tertiary">{t('camera:sourceMenu.noCaptureDevices')}</span>}
            {uvcDevices.map((d) => (
              <button
                key={d.deviceId}
                onClick={() => addFromPreset(d.deviceId)}
                className="rounded bg-surface-raised px-2 py-1 text-left text-[11px] text-content hover:bg-surface-raised"
              >{d.label || t('camera:sourceMenu.cameraFallback', { id: d.deviceId.slice(0, 6) })}</button>
            ))}
          </div>
        )}
      </div>

      {/* Configured sources */}
      <div className="text-[10px] font-medium uppercase tracking-wider text-content-secondary">{t('camera:sourceMenu.feedsForVehicle')}</div>
      {sources.length === 0 && <p className="mt-1 text-xs text-content-tertiary">{t('camera:sourceMenu.noneYet')}</p>}
      <div className="mt-1 flex flex-col gap-2">
        {sources.map((s) => (
          <SourceRow
            key={s.id}
            source={s}
            selected={s.id === selectedId}
            onSelect={() => store.setSelectedSource(vehicleKey, s.id)}
            onChange={(patch) => store.updateSource(s.id, patch)}
            onRemove={() => store.removeSource(s.id)}
            onOpenSettings={onOpenSettings ? () => onOpenSettings(s.id) : undefined}
          />
        ))}
      </div>

      <GimbalSection vehicleKey={vehicleKey} />
    </Shell>
  );
}

function GimbalSection({ vehicleKey }: { vehicleKey: string }) {
  const store = useCameraStore();
  const cfg = store.gimbalByVehicle[vehicleKey] ?? DEFAULT_GIMBAL_CONFIG;
  const info = store.gimbalInfo[vehicleKey];
  const { t } = useTranslation();

  return (
    <div className="mt-3 border-t border-subtle pt-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-content-secondary">{t('common:gimbal')}</div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-content">
        <label className="flex flex-1 items-center gap-1" title={t('camera:sourceMenu.controlTip')}>
          {t('camera:sourceMenu.control')}
          <select
            value={cfg.mode}
            onChange={(e) => store.setGimbalConfig(vehicleKey, { mode: e.target.value as GimbalControlMode })}
            className="min-w-0 flex-1 rounded bg-surface-input px-1 py-0.5 text-content"
          >
            <option value="auto">{t('camera:sourceMenu.modeAuto')}</option>
            <option value="manager">{t('camera:sourceMenu.modeManager')}</option>
            <option value="mount">{t('camera:sourceMenu.modeMount')}</option>
            <option value="rc">{t('camera:sourceMenu.modeRc')}</option>
            <option value="off">{t('camera:sourceMenu.modeOff')}</option>
          </select>
        </label>
        <label className="flex items-center gap-1" title={t('camera:sourceMenu.mountTip')}>
          {t('camera:sourceMenu.mount')}
          <select
            value={cfg.deviceId}
            onChange={(e) => store.setGimbalConfig(vehicleKey, { deviceId: Number(e.target.value) })}
            className="rounded bg-surface-input px-1 py-0.5 text-content"
          >
            <option value={0}>{t('common:all')}</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>
      </div>
      {info && (
        <p className="mt-1 text-[10px] text-content-tertiary">
          {t('camera:sourceMenu.detectedManager', { pitchMin: info.pitchMinDeg.toFixed(0), pitchMax: info.pitchMaxDeg.toFixed(0), yawMin: info.yawMinDeg.toFixed(0), yawMax: info.yawMaxDeg.toFixed(0) })}
        </p>
      )}
    </div>
  );
}

function SourceRow({ source, selected, onSelect, onChange, onRemove, onOpenSettings }: {
  source: CameraSourceConfig;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<CameraSourceConfig>) => void;
  onRemove: () => void;
  onOpenSettings?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={`rounded-lg border p-2 ${selected ? 'border-blue-500/60 bg-blue-500/5' : 'border-subtle bg-surface'}`}>
      <div className="flex items-center gap-2">
        <input
          type="radio"
          checked={selected}
          onChange={onSelect}
          className="accent-blue-500"
          title={t('camera:sourceMenu.makeLive')}
        />
        <input
          value={source.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="min-w-0 flex-1 rounded bg-surface-input px-1.5 py-0.5 text-xs text-content"
        />
        <button onClick={onRemove} className="text-content-tertiary hover:text-red-400" title={t('camera:sourceMenu.removeFeed')}>✕</button>
      </div>
      {source.kind !== 'uvc' && source.kind !== 'mavlink' && (
        <input
          value={source.url ?? ''}
          onChange={(e) => onChange({ url: e.target.value })}
          // i18n-exempt
          placeholder="rtsp://…"
          className="mt-1 w-full rounded bg-surface-input px-1.5 py-0.5 font-mono text-[11px] text-content"
        />
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-content-secondary">
        <span className="uppercase">{source.kind}</span>
        <label className="flex items-center gap-1">
          {/* i18n-exempt */}
          HFOV
          <input
            type="number"
            value={source.hfovDeg ?? ''}
            onChange={(e) => onChange({ hfovDeg: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="°"
            className="w-12 rounded bg-surface-input px-1 py-0.5 text-content"
            title={t('camera:sourceMenu.hfovTip')}
          />
        </label>
        {source.kind === 'wfbng' && (
          <>
            <label className="flex items-center gap-1" title={t('camera:sourceMenu.viaTip')}>
              {t('camera:sourceMenu.via')}
              <select
                value={source.wfbMode ?? 'dongle'}
                onChange={(e) => onChange({ wfbMode: e.target.value as 'dongle' | 'network' })}
                className="rounded bg-surface-input px-1 py-0.5 text-content"
              >
                <option value="dongle">{t('camera:sourceMenu.dongle')}</option>
                <option value="network">{t('camera:sourceMenu.network')}</option>
              </select>
            </label>
            <label className="flex items-center gap-1" title={t('camera:sourceMenu.codecTip')}>
              {t('camera:sourceMenu.codec')}
              <select
                value={source.wfbCodec ?? 'h265'}
                onChange={(e) => onChange({ wfbCodec: e.target.value as 'h265' | 'h264' })}
                className="rounded bg-surface-input px-1 py-0.5 text-content"
              >
                <option value="h265">H.265</option>
                <option value="h264">H.264</option>
              </select>
            </label>
            <label className="flex items-center gap-1" title={t('camera:sourceMenu.convertTip')}>
              <input
                type="checkbox"
                checked={source.wfbTranscode ?? (source.wfbCodec ?? 'h265') === 'h265'}
                onChange={(e) => onChange({ wfbTranscode: e.target.checked })}
                className="accent-blue-500"
              />
              {t('camera:sourceMenu.convert')}
            </label>
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="text-blue-400 hover:underline"
                data-tip={t('camera:sourceMenu.cameraSettingsTip')}
              >{t('camera:sourceMenu.cameraSettings')}</button>
            )}
          </>
        )}
        {(source.kind === 'rtsp' || source.kind === 'mavlink') && (
          <label className="flex items-center gap-1" title={t('camera:sourceMenu.rtspTip')}>
            RTSP
            <select
              value={source.rtspTransport ?? 'tcp'}
              onChange={(e) => onChange({ rtspTransport: e.target.value as 'automatic' | 'tcp' | 'udp' })}
              className="rounded bg-surface-input px-1 py-0.5 text-content"
            >
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
              <option value="automatic">{t('camera:sourceMenu.autoUdpFirst')}</option>
            </select>
          </label>
        )}
        <label className="ml-auto flex items-center gap-1" title={t('camera:sourceMenu.lowLatencyTip')}>
          <input type="checkbox" checked={source.lowLatency ?? false} onChange={(e) => onChange({ lowLatency: e.target.checked })} className="accent-blue-500" />
          {t('camera:sourceMenu.lowLatency')}
        </label>
      </div>
    </div>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-2 top-9 z-40 w-96 max-w-[calc(100vw-1rem)] max-h-[calc(100vh-6rem)] overflow-y-auto overflow-x-hidden rounded-xl border border-default bg-surface-solid p-3 shadow-xl">
        {children}
      </div>
    </>
  );
}
