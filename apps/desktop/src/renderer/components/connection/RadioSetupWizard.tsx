import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnectionStore } from '../../stores/connection-store';
import { useMessagesStore } from '../../stores/messages-store';
import { evaluateRadioPreflight, type PreflightCheck } from '../../utils/radio-preflight';
import type { ElrsModuleInfo, ElrsProgressEvent } from '../../../shared/link-doctor-types';
import { ELRS_USB_BAUD } from '../../../shared/link-doctor-types';

type Step = 'scan' | 'noradio' | 'switch' | 'connect' | 'vehicle' | 'done';

const STEP_LABELS: Array<{ key: Step[]; labelKey: string }> = [
  { key: ['scan', 'noradio'], labelKey: 'connection:radioSetup.stepFindRadio' },
  { key: ['switch'], labelKey: 'connection:radioSetup.stepRadioMode' },
  { key: ['connect'], labelKey: 'common:connect' },
  { key: ['vehicle'], labelKey: 'common:vehicle' },
  { key: ['done'], labelKey: 'common:done' },
];

type FoundRadio =
  | { kind: 'serial'; port: string; info: ElrsModuleInfo | null } // info null = port already streams MAVLink
  | { kind: 'udp'; udpPort: number; sender: string | null }; // TX Backpack (or other bridge) over WiFi

const BACKPACK_UDP_PORT = 14550;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Connect the primary link on a specific serial port and baud. */
  connectSerial: (port: string, baud: number) => Promise<boolean>;
  /** Connect the primary link as a UDP listener (WiFi backpack path). */
  connectUdpListen: (udpPort: number) => Promise<boolean>;
}

/**
 * One guided flow for using an ExpressLRS module as the telemetry radio:
 * finds the module across serial ports, switches it to MAVLink mode
 * (walking the user through unpowering the receiver), connects, then checks
 * and fixes the vehicle-side settings - so nothing is ever hunted down
 * across tabs or parameter lists.
 */
export function RadioSetupWizard({ open, onClose, connectSerial, connectUdpListen }: Props) {
  const { t } = useTranslation();
  const { connectionState, isConnecting, error: connectionError } = useConnectionStore();
  const messages = useMessagesStore((s) => s.messages);

  const [step, setStep] = useState<Step>('scan');
  const [scanStatus, setScanStatus] = useState('');
  const [scannedPorts, setScannedPorts] = useState<string[]>([]);
  const [radio, setRadio] = useState<FoundRadio | null>(null);
  const [progress, setProgress] = useState<ElrsProgressEvent | null>(null);
  const [switching, setSwitching] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [checks, setChecks] = useState<PreflightCheck[] | null>(null);
  const [paramTypes, setParamTypes] = useState<Record<string, number>>({});
  const [fixApplied, setFixApplied] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [busy, setBusy] = useState(false);

  const wasConnected = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const unsub = window.electronAPI.onElrsProgress?.((p) => setProgress(p));
    return () => {
      unsub?.();
    };
  }, []);

  // Fresh scan every time the wizard opens.
  useEffect(() => {
    if (!open) return;
    setStep('scan');
    setRadio(null);
    setFailure(null);
    setChecks(null);
    setFixApplied(false);
    setRestarting(false);
    void scanForRadio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-advance: the connect step completes when the primary link comes up;
  // a vehicle restart completes when the link drops and comes back.
  useEffect(() => {
    const connected = connectionState.isConnected ?? false;
    if (openRef.current && connected && !wasConnected.current) {
      if (step === 'connect') {
        setStep('vehicle');
        void runVehicleCheck();
      } else if (step === 'vehicle' && restarting) {
        setRestarting(false);
        void runVehicleCheck();
      }
    }
    wasConnected.current = connected;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionState.isConnected, step, restarting]);

  const scanForRadio = async () => {
    setScanStatus(t('connection:radioSetup.lookingAtPorts'));
    const all = await window.electronAPI.listPorts();
    // USB serial devices only - skips Bluetooth and debug consoles.
    const usb = all.filter((p) => p.vendorId);
    const candidates = (usb.length > 0 ? usb : all).map((p) => p.path);
    setScannedPorts(candidates);

    for (const port of candidates) {
      if (!openRef.current) return;
      try {
        setScanStatus(t('connection:radioSetup.checkingPort', { port }));
        const info = await window.electronAPI.elrsDetect(port);
        if (info) {
          setRadio({ kind: 'serial', port, info });
          setStep(info.linkMode?.value === 'MAVLink' ? 'connect' : 'switch');
          return;
        }
        const probe = await window.electronAPI.linkDoctorProbe(port, ELRS_USB_BAUD);
        if (probe.protocol === 'mavlink2' || probe.protocol === 'mavlink1') {
          setRadio({ kind: 'serial', port, info: null });
          setStep('connect');
          return;
        }
      } catch {
        // Port busy or unopenable - not our radio, keep looking.
      }
    }

    // No USB radio - listen for a WiFi backpack broadcasting MAVLink. This is
    // the only path for internal TX modules, which have no USB port at all.
    if (!openRef.current) return;
    try {
      setScanStatus(t('connection:radioSetup.listeningWifi'));
      const { diagnosis, sender } = await window.electronAPI.linkDoctorProbeUdp(BACKPACK_UDP_PORT);
      if (!openRef.current) return;
      if (diagnosis.protocol === 'mavlink2' || diagnosis.protocol === 'mavlink1') {
        setRadio({ kind: 'udp', udpPort: BACKPACK_UDP_PORT, sender });
        setStep('connect');
        return;
      }
    } catch {
      // UDP port busy - fall through to guidance.
    }
    setStep('noradio');
  };

  const startSwitch = async () => {
    if (radio?.kind !== 'serial') return;
    setSwitching(true);
    setProgress(null);
    setFailure(null);
    try {
      const result = await window.electronAPI.elrsSetLinkMode(radio.port, 'MAVLink');
      if (result.status === 'confirmed' || result.status === 'probable') {
        setStep('connect');
      } else if (result.status === 'timeout') {
        setFailure(
          t('connection:radioSetup.switchTimeout'),
        );
      }
    } catch (e) {
      setFailure(e instanceof Error ? e.message : t('connection:radioSetup.moduleStopped'));
    } finally {
      setSwitching(false);
    }
  };

  const doConnect = async () => {
    if (!radio) return;
    setFailure(null);
    const ok =
      radio.kind === 'serial'
        ? await connectSerial(radio.port, ELRS_USB_BAUD)
        : await connectUdpListen(radio.udpPort);
    if (!ok) {
      setFailure(
        radio.kind === 'serial'
          ? t('connection:radioSetup.portOpenFailed')
          : t('connection:radioSetup.wifiListenFailed'),
      );
    }
    // Success advances via the isConnected effect.
  };

  const radioLabel = radio
    ? radio.kind === 'serial'
      ? radio.port
      : `WiFi${radio.sender ? ` (${radio.sender.split(':')[0]})` : ''}`
    : '';

  const firmwareBanner = messages.find((m) => /Ardu\w+\s+V\d+\.\d+/.test(m.text))?.text ?? null;

  const runVehicleCheck = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const res = await window.electronAPI.readParameterBatch(['RC_PROTOCOLS', 'RSSI_TYPE']);
      setParamTypes(res.types ?? {});
      const result = evaluateRadioPreflight((name) => res.values[name], firmwareBanner);
      setChecks(result);
      if (result.every((c) => c.status === 'pass')) setStep('done');
    } catch (e) {
      setFailure(e instanceof Error ? e.message : t('connection:radioSetup.readFailed'));
    } finally {
      setBusy(false);
    }
  };

  const applyFixes = async () => {
    if (!checks) return;
    setBusy(true);
    setFailure(null);
    try {
      const batch = checks
        .flatMap((c) => c.fix ?? [])
        .map((f) => ({ paramId: f.param, value: f.value, type: paramTypes[f.param] ?? 6 }));
      const result = await window.electronAPI.setParameterBatch(batch);
      if ((result?.failed ?? []).length > 0) {
        setFailure(t('connection:radioPreflight.vehicleRejected', { params: result!.failed.join(', ') }));
      } else {
        setFixApplied(true);
      }
    } catch (e) {
      setFailure(e instanceof Error ? e.message : t('connection:radioPreflight.applyFailed'));
    } finally {
      setBusy(false);
    }
  };

  const restartVehicle = async () => {
    setRestarting(true);
    setFailure(null);
    try {
      await window.electronAPI.mavlinkReboot();
    } catch {
      setRestarting(false);
      setFailure(t('connection:radioSetup.restartRejected'));
    }
  };

  const close = () => {
    if (switching) void window.electronAPI.elrsCancel();
    onClose();
  };

  if (!open) return null;

  const failing = checks?.filter((c) => c.status === 'fail') ?? [];
  const fixable = failing.flatMap((c) => c.fix ?? []);
  const dot = (status: 'pass' | 'fail' | 'unknown') =>
    status === 'pass' ? 'bg-emerald-400' : status === 'fail' ? 'bg-red-400' : 'bg-gray-500';
  const spinner = (
    <svg className="w-3.5 h-3.5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="card w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
        <div className="card-body space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-content">{t('connection:radioSetup.title')}</h3>
            <button onClick={close} className="text-content-secondary hover:text-content transition-colors" aria-label={t('common:close')}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-1">
            {STEP_LABELS.map((s, i) => {
              const active = s.key.includes(step);
              const passed = STEP_LABELS.findIndex((x) => x.key.includes(step)) > i;
              return (
                <div key={s.labelKey} className="flex items-center gap-1 flex-1">
                  <div
                    className={`h-1 rounded-full flex-1 ${
                      active ? 'bg-blue-500' : passed ? 'bg-emerald-500' : 'bg-surface-raised'
                    }`}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-content-secondary -mt-2">
            {(() => {
              const current = STEP_LABELS.find((s) => s.key.includes(step));
              return current ? t(current.labelKey) : null;
            })()}
          </p>

          {failure && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-xs text-red-300">{failure}</p>
            </div>
          )}

          {step === 'scan' && (
            <div className="flex items-center gap-2 text-sm text-content-secondary py-4">
              {spinner}
              {scanStatus}
            </div>
          )}

          {step === 'noradio' && (
            <div className="space-y-3">
              <p className="text-sm text-content">{t('connection:radioSetup.noRadio')}</p>
              <div className="p-3 bg-surface-raised rounded-lg space-y-1">
                <p className="text-xs font-medium text-content">{t('connection:radioSetup.usbTitle')}</p>
                <p className="text-xs text-content-secondary">
                  {t('connection:radioSetup.usbHint')}
                  {scannedPorts.length > 0
                    ? ` ${t('connection:radioSetup.checkedPorts', { ports: scannedPorts.join(', ') })}`
                    : ` ${t('connection:radioSetup.noUsbDevices')}`}
                </p>
              </div>
              <div className="p-3 bg-surface-raised rounded-lg space-y-1">
                <p className="text-xs font-medium text-content">{t('connection:radioSetup.wifiTitle')}</p>
                <p className="text-xs text-content-secondary">
                  {t('connection:radioSetup.wifiHint')}
                </p>
              </div>
              <button onClick={() => { setStep('scan'); void scanForRadio(); }} className="btn btn-primary w-full text-sm">
                {t('connection:radioSetup.scanAgain')}
              </button>
            </div>
          )}

          {step === 'switch' && radio?.kind === 'serial' && radio.info && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs">
                <span className="text-content font-medium">{radio.info.name}</span>
                {radio.info.firmware && <span className="text-content-secondary">v{radio.info.firmware}</span>}
                <span className="px-2 py-0.5 rounded-full border text-amber-300 border-amber-500/30 bg-amber-500/10">
                  {t('connection:radioSetup.modeBadge', { mode: radio.info.linkMode?.value ?? 'Normal' })}
                </span>
              </div>
              {radio.info.firmware?.startsWith('4.0.0') && (
                <p className="text-xs text-amber-300">
                  {t('connection:radioSetup.elrs400Warning')}
                </p>
              )}
              <p className="text-sm text-content">
                {t('connection:radioSetup.needsSwitch')}
              </p>
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <p className="text-xs text-amber-200 font-medium mb-1">{t('connection:radioSetup.powerOffTitle')}</p>
                <p className="text-xs text-content-secondary">
                  {t('connection:radioSetup.powerOffHint')}
                </p>
              </div>
              {switching ? (
                <div className="p-3 bg-surface-raised rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-xs text-content">
                    {spinner}
                    {progress ? t('connection:radioSetup.switchingAttempt', { attempt: progress.attempt }) : t('connection:radioSetup.switching')}
                  </div>
                  {progress?.currentMode && progress.currentMode !== 'MAVLink' && (
                    <p className="text-xs text-content-secondary">
                      {t('connection:radioSetup.stillReports', { mode: progress.currentMode })}
                    </p>
                  )}
                  <button onClick={() => window.electronAPI.elrsCancel()} className="btn btn-secondary w-full text-xs">
                    {t('common:cancel')}
                  </button>
                </div>
              ) : (
                <button onClick={startSwitch} className="btn btn-primary w-full text-sm">
                  {t('common:start')}
                </button>
              )}
            </div>
          )}

          {step === 'connect' && (
            <div className="space-y-3">
              <p className="text-sm text-content">
                {t('connection:radioSetup.radioReady', { radio: radioLabel })}
              </p>
              <p className="text-xs text-content-secondary">
                {t('connection:radioSetup.powerBackOn')}
              </p>
              {connectionError && <p className="text-xs text-red-300">{connectionError}</p>}
              {isConnecting || connectionState.isWaitingForHeartbeat ? (
                <div className="flex items-center gap-2 text-xs text-content-secondary">
                  {spinner}
                  {t('connection:radioSetup.connectingThroughRadio')}
                </div>
              ) : (
                <button onClick={doConnect} className="btn btn-primary w-full text-sm">
                  {t('connection:radioSetup.connectThroughRadio')}
                </button>
              )}
            </div>
          )}

          {step === 'vehicle' && (
            <div className="space-y-3">
              <p className="text-sm text-content">{t('connection:radioSetup.checkingVehicle')}</p>
              {busy && (
                <div className="flex items-center gap-2 text-xs text-content-secondary">
                  {spinner}
                  {t('connection:radioSetup.readingSettings')}
                </div>
              )}
              {restarting && (
                <div className="flex items-center gap-2 text-xs text-content-secondary">
                  {spinner}
                  {t('connection:radioSetup.restartingVehicle')}
                </div>
              )}
              {checks && !busy && (
                <div className="space-y-1.5">
                  {checks.map((c) => (
                    <div key={c.id} className="flex items-start gap-2">
                      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dot(c.status)}`} />
                      <div>
                        <p className="text-xs text-content">{c.title}</p>
                        <p className="text-xs text-content-secondary">{c.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {checks && !busy && !restarting && (
                fixApplied ? (
                  <button onClick={restartVehicle} className="btn btn-primary w-full text-sm">
                    {t('connection:radioSetup.restartToFinish')}
                  </button>
                ) : fixable.length > 0 ? (
                  <button onClick={applyFixes} className="btn btn-primary w-full text-sm">
                    {t('connection:radioPreflight.fixForMe')}
                  </button>
                ) : failing.length > 0 ? (
                  <p className="text-xs text-content-secondary">
                    {t('connection:radioSetup.cannotFix')}
                  </p>
                ) : null
              )}
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-3">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <p className="text-sm text-emerald-300 font-medium">{t('connection:radioSetup.doneTitle')}</p>
                <p className="text-xs text-content-secondary mt-1">
                  {t('connection:radioSetup.doneHint', { radio: radioLabel })}
                </p>
              </div>
              <button onClick={close} className="btn btn-primary w-full text-sm">
                {t('common:close')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
