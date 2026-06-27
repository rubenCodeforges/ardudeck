/**
 * CustomFramePanel
 *
 * Compact UI inside ArduPilotSitlTab for managing user-authored JSON physics
 * frames. Lets users start from templates, edit fields, import/export, and
 * mark a frame as the active one for the next SITL launch.
 */

import { useEffect, useState, useCallback } from 'react';
import { Pencil, Trash2, Download, Upload, X, ChevronDown, ChevronRight } from 'lucide-react';
import {
  SITL_FRAME_TEMPLATES,
  type SitlCustomFrame,
  type SitlCustomFrameMeta,
} from '../../../shared/sitl-custom-frame';
import { useArduPilotSitlStore } from '../../stores/ardupilot-sitl-store';
import { useSettingsStore } from '../../stores/settings-store';
import {
  areaInputValueFromSquareMeters,
  altitudeValueFromMeters,
  capacityValueFromMah,
  dimensionInputValueFromMillimeters,
  speedValueFromMetersPerSecond,
  toGramsFromWeightUnit,
  toMahFromCapacityUnit,
  toMetersPerSecondFromSpeedUnit,
  toMetersFromAltitudeUnit,
  toMillimetersFromDimensionUnit,
  toSquareMetersFromAreaUnit,
  UNIT_LABELS,
  UNIT_PRECISION,
  weightInputValueFromGrams,
} from '../../../shared/user-units.js';

type EditorMode =
  | { kind: 'closed' }
  | { kind: 'new'; templateKey: string; name: string; frame: SitlCustomFrame }
  | { kind: 'edit'; id: string; name: string; frame: SitlCustomFrame };

const FIELD_GROUPS: { title: string; fields: (keyof SitlCustomFrame)[] }[] = [
  { title: 'Physical', fields: ['mass', 'diagonal_size', 'num_motors', 'disc_area'] },
  { title: 'Battery', fields: ['maxVoltage', 'battCapacityAh', 'refBatRes'] },
  { title: 'Reference (tuning)', fields: ['refSpd', 'refAngle', 'refVoltage', 'refCurrent', 'refAlt', 'refTempC', 'refRotRate'] },
  { title: 'Motors', fields: ['hoverThrOut', 'pwmMin', 'pwmMax', 'spin_min', 'spin_max', 'slew_max', 'propExpo', 'mdrag_coef'] },
];

const FIELD_HINTS: Partial<Record<keyof SitlCustomFrame, string>> = {
  maxVoltage: 'V (full-charge)',
  refBatRes: 'Ω (internal)',
  refAngle: 'deg',
  refVoltage: 'V',
  refCurrent: 'A',
  refTempC: '°C',
  refRotRate: 'deg/s',
  hoverThrOut: '0–1',
  num_motors: '4 / 6 / 8',
};

function parseNumberDraft(value: string): number | null {
  const trimmed = value.trim();
  if (!/^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:e[+-]?\d+)?$/i.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function CustomFramePanel() {
  const customFramePath = useArduPilotSitlStore((s) => s.customFramePath);
  const customFrameMotors = useArduPilotSitlStore((s) => s.customFrameMotors);
  const setCustomFrame = useArduPilotSitlStore((s) => s.setCustomFrame);
  const setModel = useArduPilotSitlStore((s) => s.setModel);
  const unitPreferences = useSettingsStore((s) => s.unitPreferences);
  const altitudeUnit = unitPreferences.altitude;
  const electricCapacityUnit = unitPreferences.electricCapacity;
  const speedUnit = unitPreferences.speed;
  const weightUnit = unitPreferences.weight;
  const dimensionUnit = unitPreferences.dimensions;
  const areaUnit = unitPreferences.area;

  const [expanded, setExpanded] = useState(false);
  const [list, setList] = useState<SitlCustomFrameMeta[]>([]);
  const [editor, setEditor] = useState<EditorMode>({ kind: 'closed' });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const items = await window.electronAPI?.ardupilotSitlCustomFrameList?.();
    if (Array.isArray(items)) setList(items);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Reconcile persisted `customFramePath` against the current on-disk list.
  // If the active frame's file no longer exists (deleted while the app was
  // closed, userData wiped, etc.) the active selection becomes stale and
  // would crash SITL on next launch — clear it.
  useEffect(() => {
    if (!customFramePath) return;
    if (list.length === 0) return; // list still loading; don't clear yet
    const stillExists = list.some((f) => f.path === customFramePath);
    if (!stillExists) {
      setCustomFrame(undefined, undefined);
      showToast('Active custom frame is missing — cleared');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customFramePath, list]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const onNewFromTemplate = (templateKey: string) => {
    const tpl = SITL_FRAME_TEMPLATES[templateKey];
    if (!tpl) return;
    setEditor({ kind: 'new', templateKey, name: tpl.name, frame: { ...tpl.frame } });
    setExpanded(true);
  };

  const onEdit = async (id: string) => {
    const rec = await window.electronAPI?.ardupilotSitlCustomFrameLoad?.(id);
    if (!rec) {
      showToast('Failed to load frame');
      return;
    }
    setEditor({ kind: 'edit', id: rec.id, name: rec.name, frame: { ...rec.frame } });
    setExpanded(true);
  };

  const onSave = async () => {
    if (editor.kind === 'closed') return;
    if (!editor.name.trim()) {
      showToast('Name is required');
      return;
    }
    setBusy(true);
    try {
      const result = await window.electronAPI?.ardupilotSitlCustomFrameSave?.({
        name: editor.name,
        frame: editor.frame,
        existingId: editor.kind === 'edit' ? editor.id : undefined,
      });
      if (result) {
        await refresh();
        setEditor({ kind: 'closed' });
        showToast('Saved');
      }
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string, name: string) => {
    if (!confirm(`Delete frame "${name}"?`)) return;
    await window.electronAPI?.ardupilotSitlCustomFrameDelete?.(id);
    if (customFramePath && list.find((f) => f.id === id)?.path === customFramePath) {
      setCustomFrame(undefined, undefined);
    }
    await refresh();
  };

  const onImport = async () => {
    setBusy(true);
    try {
      const result = await window.electronAPI?.ardupilotSitlCustomFrameImport?.();
      if (result?.ok) {
        await refresh();
        showToast(`Imported ${result.record.name}`);
      } else if (result && !result.ok && result.error !== 'cancelled') {
        showToast(result.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const onExport = async (id: string) => {
    setBusy(true);
    try {
      const result = await window.electronAPI?.ardupilotSitlCustomFrameExport?.(id);
      if (result?.ok) showToast('Exported');
      else if (result && !result.ok && result.error !== 'cancelled') showToast(result.error);
    } finally {
      setBusy(false);
    }
  };

  const onActivate = async (item: SitlCustomFrameMeta) => {
    const rec = await window.electronAPI?.ardupilotSitlCustomFrameLoad?.(item.id);
    if (!rec) return;
    setCustomFrame(rec.path, rec.frame.num_motors);
    // Auto-sync the Frame/Model dropdown so upstream .parm files (motor mixer,
    // frame defaults) match the custom physics. Without this the dropdown
    // could be on Quad while custom frame is octa → param mismatch on boot.
    const modelForMotors =
      rec.frame.num_motors === 8 ? 'octa' :
      rec.frame.num_motors === 6 ? 'hexa' :
      'quad';
    setModel(modelForMotors);
    showToast(`Active: ${rec.name} → Frame/Model auto-set to ${modelForMotors}`);
  };

  const onDeactivate = () => {
    setCustomFrame(undefined, undefined);
  };

  const updateField = (key: keyof SitlCustomFrame, value: number) => {
    if (editor.kind === 'closed') return;
    setEditor({ ...editor, frame: { ...editor.frame, [key]: value } });
  };

  const getFieldHint = (field: keyof SitlCustomFrame): string | undefined => {
    if (field === 'mass') return UNIT_LABELS.weight[weightUnit];
    if (field === 'diagonal_size') return `${UNIT_LABELS.dimensions[dimensionUnit]} (motor-to-motor)`;
    if (field === 'disc_area') return `${UNIT_LABELS.area[areaUnit]} (total prop)`;
    if (field === 'refAlt') return UNIT_LABELS.altitude[altitudeUnit];
    if (field === 'battCapacityAh') return UNIT_LABELS.electricCapacity[electricCapacityUnit];
    if (field === 'refSpd') return UNIT_LABELS.speed[speedUnit];
    return FIELD_HINTS[field];
  };

  const getFieldDisplayValue = (field: keyof SitlCustomFrame): number => {
    if (editor.kind === 'closed') return 0;
    const value = editor.frame[field];
    if (field === 'refAlt') {
      const precision = altitudeUnit === 'km' ? 3 : altitudeUnit === 'm' ? 0 : 1;
      return Number(altitudeValueFromMeters(value, altitudeUnit).toFixed(precision));
    }
    if (field === 'mass') {
      return Number(weightInputValueFromGrams(value * 1000, weightUnit));
    }
    if (field === 'diagonal_size') {
      return Number(dimensionInputValueFromMillimeters(value * 1000, dimensionUnit));
    }
    if (field === 'disc_area') {
      return Number(areaInputValueFromSquareMeters(value, areaUnit));
    }
    if (field === 'battCapacityAh') {
      return Number(capacityValueFromMah(value * 1000, electricCapacityUnit).toFixed(UNIT_PRECISION.electricCapacity[electricCapacityUnit]));
    }
    if (field === 'refSpd') {
      return Number(speedValueFromMetersPerSecond(value, speedUnit).toFixed(UNIT_PRECISION.speed[speedUnit]));
    }
    return value;
  };

  const updateFieldFromDisplay = (field: keyof SitlCustomFrame, raw: string) => {
    const v = parseNumberDraft(raw.replace(',', '.'));
    if (v === null) return;
    if (field === 'refAlt') {
      updateField(field, toMetersFromAltitudeUnit(v, altitudeUnit));
      return;
    }
    if (field === 'mass') {
      updateField(field, toGramsFromWeightUnit(v, weightUnit) / 1000);
      return;
    }
    if (field === 'diagonal_size') {
      updateField(field, toMillimetersFromDimensionUnit(v, dimensionUnit) / 1000);
      return;
    }
    if (field === 'disc_area') {
      updateField(field, toSquareMetersFromAreaUnit(v, areaUnit));
      return;
    }
    if (field === 'battCapacityAh') {
      updateField(field, toMahFromCapacityUnit(v, electricCapacityUnit) / 1000);
      return;
    }
    if (field === 'refSpd') {
      updateField(field, toMetersPerSecondFromSpeedUnit(v, speedUnit));
      return;
    }
    updateField(field, v);
  };

  return (
    <div className="bg-surface rounded-xl border border-subtle">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-surface-raised rounded-t-xl"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className="text-sm font-medium text-content">Custom Frame Physics</span>
          {customFramePath && (
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/20 text-emerald-300 font-medium">
              ACTIVE
            </span>
          )}
        </div>
        <span className="text-[11px] text-content-secondary">{list.length} saved</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-subtle pt-3">
          {/* Active frame indicator */}
          {customFramePath && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <div className="text-xs text-emerald-200">
                <span className="font-medium">Active:</span>{' '}
                {list.find((f) => f.path === customFramePath)?.name ?? 'Unknown'}
                {customFrameMotors && <span className="text-content-secondary"> · {customFrameMotors} motors</span>}
              </div>
              <button
                onClick={onDeactivate}
                className="text-[11px] text-emerald-300 hover:text-emerald-100 underline"
              >
                clear
              </button>
            </div>
          )}

          {/* Action row */}
          <div className="flex flex-wrap gap-2 items-center">
            <select
              onChange={(e) => { if (e.target.value) onNewFromTemplate(e.target.value); e.target.value = ''; }}
              defaultValue=""
              className="text-xs bg-surface-raised border border-subtle rounded px-2 py-1 text-content"
            >
              <option value="">+ New from template…</option>
              {Object.entries(SITL_FRAME_TEMPLATES).map(([k, t]) => (
                <option key={k} value={k}>{t.name}</option>
              ))}
            </select>
            <button
              onClick={onImport}
              disabled={busy}
              className="text-xs px-2 py-1 rounded bg-surface-raised border border-subtle hover:border-blue-500/50 text-content flex items-center gap-1 disabled:opacity-50"
            >
              <Upload className="w-3 h-3" /> Import JSON
            </button>
          </div>

          {/* Saved frames list */}
          {list.length > 0 && (
            <div className="space-y-1">
              {list.map((item) => {
                const isActive = customFramePath === item.path;
                return (
                  <div key={item.id} className={`flex items-center gap-2 p-2 rounded-lg border-l-4 border border-subtle ${isActive ? 'bg-emerald-500/10 border-l-emerald-500' : 'bg-surface-raised'}`}>
                    <span className="flex-1 text-sm text-content truncate flex items-center gap-2">
                      {item.name}
                      {isActive && (
                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/20 text-emerald-300 font-medium uppercase tracking-wide">
                          Active
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => isActive ? onDeactivate() : onActivate(item)}
                      className={`shrink-0 px-2 py-1 text-xs rounded font-medium transition-colors ${
                        isActive
                          ? 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                          : 'bg-blue-600 text-white hover:bg-blue-500'
                      }`}
                      title={isActive ? 'Stop using this frame' : 'Use this frame for next launch'}
                    >
                      {isActive ? 'Stop using' : 'Use'}
                    </button>
                    <button onClick={() => onEdit(item.id)} className="p-1 rounded hover:bg-surface text-content-secondary hover:text-blue-400" title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onExport(item.id)} className="p-1 rounded hover:bg-surface text-content-secondary hover:text-blue-400" title="Export JSON">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onDelete(item.id, item.name)} className="p-1 rounded hover:bg-surface text-content-secondary hover:text-red-400" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {list.length === 0 && editor.kind === 'closed' && (
            <p className="text-[11px] text-content-secondary italic">
              No custom frames yet. Create one from a template or import a JSON file.
            </p>
          )}

          {/* Editor */}
          {editor.kind !== 'closed' && (
            <div className="space-y-3 border-t border-subtle pt-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editor.name}
                  onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                  placeholder="Frame name"
                  className="flex-1 px-2 py-1 text-sm bg-surface-input border border-subtle rounded text-content focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={onSave}
                  disabled={busy || !editor.name.trim()}
                  className="text-xs px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditor({ kind: 'closed' })}
                  className="p-1 rounded hover:bg-surface-raised text-content-secondary"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {FIELD_GROUPS.map((group) => (
                <div key={group.title}>
                  <div className="text-[10px] uppercase tracking-wide text-content-tertiary mb-1">
                    {group.title}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {group.fields.map((field) => (
                      <div key={field}>
                        <label className="block text-[11px] text-content-secondary">
                          {field}
                          {getFieldHint(field) && <span className="text-content-tertiary ml-1">({getFieldHint(field)})</span>}
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={getFieldDisplayValue(field)}
                          onChange={(e) => updateFieldFromDisplay(field, e.target.value)}
                          className="w-full px-2 py-1 text-xs bg-surface-input border border-subtle rounded text-content font-mono tabular-nums focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {toast && (
            <div className="px-2 py-1 text-xs rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
              {toast}
            </div>
          )}

          {customFramePath && (
            <p className="text-[11px] text-content-tertiary">
              Active frame is loaded via SITL <code className="px-1 bg-surface-raised rounded">--model</code> on next start.
              Stop & restart SITL to apply.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
