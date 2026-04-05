import { useMemo, useCallback, useState } from 'react';
import { useLogStore } from '../../stores/log-store';
import { useSettingsStore } from '../../stores/settings-store';
import { HealthCheckCard } from './HealthCheckCard';
import { AiWarningDialog } from './AiAnalysisPanel';
import type { ExplorerPreset, HealthCheckResult } from '@ardudeck/dataflash-parser';

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
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const aiWarningDismissed = useSettingsStore((s) => s.aiWarningDismissed);
  const aiInsightCards = useLogStore((s) => s.aiInsightCards);
  const isAiInsightLoading = useLogStore((s) => s.isAiInsightLoading);
  const aiInsightError = useLogStore((s) => s.aiInsightError);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const requireWarning = useCallback((action: () => void) => {
    if (aiWarningDismissed) {
      action();
    } else {
      setPendingAction(() => action);
    }
  }, [aiWarningDismissed]);

  const flightStats = useMemo(() => computeFlightStats(currentLog), [currentLog]);

  const handleAiAnalyze = useCallback(async () => {
    if (!aiProvider || !currentLog || !healthResults) return;
    const store = useLogStore.getState();
    store.setIsAiInsightLoading(true);
    store.setAiInsightError(null);

    const stats = computeFlightStats(currentLog) ?? { maxAlt: 0, maxSpd: 0, totalDist: 0, totalMah: 0 };
    const meta = currentLog.metadata;
    const dS = (currentLog.timeRange.endUs - currentLog.timeRange.startUs) / 1_000_000;
    const dist = stats.totalDist > 1000 ? `${(stats.totalDist / 1000).toFixed(2)} km` : `${stats.totalDist.toFixed(0)} m`;

    const systemContext = `You are a flight log analyst for ArduPilot vehicles. Analyze this flight and return ONLY a JSON array of insight cards. No other text.

## This Flight
- Vehicle: ${meta.vehicleType || 'Unknown'} running ${meta.firmwareString || meta.firmwareVersion || 'Unknown firmware'}
- Duration: ${(dS / 60).toFixed(1)} minutes
- Max Altitude: ${stats.maxAlt.toFixed(1)} m | Max Speed: ${stats.maxSpd.toFixed(1)} m/s
- Distance: ${dist} | Battery Used: ${stats.totalMah.toFixed(0)} mAh

## Automated Health Check Results
${JSON.stringify(healthResults, null, 2)}

## Response Format
Return a JSON array of objects with these fields:
- "id": unique string identifier (e.g. "ai-battery-analysis")
- "name": short card title (e.g. "Battery Deep Dive")
- "status": one of "fail", "warn", "info", "pass"
- "summary": one-line finding
- "details": supporting data/numbers
- "recommendation": actionable advice with ArduPilot parameter names where applicable

Focus on insights the automated checks might miss:
- Correlations between issues (e.g. vibration causing GPS problems)
- Parameter tuning suggestions with specific values
- Flight pattern analysis and efficiency
- Predictive maintenance concerns
- Overall flight safety assessment

Return 3-6 cards. Most important issues first.`;

    const result = await window.electronAPI?.logAiAnalyze({
      provider: aiProvider,
      messages: [{ role: 'user', content: 'Analyze this flight log and generate insight cards.' }],
      systemContext,
    });

    store.setIsAiInsightLoading(false);
    if (result?.success && result.response) {
      try {
        const jsonStr = result.response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(jsonStr) as HealthCheckResult[];
        store.setAiInsightCards(parsed);
      } catch {
        store.setAiInsightError('Failed to parse AI response');
      }
    } else {
      store.setAiInsightError(result?.error ?? 'AI analysis failed');
    }
  }, [aiProvider, currentLog, healthResults]);

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

  const handleAskAi = (question: string) => {
    const store = useLogStore.getState();
    store.addAiMessage({ role: 'user', content: question });
    store.setActiveTab('ai');
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {pendingAction && (
        <AiWarningDialog
          onAccept={(dismiss) => {
            if (dismiss) useSettingsStore.getState().setAiWarningDismissed(true);
            pendingAction();
            setPendingAction(null);
          }}
          onCancel={() => setPendingAction(null)}
        />
      )}

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

        {/* AI Analyze button */}
        {aiProvider && (
          <div className="mt-4 pt-4 border-t border-gray-700/30">
            {aiInsightCards.length > 0 ? (
              <button
                onClick={() => requireWarning(handleAiAnalyze)}
                disabled={isAiInsightLoading}
                className="text-xs px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 hover:text-purple-300 border border-purple-500/20 rounded-lg transition-colors disabled:opacity-50"
              >
                {isAiInsightLoading ? 'Re-analyzing...' : 'Re-analyze with AI'}
              </button>
            ) : (
              <button
                onClick={() => requireWarning(handleAiAnalyze)}
                disabled={isAiInsightLoading}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/25 rounded-lg transition-colors disabled:opacity-50"
              >
                {isAiInsightLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">Analyzing flight...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    <span className="text-sm">Analyze log with AI</span>
                  </>
                )}
              </button>
            )}
            {aiInsightError && (
              <p className="text-xs text-red-400 mt-2">{aiInsightError}</p>
            )}
          </div>
        )}
      </div>

      {/* AI insight cards (above automated checks) */}
      {(aiInsightCards.length > 0 || isAiInsightLoading) && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            <h3 className="text-sm font-semibold text-purple-300">AI Insights</h3>
            <span className="text-[10px] text-amber-400/60 ml-auto">Experimental - verify before applying</span>
          </div>
          {isAiInsightLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="bg-purple-500/5 rounded-xl border border-purple-500/15 p-4 animate-pulse">
                  <div className="h-4 bg-purple-500/10 rounded w-1/3 mb-3" />
                  <div className="h-3 bg-purple-500/10 rounded w-full mb-2" />
                  <div className="h-3 bg-purple-500/10 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {aiInsightCards.map((card) => (
                <HealthCheckCard
                  key={card.id}
                  result={card}
                  aiLabel="Ask AI"
                  onAskAi={aiProvider
                    ? () => handleAskAi(`Regarding the "${card.name}" finding: ${card.summary}${card.details ? `\nDetails: ${card.details}` : ''}${card.recommendation ? `\nRecommendation was: ${card.recommendation}` : ''}\n\nCan you explain this further and suggest specific steps to address it?`)
                    : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Automated health check cards */}
      {(aiInsightCards.length > 0 || isAiInsightLoading) && (
        <div className="flex items-center gap-2 mb-0">
          <h3 className="text-sm font-semibold text-gray-400">Automated Checks</h3>
        </div>
      )}
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
              onAskAi={aiProvider && (result.status === 'fail' || result.status === 'warn')
                ? () => handleAskAi(`Analyze the ${result.name} issue in detail:\nStatus: ${result.status}\nSummary: ${result.summary}${result.details ? `\nDetails: ${result.details}` : ''}${result.recommendation ? `\nRecommendation: ${result.recommendation}` : ''}\n\nWhat's the likely cause and how do I fix it?`)
                : undefined}
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
