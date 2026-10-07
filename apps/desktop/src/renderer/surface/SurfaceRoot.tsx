/**
 * SurfaceRoot: the ArduDeck OS desktop surface.
 *
 * A second app instance started with `--desktop-surface` renders this instead
 * of <App/>: the telemetry map edge to edge, synthetic vision in the map's
 * built-in split, and the floating instruments, with no app chrome. The
 * ArduDeck OS shell extension pins the window to the desktop layer. It reaches
 * the vehicle through the OS link service like any other client, so it works
 * whether or not the full app is open.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPanel } from '../components/panels/MapPanel';
import { CameraPanel } from '../components/camera/CameraPanel';
import { useDetachedSubscriptions } from '../detached/useDetachedSubscriptions';
import { initializeSettings } from '../stores/settings-store';
import { useMapSplitStore } from '../stores/map-split-store';
import { useCameraStore } from '../stores/camera-store';
import { useConnectionStore } from '../stores/connection-store';
import { useTelemetryStore } from '../stores/telemetry-store';
import { useTheme } from '../hooks/useTheme';
import { GlobalTooltip } from '../components/GlobalTooltip';

/** Distinct from the app's own OS-link port (14571) so both can be attached at once. */
const SURFACE_LOCAL_PORT = 14572;
const RETRY_MS = 5000;

/** Keep connecting through the OS link until a vehicle link is up. */
function useOsLinkConnection(): 'searching' | 'connected' | 'no-service' {
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const [status, setStatus] = useState<'searching' | 'connected' | 'no-service'>('searching');

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = async (): Promise<void> => {
      if (cancelled || useConnectionStore.getState().connectionState.isConnected) return;
      const info = await window.electronAPI?.getOsIntegration?.().catch(() => null);
      if (cancelled) return;
      if (!info?.available) {
        setStatus('no-service');
      } else {
        setStatus('searching');
        const conn = useConnectionStore.getState();
        if (!conn.isConnecting) {
          await conn.connect({
            type: 'udp',
            udpMode: 'client',
            udpRemoteHost: info.clientHost,
            udpRemotePort: info.clientPort,
            udpClientLocalPort: SURFACE_LOCAL_PORT,
            protocol: 'mavlink',
          }).catch(() => false);
        }
      }
      if (!cancelled) timer = setTimeout(() => void attempt(), RETRY_MS);
    };
    void attempt();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return isConnected ? 'connected' : status;
}

/** Battery state from Chromium's Battery Status API (UPower on Linux). */
function useOnBattery(): boolean {
  const [onBattery, setOnBattery] = useState(false);
  useEffect(() => {
    let battery: { charging: boolean; addEventListener: (e: string, f: () => void) => void; removeEventListener: (e: string, f: () => void) => void } | null = null;
    const update = () => setOnBattery(!!battery && !battery.charging);
    const nav = navigator as Navigator & { getBattery?: () => Promise<typeof battery> };
    void nav.getBattery?.().then((b) => {
      battery = b;
      update();
      b?.addEventListener('chargingchange', update);
    }).catch(() => {});
    return () => battery?.removeEventListener('chargingchange', update);
  }, []);
  return onBattery;
}

/**
 * Power policy: the desktop is on screen all day, so it must cost ~nothing
 * when there is nothing to watch. Infinite CSS animations (the annunciator
 * pulse) kept the compositor drawing every vsync, ~34% CPU with no vehicle;
 * paused, ~9%. Calm when no vehicle is connected, or on battery while
 * disarmed; an armed vehicle always keeps its warnings animated.
 */
function useCalm(calm: boolean): void {
  useEffect(() => {
    document.documentElement.classList.toggle('surface-calm', calm);
  }, [calm]);
}

export type SurfaceScene = 'map-svt' | 'map' | 'svt';

function sceneFromUrl(): SurfaceScene {
  const s = new URLSearchParams(window.location.search).get('scene');
  return s === 'map' || s === 'svt' ? s : 'map-svt';
}

export function SurfaceRoot(): JSX.Element {
  const { t } = useTranslation();
  const [scene] = useState(sceneFromUrl);

  useEffect(() => {
    initializeSettings();
    // Each workspace window renders one scene (desktop-surface.ts). Apply it
    // with setState so it isn't persisted: sibling windows share localStorage.
    if (scene === 'map') useMapSplitStore.setState({ target: null });
    if (scene === 'map-svt') useMapSplitStore.setState({ target: 'camera' });
    if (scene === 'map-svt' || scene === 'svt') useCameraStore.getState().setRenderMode('synthetic');
  }, [scene]);

  useTheme();
  useDetachedSubscriptions();
  const link = useOsLinkConnection();
  const onBattery = useOnBattery();
  const armed = useTelemetryStore((s) => s.flight.armed);
  useCalm(link !== 'connected' || (onBattery && !armed));

  return (
    <div className="h-screen w-screen overflow-hidden bg-surface-base text-content relative">
      {scene === 'svt' ? <CameraPanel /> : <MapPanel />}
      {link !== 'connected' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[2000] px-3 py-1.5 rounded-full bg-surface-overlay border border-subtle text-xs text-content-secondary pointer-events-none">
          {link === 'no-service' ? t('detached:surface.linkServiceOff') : t('detached:surface.searching')}
        </div>
      )}
      <GlobalTooltip />
    </div>
  );
}
