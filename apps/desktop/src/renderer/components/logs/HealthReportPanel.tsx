import { useMemo } from 'react';
import { useLogStore } from '../../stores/log-store';
import { HealthCheckCard } from './HealthCheckCard';
import type { ExplorerPreset } from '@ardudeck/dataflash-parser';

function computeFlightStats(log: ReturnType<typeof useLogStore.getState>['currentLog']) {
  if (!log) return null;

  let maxAlt = 0, maxSpd = 0, totalMah = 0;
  let lastLat = 0, lastLng = 0, totalDist = 0, hasLastPos = false;

  const gps = log.messages['GPS'];
  if (gps) {
    for (const msg of gps) {
      const alt = msg.fields['Alt'];
      const spd = msg.fields['Spd'];
      const lat = msg.fields['Lat'];
      const lng = msg.fields['Lng'];
      if (typeof alt === 'number' && alt > maxAlt) maxAlt = alt;
      if (typeof spd === 'number' && spd > maxSpd) maxSpd = spd;
      if (typeof lat === 'number' && typeof lng === 'number' && lat !== 0 && lng !== 0) {
        if (hasLastPos) {
          // Haversine approximation for short distances
          const dLat = (lat - lastLat) * Math.PI / 180;
          const dLng = (lng - lastLng) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(lastLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
          totalDist += 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }
        lastLat = lat;
        lastLng = lng;
        hasLastPos = true;
      }
    }
  }

  const bat = log.messages['BAT'];
  if (bat && bat.length > 0) {
    const last = bat[bat.length - 1]!;
    const mah = last.fields['CurrTot'];
    if (typeof mah === 'number') totalMah = mah;
  }

  return { maxAlt, maxSpd, totalDist, totalMah };
}

export function HealthReportPanel() {
  const healthResults = useLogStore((s) => s.healthResults);
  const currentLog = useLogStore((s) => s.currentLog);
  const currentLogPath = useLogStore((s) => s.currentLogPath);

  const flightStats = useMemo(() => computeFlightStats(currentLog), [currentLog]);

  if (!healthResults || !currentLog) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        No log loaded. Download or open a .bin file first.
      </div>
    );
  }

  const meta = currentLog.metadata;
  const durationS = (currentLog.timeRange.endUs - currentLog.timeRange.startUs) / 1_000_000;
  const durationMin = durationS / 60;

  let failCount = 0, warnCount = 0, passCount = 0, skipCount = 0;
  for (const r of healthResults) {
    if (r.status === 'fail') failCount++;
    else if (r.status === 'warn') warnCount++;
    else if (r.status === 'pass') passCount++;
    else if (r.status === 'skip') skipCount++;
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Log info header */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-white font-semibold">
              {meta.firmwareString || `${meta.vehicleType} ${meta.firmwareVersion}` || 'Flight Log'}
            </h3>
            <p className="text-xs text-gray-400">
              {currentLogPath?.split('/').pop() ?? 'Unknown file'}
              {durationMin > 0 && ` \u00b7 ${durationMin.toFixed(1)} min`}
              {currentLog.messageTypes.length > 0 && ` \u00b7 ${currentLog.messageTypes.length} message types`}
            </p>
          </div>
        </div>

        {/* Summary badges */}
        <div className="flex items-center gap-3 text-xs">
          {failCount > 0 && (
            <span className="px-2 py-1 rounded bg-red-500/20 text-red-400 border border-red-500/30">
              {failCount} failed
            </span>
          )}
          {warnCount > 0 && (
            <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {warnCount} warning{warnCount > 1 ? 's' : ''}
            </span>
          )}
          {passCount > 0 && (
            <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              {passCount} passed
            </span>
          )}
        </div>

        {/* Flight stats */}
        {flightStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-700/30">
            <div>
              <div className="text-xs text-gray-500">Max Altitude</div>
              <div className="text-sm text-white font-medium">{flightStats.maxAlt.toFixed(1)} m</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Max Speed</div>
              <div className="text-sm text-white font-medium">{flightStats.maxSpd.toFixed(1)} m/s</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Distance</div>
              <div className="text-sm text-white font-medium">
                {flightStats.totalDist > 1000
                  ? `${(flightStats.totalDist / 1000).toFixed(2)} km`
                  : `${flightStats.totalDist.toFixed(0)} m`}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Battery Used</div>
              <div className="text-sm text-white font-medium">{flightStats.totalMah.toFixed(0)} mAh</div>
            </div>
          </div>
        )}
      </div>

      {/* Health check cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {healthResults
          .filter((r) => r.status !== 'skip')
          .sort((a, b) => {
            const order: Record<string, number> = { fail: 0, warn: 1, info: 2, pass: 3, skip: 4 };
            return (order[a.status] ?? 5) - (order[b.status] ?? 5);
          })
          .map((result) => (
            <HealthCheckCard
              key={result.id}
              result={result}
              onViewData={result.explorerPreset ? () => {
                const preset = result.explorerPreset as ExplorerPreset;
                const store = useLogStore.getState();
                store.setSelectedTypes(preset.types);
                for (const [type, fields] of Object.entries(preset.fields)) {
                  store.setSelectedFields(type, fields);
                }
                store.setActiveTab('explorer');
              } : undefined}
            />
          ))}
      </div>

      {/* Skipped checks */}
      {skipCount > 0 && (
        <details className="text-sm text-gray-500">
          <summary className="cursor-pointer hover:text-gray-400">
            {skipCount} check{skipCount > 1 ? 's' : ''} skipped (no data)
          </summary>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
            {healthResults.filter((r) => r.status === 'skip').map((result) => (
              <HealthCheckCard key={result.id} result={result} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
