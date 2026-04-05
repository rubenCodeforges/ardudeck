import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLogStore } from '../../stores/log-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useParameterStore } from '../../stores/parameter-store';

/** AI disclaimer dialog shown before first AI interaction */
export function AiWarningDialog({ onAccept, onCancel }: { onAccept: (dismiss: boolean) => void; onCancel: () => void }) {
  const [dontShow, setDontShow] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-gray-800 rounded-xl border border-gray-700/50 w-full max-w-md mx-4 shadow-2xl">
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">AI Analysis is Experimental</h3>
              <div className="text-xs text-gray-400 mt-2 leading-relaxed space-y-2">
                <p>AI-generated suggestions may be inaccurate or inappropriate for your specific vehicle and configuration.</p>
                <p>Always verify parameter recommendations against ArduPilot documentation before applying. Incorrect parameters can lead to loss of vehicle control.</p>
                <p className="text-amber-400/80">You are solely responsible for any changes applied to your flight controller.</p>
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 mt-4 ml-11 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-900/50 text-purple-500 focus:ring-purple-500/30 focus:ring-offset-0 cursor-pointer"
            />
            <span className="text-xs text-gray-500">Don't show this again</span>
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-700/40">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700/40 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onAccept(dontShow)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-purple-600 hover:bg-purple-500 transition-colors"
          >
            I understand
          </button>
        </div>
      </div>
    </div>
  );
}

/** Parsed parameter suggestion from AI response */
interface ParamSuggestion {
  name: string;
  value: number;
}

/** Parse :::param NAME=VALUE::: markers from AI response */
function parseParamSuggestions(text: string): ParamSuggestion[] {
  const params: ParamSuggestion[] = [];
  const regex = /:::param\s+(\w+)\s*=\s*([\d.eE+-]+)\s*:::/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    params.push({ name: m[1]!, value: parseFloat(m[2]!) });
  }
  return params;
}

/** Strip param markers from text for display */
function stripParamMarkers(text: string): string {
  return text.replace(/:::param\s+\w+\s*=\s*[\d.eE+-]+\s*:::/g, '').replace(/\n{3,}/g, '\n\n');
}

/** Block-based markdown to HTML */
function renderMarkdown(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  const escaped = esc(md);
  const blocks = escaped.split(/\n{2,}/);

  return blocks.map(block => {
    const lines = block.split('\n').filter(l => l.trim());
    if (!lines.length) return '';

    if (lines.length === 1) {
      const h = lines[0]!;
      const m3 = h.match(/^### (.+)$/);
      if (m3) return `<h3>${inline(m3[1]!)}</h3>`;
      const m2 = h.match(/^## (.+)$/);
      if (m2) return `<h2>${inline(m2[1]!)}</h2>`;
      const m1 = h.match(/^# (.+)$/);
      if (m1) return `<h1>${inline(m1[1]!)}</h1>`;
    }

    const allList = lines.every(l => /^[-*] /.test(l.trim()) || /^\d+\. /.test(l.trim()));
    if (allList) {
      const items = lines.map(l => {
        const text = l.trim().replace(/^[-*] /, '').replace(/^\d+\. /, '');
        return `<li>${inline(text)}</li>`;
      });
      return `<ul>${items.join('')}</ul>`;
    }

    const parts: string[] = [];
    let listBuf: string[] = [];
    const flushList = () => {
      if (listBuf.length) {
        parts.push(`<ul>${listBuf.map(l => `<li>${inline(l)}</li>`).join('')}</ul>`);
        listBuf = [];
      }
    };
    for (const line of lines) {
      const trimmed = line.trim();
      const li = trimmed.match(/^[-*] (.+)$/) ?? trimmed.match(/^\d+\. (.+)$/);
      if (li) {
        listBuf.push(li[1]!);
      } else {
        flushList();
        const h3 = trimmed.match(/^### (.+)$/);
        const h2 = trimmed.match(/^## (.+)$/);
        const h1 = trimmed.match(/^# (.+)$/);
        if (h3) parts.push(`<h3>${inline(h3[1]!)}</h3>`);
        else if (h2) parts.push(`<h2>${inline(h2[1]!)}</h2>`);
        else if (h1) parts.push(`<h1>${inline(h1[1]!)}</h1>`);
        else parts.push(`<p>${inline(trimmed)}</p>`);
      }
    }
    flushList();
    return parts.join('');
  }).join('');
}

/** Inline param action card rendered below AI messages */
function ParamActionCard({ params, requireWarning }: { params: ParamSuggestion[]; requireWarning: (action: () => void) => void }) {
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const parameterStore = useParameterStore;
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exported, setExported] = useState(false);

  const handleApply = async (p: ParamSuggestion) => {
    setApplying(p.name);
    setError(null);
    const ok = await parameterStore.getState().setParameter(p.name, p.value);
    setApplying(null);
    if (ok) {
      setApplied((prev) => new Set(prev).add(p.name));
    } else {
      setError(`Failed to set ${p.name}`);
    }
  };

  const handleApplyAll = async () => {
    setError(null);
    for (const p of params) {
      if (applied.has(p.name)) continue;
      setApplying(p.name);
      const ok = await parameterStore.getState().setParameter(p.name, p.value);
      setApplying(null);
      if (ok) {
        setApplied((prev) => new Set(prev).add(p.name));
      } else {
        setError(`Failed to set ${p.name}`);
        break;
      }
    }
  };

  const handleExport = async () => {
    const exportParams = params.map((p) => ({ id: p.name, value: p.value }));
    const result = await window.electronAPI?.saveParamsToFile(exportParams, 'ai-recommended');
    if (result?.success) setExported(true);
  };

  const needsReboot = params.some((p) => parameterStore.getState().isRebootRequired(p.name));
  const allApplied = params.every((p) => applied.has(p.name));

  return (
    <div className="bg-purple-500/8 border border-purple-500/20 rounded-lg p-3 mt-2">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-4 h-4 text-purple-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className="text-xs font-semibold text-purple-300">Suggested Parameter Changes</span>
      </div>

      <div className="space-y-1.5">
        {params.map((p) => {
          const reboot = parameterStore.getState().isRebootRequired(p.name);
          const currentParam = parameterStore.getState().parameters.get(p.name);
          const isApplied = applied.has(p.name);
          const isApplying = applying === p.name;

          return (
            <div key={p.name} className="flex items-center gap-2 text-xs">
              <code className="text-purple-300 bg-gray-800/80 px-1.5 py-0.5 rounded font-mono flex-shrink-0">
                {p.name}
              </code>
              {currentParam && (
                <span className="text-gray-500">
                  {currentParam.value} &rarr;
                </span>
              )}
              <span className="text-white font-medium">{p.value}</span>
              {reboot && (
                <span className="text-amber-400 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/25 flex-shrink-0">
                  Reboot
                </span>
              )}
              {isConnected && !isApplied && (
                <button
                  onClick={() => requireWarning(() => handleApply(p))}
                  disabled={!!applying}
                  className="ml-auto text-[10px] px-2 py-0.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/25 rounded transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {isApplying ? '...' : 'Apply'}
                </button>
              )}
              {isApplied && (
                <span className="ml-auto text-emerald-400 text-[10px] flex-shrink-0">Applied</span>
              )}
            </div>
          );
        })}
      </div>

      {needsReboot && (
        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-amber-400">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Some parameters require a flight controller reboot to take effect.
        </div>
      )}

      {error && <p className="text-[11px] text-red-400 mt-1.5">{error}</p>}

      <div className="flex gap-2 mt-2.5">
        {isConnected ? (
          !allApplied && params.length > 1 && (
            <button
              onClick={() => requireWarning(handleApplyAll)}
              disabled={!!applying}
              className="text-[11px] px-3 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/25 rounded transition-colors disabled:opacity-50"
            >
              {applying ? 'Applying...' : 'Apply All'}
            </button>
          )
        ) : (
          <button
            onClick={() => requireWarning(handleExport)}
            disabled={exported}
            className="text-[11px] px-3 py-1 bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/25 rounded transition-colors disabled:opacity-50"
          >
            {exported ? 'Exported' : 'Export .param file'}
          </button>
        )}
        {!isConnected && (
          <span className="text-[10px] text-gray-500 self-center">FC not connected</span>
        )}
      </div>
    </div>
  );
}

export function AiAnalysisPanel() {
  const currentLog = useLogStore((s) => s.currentLog);
  const healthResults = useLogStore((s) => s.healthResults);
  const aiMessages = useLogStore((s) => s.aiMessages);
  const isAiAnalyzing = useLogStore((s) => s.isAiAnalyzing);
  const aiAnalysisError = useLogStore((s) => s.aiAnalysisError);
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const aiWarningDismissed = useSettingsStore((s) => s.aiWarningDismissed);

  const [input, setInput] = useState('');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const requireWarning = useCallback((action: () => void) => {
    if (aiWarningDismissed) {
      action();
    } else {
      setPendingAction(() => action);
    }
  }, [aiWarningDismissed]);

  const handleWarningAccept = useCallback((dismiss: boolean) => {
    if (dismiss) {
      useSettingsStore.getState().setAiWarningDismissed(true);
    }
    pendingAction?.();
    setPendingAction(null);
  }, [pendingAction]);

  const handleWarningCancel = useCallback(() => {
    setPendingAction(null);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages.length, isAiAnalyzing]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const flightStats = useMemo(() => {
    if (!currentLog) return null;
    let maxAlt = 0, maxSpd = 0, totalMah = 0;
    let lastLat = 0, lastLng = 0, totalDist = 0, hasLastPos = false;
    const gps = currentLog.messages['GPS'];
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
            const dLat = (lat - lastLat) * Math.PI / 180;
            const dLng = (lng - lastLng) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(lastLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
            totalDist += 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          }
          lastLat = lat; lastLng = lng; hasLastPos = true;
        }
      }
    }
    const bat = currentLog.messages['BAT'];
    if (bat && bat.length > 0) {
      const mah = bat[bat.length - 1]!.fields['CurrTot'];
      if (typeof mah === 'number') totalMah = mah;
    }
    return { maxAlt, maxSpd, totalDist, totalMah };
  }, [currentLog]);

  const buildSystemContext = useCallback(() => {
    if (!currentLog || !healthResults) return '';
    const stats = flightStats ?? { maxAlt: 0, maxSpd: 0, totalDist: 0, totalMah: 0 };
    const meta = currentLog.metadata;
    const dS = (currentLog.timeRange.endUs - currentLog.timeRange.startUs) / 1_000_000;
    const dist = stats.totalDist > 1000 ? `${(stats.totalDist / 1000).toFixed(2)} km` : `${stats.totalDist.toFixed(0)} m`;

    // Collect reboot-required params from metadata
    const paramMeta = useParameterStore.getState().metadata;
    let rebootParamsList = '';
    if (paramMeta) {
      const rebootParams = Object.entries(paramMeta)
        .filter(([, m]) => m.rebootRequired)
        .map(([name]) => name);
      if (rebootParams.length > 0) {
        rebootParamsList = `\n\n## Parameters Requiring Reboot After Change\n${rebootParams.join(', ')}`;
      }
    }

    return `You are a flight log analyst embedded in ArduDeck, an ArduPilot ground control station.
You ONLY answer questions about this specific flight log, ArduPilot configuration, and drone/vehicle troubleshooting. Refuse any off-topic requests politely.

## This Flight
- Vehicle: ${meta.vehicleType || 'Unknown'} running ${meta.firmwareString || meta.firmwareVersion || 'Unknown firmware'}
- Duration: ${(dS / 60).toFixed(1)} minutes
- Max Altitude: ${stats.maxAlt.toFixed(1)} m | Max Speed: ${stats.maxSpd.toFixed(1)} m/s
- Distance: ${dist} | Battery Used: ${stats.totalMah.toFixed(0)} mAh

## Health Check Results
${JSON.stringify(healthResults, null, 2)}

## ArduDeck Navigation (use these to guide the user)
- Parameters screen: user can search and change ArduPilot parameters.
- Telemetry screen: live vehicle data display.
- Mission Planning: waypoint editor and map.
- Flight Logs > Explorer tab: interactive chart and 3D map of this flight.
- Flight Logs > Health Report tab: the automated health check cards.

## Parameter Recommendations Format
When you recommend changing ArduPilot parameters, you MUST include them in this exact format (one per line, anywhere in your response):
:::param PARAM_NAME=VALUE:::

Example: To recommend setting INS_ACCEL_FILTER to 10:
:::param INS_ACCEL_FILTER=10:::

This renders an actionable button in the app so the user can apply the change directly.
Only suggest parameter changes you are confident about. Use exact ArduPilot parameter names.
If a parameter requires a reboot, mention it in your explanation text.${rebootParamsList}

## Response Guidelines
- Be concise and actionable. Use markdown.
- Reference ArduPilot parameters by name when suggesting changes.
- Always use the :::param::: format when suggesting specific values.
- If asked about data not in the log, say so.`;
  }, [currentLog, healthResults, flightStats]);

  const sendToAi = useCallback(async () => {
    if (!aiProvider || !currentLog) return;
    const store = useLogStore.getState();
    store.setIsAiAnalyzing(true);
    store.setAiAnalysisError(null);

    const result = await window.electronAPI?.logAiAnalyze({
      provider: aiProvider,
      messages: store.aiMessages,
      systemContext: buildSystemContext(),
    });

    store.setIsAiAnalyzing(false);
    if (result?.success && result.response) {
      store.addAiMessage({ role: 'assistant', content: result.response });
    } else {
      store.setAiAnalysisError(result?.error ?? 'Analysis failed');
    }
  }, [aiProvider, currentLog, buildSystemContext]);

  const handleSend = useCallback(async (userMessage: string) => {
    useLogStore.getState().addAiMessage({ role: 'user', content: userMessage });
    await sendToAi();
  }, [sendToAi]);

  const autoSentRef = useRef(false);
  useEffect(() => {
    if (autoSentRef.current) return;
    const last = aiMessages[aiMessages.length - 1];
    if (last?.role === 'user' && !isAiAnalyzing) {
      autoSentRef.current = true;
      sendToAi();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = () => {
    const msg = input.trim();
    if (!msg || isAiAnalyzing) return;
    requireWarning(() => {
      setInput('');
      handleSend(msg);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleResponseClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'A' && target.dataset.navigate) {
      e.preventDefault();
      const view = target.dataset.navigate;
      if (view === 'explorer') {
        useLogStore.getState().setActiveTab('explorer');
      } else if (view === 'report') {
        useLogStore.getState().setActiveTab('report');
      } else {
        useNavigationStore.getState().setView(view as never);
      }
    }
  }, []);

  const providerName = aiProvider === 'claude' ? 'Claude' : aiProvider === 'openai' ? 'OpenAI' : 'Gemini';

  if (!aiProvider) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <p className="mb-2">AI Analysis requires an API key.</p>
          <button
            onClick={() => useNavigationStore.getState().setView('settings' as never)}
            className="text-purple-400 hover:text-purple-300 text-sm underline"
          >
            Configure in Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {pendingAction && (
        <AiWarningDialog onAccept={handleWarningAccept} onCancel={handleWarningCancel} />
      )}

      {/* Disclaimer banner */}
      <div className="flex items-center gap-2 mx-4 mt-3 mb-0 px-3 py-2 bg-amber-500/8 border border-amber-500/20 rounded-lg">
        <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="text-[10px] text-amber-300/70 leading-snug">
          AI suggestions are experimental. Always verify recommendations before applying. Incorrect parameters can cause loss of control.
        </p>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {aiMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 gap-6">
            <div className="w-14 h-14 rounded-2xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center">
              <svg className="w-7 h-7 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div className="text-center">
              <h3 className="text-white font-medium mb-1">Ask about this flight</h3>
              <p className="text-xs text-gray-500">Powered by {providerName}. Flight data and health checks are included as context.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {[
                'Analyze this flight and highlight any issues',
                'Is my vibration level safe for auto missions?',
                'What parameters should I tune based on this flight?',
                'Explain the battery performance and estimate health',
                'Were there any GPS or compass anomalies?',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => requireWarning(() => handleSend(suggestion))}
                  disabled={isAiAnalyzing}
                  className="text-xs px-3 py-2 rounded-lg bg-gray-800/50 hover:bg-purple-500/10 hover:border-purple-500/30 border border-gray-700/40 text-gray-400 hover:text-purple-300 transition-colors text-left disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-4 py-4 space-y-4 max-w-3xl mx-auto">
            {aiMessages.map((msg, i) => {
              const paramSuggestions = msg.role === 'assistant' ? parseParamSuggestions(msg.content) : [];
              const displayContent = msg.role === 'assistant' ? stripParamMarkers(msg.content) : msg.content;

              return (
                <div key={i} className={msg.role === 'user' ? 'flex justify-end' : ''}>
                  {msg.role === 'user' ? (
                    <div className="bg-blue-500/12 border border-blue-500/20 rounded-xl px-4 py-2.5 max-w-[80%]">
                      <p className="text-sm text-blue-200 whitespace-pre-wrap">{displayContent}</p>
                    </div>
                  ) : (
                    <div>
                      <div
                        onClick={handleResponseClick}
                        className="bg-gray-800/40 border border-gray-700/30 rounded-xl px-4 py-3 text-[13px] text-gray-300 leading-normal
                          [&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0
                          [&_h1]:text-[15px] [&_h1]:font-semibold [&_h1]:text-white [&_h1]:mt-4 [&_h1]:mb-1 [&_h1]:border-b [&_h1]:border-gray-700/40 [&_h1]:pb-1
                          [&_h2]:text-[13px] [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-3 [&_h2]:mb-0.5
                          [&_h3]:text-[13px] [&_h3]:font-medium [&_h3]:text-gray-200 [&_h3]:mt-2.5 [&_h3]:mb-0.5
                          [&_ul]:my-1 [&_ul]:ml-4 [&_ul]:list-disc [&_ul]:space-y-0
                          [&_li]:text-gray-300 [&_li]:leading-snug [&_li]:py-[1px]
                          [&_strong]:text-white [&_em]:text-gray-200
                          [&_code]:text-purple-300 [&_code]:bg-gray-800/80 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(displayContent) }}
                      />
                      {paramSuggestions.length > 0 && (
                        <ParamActionCard params={paramSuggestions} requireWarning={requireWarning} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {isAiAnalyzing && (
              <div className="flex items-center gap-2 py-2">
                <div className="w-3.5 h-3.5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-gray-500">Analyzing...</span>
              </div>
            )}
            {aiAnalysisError && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                {aiAnalysisError}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="border-t border-gray-700/40 px-4 py-3">
        <div className="max-w-3xl mx-auto flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={aiMessages.length === 0 ? 'Ask about this flight...' : 'Follow-up question...'}
            disabled={isAiAnalyzing}
            rows={1}
            className="flex-1 bg-gray-900/50 border border-gray-700/40 rounded-xl px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/50 disabled:opacity-50 resize-none"
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isAiAnalyzing}
            className="px-3 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
