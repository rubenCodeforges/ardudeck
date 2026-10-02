/**
 * OSD Sync Bar
 *
 * The device row: shows what the editor is targeting (Simulator / ArduPilot /
 * Betaflight-iNav), the ArduPilot screen tabs, and the Load / Upload actions
 * that read the layout from the flight controller and write it back. Also hosts
 * the local preset menu. This is the bar that makes the editor "real".
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOsdStore } from '../../stores/osd-store';
import { useConnectionStore } from '../../stores/connection-store';
import { AP_OSD_SCREENS } from '../../utils/osd/ardupilot-osd';

export function OsdSyncBar() {
  const { t } = useTranslation();
  const target = useOsdStore((s) => s.target);
  const screen = useOsdStore((s) => s.screen);
  const availableScreens = useOsdStore((s) => s.availableScreens);
  const fc = useOsdStore((s) => s.fc);
  const setScreen = useOsdStore((s) => s.setScreen);
  const readFromFc = useOsdStore((s) => s.readFromFc);
  const uploadToFc = useOsdStore((s) => s.uploadToFc);
  const uploadFontToFc = useOsdStore((s) => s.uploadFontToFc);
  const refreshTarget = useOsdStore((s) => s.refreshTarget);

  const connectionState = useConnectionStore((s) => s.connectionState);

  // Keep the target in sync with the connection.
  useEffect(() => {
    refreshTarget();
  }, [connectionState.isConnected, connectionState.protocol, connectionState.autopilot, connectionState.fcVariant, refreshTarget]);

  const offline = target === 'none';
  const deviceLabel =
    target === 'ardupilot'
      ? `ArduPilot${connectionState.vehicleType ? ` ${connectionState.vehicleType}` : ''}`
      : target === 'msp'
        ? connectionState.fcVariant || 'Betaflight / iNAV'
        : t('osd:osdSyncBar.simulator');

  const screens = availableScreens.length > 0 ? availableScreens : [...AP_OSD_SCREENS];

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-subtle bg-surface shrink-0 flex-wrap">
      {/* Device pill */}
      <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface-raised border border-subtle">
        <span
          className={`w-1.5 h-1.5 rounded-full ${offline ? 'bg-content-tertiary' : 'bg-green-500 animate-pulse'}`}
          aria-hidden
        />
        <span className="text-xs font-medium text-content">{deviceLabel}</span>
      </div>

      {/* ArduPilot screen tabs */}
      {target === 'ardupilot' && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-content-secondary uppercase tracking-wide">{t('osd:osdSyncBar.screen')}</span>
          <div className="flex items-center gap-0.5 rounded-lg border border-subtle p-0.5 bg-surface-raised">
            {screens.map((s) => (
              <button
                key={s}
                onClick={() => setScreen(s)}
                className={`w-6 h-6 text-[11px] font-medium rounded-md transition-colors ${
                  s === screen ? 'bg-blue-600/80 text-white' : 'text-content-secondary hover:text-content hover:bg-surface'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Load / Upload */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => void readFromFc()}
          disabled={offline || fc.busy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-subtle bg-surface-raised hover:bg-surface text-content disabled:opacity-40 disabled:cursor-not-allowed"
          data-tip={offline ? t('osd:osdSyncBar.connectFirst') : t('osd:osdSyncBar.loadTip')}
        >
          <DownloadIcon /> {t('osd:osdSyncBar.loadFromFc')}
        </button>
        <UploadButton offline={offline} busy={fc.busy} onUpload={uploadToFc} label={t('osd:osdSyncBar.uploadLayout')} confirmLabel={t('osd:osdSyncBar.confirmLayout')} tip={offline ? t('osd:osdSyncBar.connectFirst') : t('osd:osdSyncBar.uploadLayoutTip')} />
        {target === 'msp' && (
          <UploadButton offline={offline} busy={fc.busy} onUpload={uploadFontToFc} label={t('osd:osdSyncBar.uploadFont')} confirmLabel={t('osd:osdSyncBar.confirmFont')} tip={t('osd:osdSyncBar.uploadFontTip')} />
        )}
      </div>

      {/* Progress / status */}
      {fc.progress && (
        <div className="flex items-center gap-2 min-w-[140px]">
          <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${fc.progress.total ? (fc.progress.done / fc.progress.total) * 100 : 0}%` }}
            />
          </div>
          <span className="text-[10px] text-content-secondary tabular-nums">
            {fc.progress.done}/{fc.progress.total}
          </span>
        </div>
      )}
      {fc.message && !fc.progress && (
        <span className={`text-[11px] ${fc.error ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
          {fc.message}
        </span>
      )}

      <div className="flex-1" />

      <PresetMenu />
    </div>
  );
}

/** Two-step upload button to guard against accidental writes to the FC. */
function UploadButton({
  offline,
  busy,
  onUpload,
  label,
  confirmLabel,
  tip,
}: {
  offline: boolean;
  busy: boolean;
  onUpload: () => Promise<boolean>;
  label: string;
  confirmLabel: string;
  tip: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const click = () => {
    if (!confirming) {
      setConfirming(true);
      timer.current = setTimeout(() => setConfirming(false), 3000);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setConfirming(false);
    void onUpload();
  };

  return (
    <button
      onClick={click}
      disabled={offline || busy}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        confirming ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-blue-600/80 text-white hover:bg-blue-500/80'
      }`}
      data-tip={tip}
    >
      <UploadIcon />
      {confirming ? confirmLabel : label}
    </button>
  );
}

function PresetMenu() {
  const { t } = useTranslation();
  const presets = useOsdStore((s) => s.presets);
  const savePreset = useOsdStore((s) => s.savePreset);
  const loadPreset = useOsdStore((s) => s.loadPreset);
  const deletePreset = useOsdStore((s) => s.deletePreset);
  const resetElementPositions = useOsdStore((s) => s.resetElementPositions);
  const autoArrangeToCanvas = useOsdStore((s) => s.autoArrangeToCanvas);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const names = Object.keys(presets);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-subtle bg-surface-raised hover:bg-surface text-content"
      >
        {t('osd:osdSyncBar.layouts')}
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 bg-surface-raised border border-subtle rounded-lg shadow-2xl z-50 p-2">
          <div className="flex gap-1.5 mb-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) {
                  savePreset(name);
                  setName('');
                }
              }}
              placeholder={t('osd:osdSyncBar.saveCurrentAs')}
              className="flex-1 bg-surface-input text-content text-xs rounded-lg px-2.5 py-1.5 border border-subtle focus:border-blue-500 focus:outline-none placeholder-content-tertiary"
            />
            <button
              onClick={() => { if (name.trim()) { savePreset(name); setName(''); } }}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-blue-600/80 hover:bg-blue-500/80 text-white disabled:opacity-40"
              disabled={!name.trim()}
            >
              {t('common:save')}
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto">
            {names.length === 0 ? (
              <p className="text-[10px] text-content-tertiary px-1 py-2">{t('osd:osdSyncBar.noSavedLayouts')}</p>
            ) : (
              names.map((n) => (
                <div key={n} className="flex items-center gap-1 group">
                  <button
                    onClick={() => { loadPreset(n); setOpen(false); }}
                    className="flex-1 text-left text-xs px-2 py-1.5 rounded hover:bg-surface-overlay-subtle text-content truncate"
                  >
                    {n}
                  </button>
                  <button
                    onClick={() => deletePreset(n)}
                    className="px-1.5 py-1 text-content-tertiary hover:text-red-500"
                    data-tip={t('osd:osdSyncBar.deleteLayout')}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-subtle mt-2 pt-2">
            <button
              onClick={() => { autoArrangeToCanvas(); setOpen(false); }}
              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-surface-overlay-subtle text-content"
            >
              {t('osd:osdSyncBar.autoArrange')}
            </button>
            <button
              onClick={() => { resetElementPositions(); setOpen(false); }}
              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-surface-overlay-subtle text-content-secondary"
            >
              {t('osd:osdSyncBar.resetDefaults')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 21V9m0 0l-4 4m4-4l4 4M5 3h14" />
    </svg>
  );
}
