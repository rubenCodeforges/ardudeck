import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useLogStore } from '../../stores/log-store';

const SERIES_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

export function LogExplorerPanel() {
  const currentLog = useLogStore((s) => s.currentLog);
  const selectedTypes = useLogStore((s) => s.selectedTypes);
  const selectedFields = useLogStore((s) => s.selectedFields);
  const setSelectedTypes = useLogStore((s) => s.setSelectedTypes);
  const setSelectedFields = useLogStore((s) => s.setSelectedFields);

  const chartRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const [showTable, setShowTable] = useState(false);

  const messageTypes = currentLog?.messageTypes ?? [];

  // Get numeric fields for selected types
  const availableFields = useMemo(() => {
    if (!currentLog || selectedTypes.length === 0) return {};
    const result: Record<string, string[]> = {};
    for (const type of selectedTypes) {
      const msgs = currentLog.messages[type];
      if (msgs && msgs.length > 0) {
        const firstMsg = msgs[0]!;
        result[type] = Object.keys(firstMsg.fields).filter(
          (f) => f !== 'TimeUS' && typeof firstMsg.fields[f] === 'number',
        );
      }
    }
    return result;
  }, [currentLog, selectedTypes]);

  // Build chart data from selected fields
  const chartData = useMemo(() => {
    if (!currentLog) return null;

    const series: { label: string; data: number[] }[] = [];
    let timestamps: number[] = [];

    for (const type of selectedTypes) {
      const fields = selectedFields.get(type);
      if (!fields || fields.length === 0) continue;

      const msgs = currentLog.messages[type];
      if (!msgs) continue;

      if (timestamps.length === 0) {
        timestamps = msgs.map((m) => m.timeUs / 1_000_000);
      }

      for (const field of fields) {
        const values = msgs.map((m) => {
          const v = m.fields[field];
          return typeof v === 'number' ? v : NaN;
        });

        if (values.length === timestamps.length) {
          series.push({ label: `${type}.${field}`, data: values });
        }
      }
    }

    if (timestamps.length === 0 || series.length === 0) return null;

    const data: uPlot.AlignedData = [
      new Float64Array(timestamps),
      ...series.map((s) => new Float64Array(s.data)),
    ];

    return { data, series };
  }, [currentLog, selectedTypes, selectedFields]);

  // Render uPlot chart
  useEffect(() => {
    if (!chartRef.current || !chartData) {
      if (plotRef.current) {
        plotRef.current.destroy();
        plotRef.current = null;
      }
      return;
    }

    const container = chartRef.current;
    const { width } = container.getBoundingClientRect();

    const opts: uPlot.Options = {
      width: Math.max(width, 400),
      height: 350,
      cursor: {
        drag: { x: true, y: true },
      },
      scales: {
        x: { time: false },
      },
      axes: [
        {
          label: 'Time (s)',
          stroke: '#9ca3af',
          grid: { stroke: '#374151', width: 1 },
          ticks: { stroke: '#4b5563', width: 1 },
        },
        {
          stroke: '#9ca3af',
          grid: { stroke: '#374151', width: 1 },
          ticks: { stroke: '#4b5563', width: 1 },
        },
      ],
      series: [
        { label: 'Time' },
        ...chartData.series.map((s, i) => ({
          label: s.label,
          stroke: SERIES_COLORS[i % SERIES_COLORS.length],
          width: 1.5,
        })),
      ],
    };

    if (plotRef.current) {
      plotRef.current.destroy();
    }

    plotRef.current = new uPlot(opts, chartData.data, container);

    return () => {
      if (plotRef.current) {
        plotRef.current.destroy();
        plotRef.current = null;
      }
    };
  }, [chartData]);

  // Handle resize
  useEffect(() => {
    if (!chartRef.current || !plotRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        plotRef.current?.setSize({
          width: entry.contentRect.width,
          height: 350,
        });
      }
    });
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, [chartData]);

  const handleTypeToggle = useCallback((type: string) => {
    setSelectedTypes(
      selectedTypes.includes(type)
        ? selectedTypes.filter((t) => t !== type)
        : [...selectedTypes, type],
    );
  }, [selectedTypes, setSelectedTypes]);

  const handleFieldToggle = useCallback((type: string, field: string) => {
    const current = selectedFields.get(type) ?? [];
    setSelectedFields(
      type,
      current.includes(field)
        ? current.filter((f) => f !== field)
        : [...current, field],
    );
  }, [selectedFields, setSelectedFields]);

  const QUICK_PRESETS = [
    { label: 'Attitude', types: ['ATT'], fields: { ATT: ['DesRoll', 'Roll', 'DesPitch', 'Pitch'] } },
    { label: 'Vibration', types: ['VIBE'], fields: { VIBE: ['VibeX', 'VibeY', 'VibeZ'] } },
    { label: 'GPS', types: ['GPS'], fields: { GPS: ['NSats', 'HDop'] } },
    { label: 'Battery', types: ['BAT'], fields: { BAT: ['Volt', 'Curr'] } },
    { label: 'Altitude', types: ['CTUN'], fields: { CTUN: ['DAlt', 'Alt', 'BAlt'] } },
    { label: 'Compass', types: ['MAG'], fields: { MAG: ['MagX', 'MagY', 'MagZ'] } },
    { label: 'EKF', types: ['NKF4'], fields: { NKF4: ['SV', 'SP', 'SH'] } },
    { label: 'Power', types: ['POWR'], fields: { POWR: ['Vcc'] } },
  ];

  const applyPreset = useCallback((preset: typeof QUICK_PRESETS[number]) => {
    // Only apply if the message types exist in the log
    const validTypes = preset.types.filter((t) => messageTypes.includes(t));
    if (validTypes.length === 0) return;
    setSelectedTypes(validTypes);
    for (const [type, fields] of Object.entries(preset.fields)) {
      if (messageTypes.includes(type)) {
        setSelectedFields(type, fields);
      }
    }
  }, [messageTypes, setSelectedTypes, setSelectedFields]);

  return (
    <div className="h-full flex">
      {/* Left sidebar — type/field selector */}
      <div className="w-64 border-r border-gray-700/50 overflow-y-auto p-3 space-y-3">
        {/* Quick presets */}
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">Quick Plots</div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PRESETS.filter((p) => p.types.some((t) => messageTypes.includes(t))).map((preset) => (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset)}
              className="text-xs px-2 py-1 rounded-md bg-gray-800/60 hover:bg-blue-500/20 hover:text-blue-400 text-gray-400 transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mt-2">Message Types</div>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {messageTypes.map((type) => (
            <label key={type} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-800/30 rounded px-2 py-1">
              <input
                type="checkbox"
                checked={selectedTypes.includes(type)}
                onChange={() => handleTypeToggle(type)}
                className="rounded border-gray-600 bg-gray-800 text-blue-500"
              />
              <span className="text-gray-300">{type}</span>
              <span className="text-xs text-gray-600 ml-auto">
                {currentLog?.messages[type]?.length ?? 0}
              </span>
            </label>
          ))}
        </div>

        {/* Field selector for selected types */}
        {selectedTypes.map((type) => {
          const fields = availableFields[type];
          if (!fields || fields.length === 0) return null;
          return (
            <div key={type}>
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mt-3 mb-1">{type} Fields</div>
              <div className="space-y-1">
                {fields.map((field) => (
                  <label key={field} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-800/30 rounded px-2 py-1">
                    <input
                      type="checkbox"
                      checked={selectedFields.get(type)?.includes(field) ?? false}
                      onChange={() => handleFieldToggle(type, field)}
                      className="rounded border-gray-600 bg-gray-800 text-blue-500"
                    />
                    <span className="text-gray-300">{field}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Right — chart + table */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Chart */}
        <div className="flex-1 p-4 min-h-0">
          {chartData ? (
            <div ref={chartRef} className="w-full" />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500 text-sm">
              Select message types and fields to plot
            </div>
          )}
        </div>

        {/* Table toggle */}
        {selectedTypes.length > 0 && (
          <div className="border-t border-gray-700/50">
            <button
              onClick={() => setShowTable(!showTable)}
              className="w-full px-4 py-2 text-xs text-gray-400 hover:text-gray-300 hover:bg-gray-800/30 transition-colors flex items-center gap-2"
            >
              <svg className={`w-3 h-3 transition-transform ${showTable ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {showTable ? 'Hide' : 'Show'} Raw Data
            </button>

            {showTable && (
              <div className="max-h-64 overflow-auto border-t border-gray-800/50">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-900">
                    <tr>
                      <th className="text-left px-3 py-2 text-gray-500">Time (s)</th>
                      <th className="text-left px-3 py-2 text-gray-500">Type</th>
                      {selectedTypes.length > 0 && (() => {
                        const type = selectedTypes[0]!;
                        const fields = selectedFields.get(type) ?? [];
                        return fields.map((f) => (
                          <th key={f} className="text-right px-3 py-2 text-gray-500">{f}</th>
                        ));
                      })()}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTypes.slice(0, 1).map((type) => {
                      const msgs = currentLog?.messages[type]?.slice(0, 200) ?? [];
                      const fields = selectedFields.get(type) ?? [];
                      return msgs.map((msg, i) => (
                        <tr key={i} className="border-t border-gray-800/30 hover:bg-gray-800/20">
                          <td className="px-3 py-1 text-gray-400">{(msg.timeUs / 1_000_000).toFixed(3)}</td>
                          <td className="px-3 py-1 text-gray-300">{type}</td>
                          {fields.map((f) => (
                            <td key={f} className="px-3 py-1 text-gray-300 text-right font-mono">
                              {typeof msg.fields[f] === 'number' ? (msg.fields[f] as number).toFixed(3) : msg.fields[f]}
                            </td>
                          ))}
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
