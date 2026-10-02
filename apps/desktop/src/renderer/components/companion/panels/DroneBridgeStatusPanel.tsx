import { useEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useCompanionStore } from '../../../stores/companion-store';
import { PanelContainer, StatRow, SectionTitle } from '../../panels/panel-utils';
import { formatDbVersion, esp32ModeLabel } from '../../../../shared/dronebridge-types';
import type { DroneBridgeStation } from '../../../../shared/dronebridge-types';
import { useTranslation } from 'react-i18next';

/** Map chip model ID to human-readable name */
function chipModelName(id: number, t: TFunction): string {
  const models: Record<number, string> = {
    1: 'ESP32',
    2: 'ESP32-S2',
    5: 'ESP32-C3',
    6: 'ESP32-S3',
    12: 'ESP32-C2',
    13: 'ESP32-C6',
    16: 'ESP32-H2',
  };
  return models[id] ?? t('companion:dbStatus.unknownId', { id });
}

function formatBytesPerSec(bps: number): string {
  if (bps < 1024) return `${Math.round(bps)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

function SignalBars({ rssi }: { rssi: number }) {
  // rssi is in dBm, typically -30 (excellent) to -90 (weak)
  const quality = rssi > -50 ? 4 : rssi > -60 ? 3 : rssi > -70 ? 2 : 1;
  const color = quality >= 3 ? 'bg-emerald-400' : quality >= 2 ? 'bg-yellow-400' : 'bg-red-400';

  return (
    <div className="flex items-end gap-0.5 h-4">
      {[1, 2, 3, 4].map((level) => (
        <div
          key={level}
          className={`w-1 rounded-sm ${level <= quality ? color : 'bg-surface-raised'}`}
          style={{ height: `${level * 25}%` }}
        />
      ))}
      <span className="text-[10px] text-content-secondary ml-1">{rssi} dBm</span>
    </div>
  );
}

function StationRow({ station }: { station: DroneBridgeStation }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-content font-mono">{station.sta_mac}</span>
      <SignalBars rssi={station.sta_rssi} />
    </div>
  );
}

export function DroneBridgeStatusPanel() {
  const { t } = useTranslation();
  const droneBridgeIp = useCompanionStore((s) => s.droneBridgeIp);
  const droneBridgeInfo = useCompanionStore((s) => s.droneBridgeInfo);
  const droneBridgeStats = useCompanionStore((s) => s.droneBridgeStats);
  const setDroneBridgeInfo = useCompanionStore((s) => s.setDroneBridgeInfo);
  const setDroneBridgeStats = useCompanionStore((s) => s.setDroneBridgeStats);

  const [mode, setMode] = useState<number | null>(null);
  const [reachable, setReachable] = useState(false);

  const prevBytesRef = useRef<number | null>(null);
  const prevTimeRef = useRef<number | null>(null);
  const [throughput, setThroughput] = useState(0);

  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch info when IP becomes available, with retries for freshly flashed devices
  useEffect(() => {
    if (!droneBridgeIp) return;
    let cancelled = false;

    const fetchAll = async (retries = 5) => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (cancelled) return;

        try {
          const info = await window.electronAPI.dronebridgeGetInfo(droneBridgeIp);
          if (info) {
            setDroneBridgeInfo(info);
            setReachable(true);
            setFetchError(null);

            // Also fetch settings for mode
            const settings = await window.electronAPI.dronebridgeGetSettings(droneBridgeIp);
            if (settings) setMode(settings.esp32_mode);
            return;
          }
        } catch {
          // will retry
        }

        // Device might still be booting — wait before retrying
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }

      if (!cancelled) {
        setReachable(false);
        setFetchError(t('companion:dbStatus.unreachable', { ip: droneBridgeIp }));
      }
    };

    fetchAll();
    return () => { cancelled = true; };
  }, [droneBridgeIp, setDroneBridgeInfo]);

  // Poll stats every 2 seconds
  useEffect(() => {
    if (!droneBridgeIp) return;

    const fetchStats = async () => {
      try {
        const stats = await window.electronAPI.dronebridgeGetStats(droneBridgeIp);
        if (!stats) {
          setReachable(false);
          return;
        }
        setDroneBridgeStats(stats);
        setReachable(true);
        setFetchError(null);

        // Compute throughput
        const now = Date.now();
        if (prevBytesRef.current !== null && prevTimeRef.current !== null) {
          const dt = (now - prevTimeRef.current) / 1000;
          if (dt > 0) {
            const bytesDiff = stats.read_bytes - prevBytesRef.current;
            setThroughput(bytesDiff / dt);
          }
        }
        prevBytesRef.current = stats.read_bytes;
        prevTimeRef.current = now;
      } catch {
        setReachable(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, [droneBridgeIp, setDroneBridgeStats]);

  // No IP set — parent (DroneBridgeTab) handles this state
  if (!droneBridgeIp) {
    return (
      <PanelContainer>
        <div className="flex items-center justify-center h-full text-xs text-content-tertiary">
          {t('companion:dbStatus.noIp')}
        </div>
      </PanelContainer>
    );
  }

  const totalClients = (droneBridgeStats?.tcp_connected ?? 0) + (droneBridgeStats?.udp_connected ?? 0);

  return (
    <PanelContainer>
      <div className="space-y-4">
        {/* Connection indicator */}
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full shrink-0 ${reachable ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <div>
            <div className={`text-sm font-medium ${reachable ? 'text-emerald-400' : 'text-red-400'}`}>
              {reachable ? t('common:connected') : t('common:connecting')}
            </div>
            <div className="text-xs text-content-secondary font-mono">{droneBridgeIp}</div>
            {!reachable && fetchError && (
              <div className="text-[10px] text-red-400/70 mt-0.5">{fetchError}</div>
            )}
          </div>
        </div>

        {/* Firmware info */}
        {droneBridgeInfo && (
          <div className="space-y-1">
            <SectionTitle>{t('common:firmware')}</SectionTitle>
            <StatRow label={t('common:version')} value={formatDbVersion(droneBridgeInfo)} />
            <StatRow label={t('companion:dbStatus.chip')} value={chipModelName(droneBridgeInfo.esp_chip_model, t)} />
            <StatRow label="MAC" value={droneBridgeInfo.esp_mac} />
            <StatRow label="IDF" value={droneBridgeInfo.idf_version} />
            {mode !== null && (
              <StatRow label={t('common:mode')} value={esp32ModeLabel(mode) ?? t('companion:dbStatus.unknownId', { id: mode })} />
            )}
          </div>
        )}

        {/* WiFi signal */}
        {droneBridgeStats && droneBridgeStats.esp_rssi !== 0 && (
          <div className="space-y-1">
            <SectionTitle>{t('companion:dbStatus.wifiSignal')}</SectionTitle>
            <div className="flex items-center justify-between">
              <span className="text-xs text-content-secondary">RSSI</span>
              <SignalBars rssi={droneBridgeStats.esp_rssi} />
            </div>
          </div>
        )}

        {/* Throughput */}
        {droneBridgeStats && (
          <div className="space-y-1">
            <SectionTitle>{t('companion:dbStatus.throughput')}</SectionTitle>
            <StatRow label={t('companion:dbStatus.serialRx')} value={formatBytesPerSec(throughput)} />
            <StatRow label={t('companion:dbStatus.mavlinkMsgs')} value={droneBridgeStats.serial_dec_mav_msgs} />
            <StatRow label={t('companion:dbStatus.totalBytes')} value={droneBridgeStats.read_bytes.toLocaleString()} />
          </div>
        )}

        {/* Connected clients */}
        {droneBridgeStats && (
          <div className="space-y-1">
            <SectionTitle>{t('companion:dbStatus.clients', { count: totalClients })}</SectionTitle>
            <StatRow label="TCP" value={droneBridgeStats.tcp_connected} />
            <StatRow label="UDP" value={droneBridgeStats.udp_connected} />

            {droneBridgeStats.udp_clients.length > 0 && (
              <div className="mt-1.5 p-2 bg-surface-raised rounded-lg">
                <div className="text-[10px] text-content-tertiary uppercase tracking-wider mb-1">{t('companion:dbStatus.udpClients')}</div>
                {droneBridgeStats.udp_clients.map((client) => (
                  <div key={client} className="text-xs text-content-secondary font-mono py-0.5">{client}</div>
                ))}
              </div>
            )}

            {droneBridgeStats.connected_sta.length > 0 && (
              <div className="mt-1.5 p-2 bg-surface-raised rounded-lg">
                <div className="text-[10px] text-content-tertiary uppercase tracking-wider mb-1">{t('companion:dbStatus.stations')}</div>
                {droneBridgeStats.connected_sta.map((sta) => (
                  <StationRow key={sta.sta_mac} station={sta} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </PanelContainer>
  );
}
