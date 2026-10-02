/**
 * CustomFramePanel
 *
 * Compact UI inside ArduPilotSitlTab for managing user-authored JSON physics
 * frames. Lets users start from templates, edit fields, import/export, and
 * mark a frame as the active one for the next SITL launch.
 */

import { Fragment, useEffect, useState, useCallback } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Pencil, Copy, Trash2, Download, Upload, X, ChevronDown, ChevronRight } from 'lucide-react';
import {
  SITL_FRAME_TEMPLATES,
  sitlFrameTemplateName,
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

// The editable grid only surfaces the scalar frame fields; slungLoad is an
// object edited elsewhere, so exclude it from the numeric-field helpers.
type SitlNumericFieldKey = Exclude<keyof SitlCustomFrame, 'slungLoad'>;

const FIELD_GROUPS: { title: string; titleKey: string; fields: SitlNumericFieldKey[] }[] = [
  // disc_area is NOT in this grid: it's derived from prop diameter + motor count
  // in a dedicated block (renderDiscBlock) right after the Physical group.
  { title: 'Physical', titleKey: 'sitl:customFrame.groupPhysical', fields: ['mass', 'diagonal_size', 'num_motors'] }, // i18n-exempt
  { title: 'Battery', titleKey: 'sitl:customFrame.groupBattery', fields: ['maxVoltage', 'battCapacityAh', 'refBatRes'] }, // i18n-exempt
  { title: 'Reference (tuning)', titleKey: 'sitl:customFrame.groupReference', fields: ['refSpd', 'refAngle', 'refVoltage', 'refCurrent', 'refAlt', 'refTempC', 'refRotRate'] }, // i18n-exempt
  { title: 'Motors', titleKey: 'sitl:customFrame.groupMotors', fields: ['hoverThrOut', 'pwmMin', 'pwmMax', 'spin_min', 'spin_max', 'slew_max', 'propExpo', 'mdrag_coef'] }, // i18n-exempt
];

const FIELD_HINTS: Partial<Record<SitlNumericFieldKey, string>> = {
  refAngle: 'deg',
  refVoltage: 'V',
  refCurrent: 'A',
  refTempC: '°C',
  refRotRate: 'deg/s',
  hoverThrOut: '0-1',
  num_motors: '4 / 6 / 8',
};

function parseNumberDraft(value: string): number | null {
  const trimmed = value.trim();
  if (!/^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:e[+-]?\d+)?$/i.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Total rotor-disc area (m²): the swept circle of every rotor, summed. */
function discAreaFromProp(numMotors: number, propDiameterM: number): number {
  return numMotors * Math.PI * (propDiameterM / 2) ** 2;
}
/** Inverse: the prop diameter (m) implied by a disc area + motor count. */
function propDiameterFromDisc(numMotors: number, discArea: number): number {
  return 2 * Math.sqrt(discArea / (numMotors * Math.PI));
}
/**
 * Rough prop-Ø guess (m) for users who don't know their prop size: motors sit on
 * a circle of diameter = the motor-to-motor size, and a real prop spans ~85% of
 * the gap to its neighbour. Coaxial (X8) frames have half as many arms, so this
 * under-guesses them - it's a starting point to refine, not a measurement.
 */
function estimatePropDiameter(diagonalM: number, numMotors: number): number {
  const chord = diagonalM * Math.sin(Math.PI / Math.max(3, numMotors));
  return Math.max(0.05, 0.85 * chord);
}

export function CustomFramePanel() {
  const { t } = useTranslation();
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
  // Prop diameter (m) is a UI helper, not a stored SITL field. It drives disc_area
  // (motors × π × (Ø/2)²) so users enter a prop size they know instead of a disc
  // area they'd have to compute. Seeded from the frame on open; kept in sync both
  // ways with disc_area below.
  const [propInputM, setPropInputM] = useState<number | null>(null);

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
      showToast(t('sitl:customFrame.toastMissing'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customFramePath, list]);

  // Seed the prop-Ø helper whenever a different frame opens in the editor (keyed
  // on identity so it doesn't clobber the user's typing on every field edit).
  // Prefer the exact prop size implied by a real disc_area; fall back to a guess
  // from the frame diagonal for a fresh/blank frame.
  const editorKey =
    editor.kind === 'edit' ? `edit:${editor.id}` :
    editor.kind === 'new' ? `new:${editor.templateKey}` :
    'closed';
  useEffect(() => {
    if (editor.kind === 'closed') { setPropInputM(null); return; }
    const f = editor.frame;
    if (f.disc_area > 0 && f.num_motors > 0) setPropInputM(propDiameterFromDisc(f.num_motors, f.disc_area));
    else if (f.diagonal_size > 0 && f.num_motors > 0) setPropInputM(estimatePropDiameter(f.diagonal_size, f.num_motors));
    else setPropInputM(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorKey]);

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
      showToast(t('sitl:customFrame.toastLoadFailed'));
      return;
    }
    setEditor({ kind: 'edit', id: rec.id, name: rec.name, frame: { ...rec.frame } });
    setExpanded(true);
  };

  const onSave = async () => {
    if (editor.kind === 'closed') return;
    if (!editor.name.trim()) {
      showToast(t('sitl:customFrame.toastNameRequired'));
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
        showToast(t('common:saved'));
      }
    } finally {
      setBusy(false);
    }
  };

  // Duplicate a saved frame as a new, independently-editable copy. saveCustomFrame
  // derives the on-disk id from slugify(name) and overwrites a colliding id, so we
  // pick a "<name> copy [n]" that isn't already taken (case-insensitively).
  const onDuplicate = async (id: string) => {
    setBusy(true);
    try {
      const rec = await window.electronAPI?.ardupilotSitlCustomFrameLoad?.(id);
      if (!rec) {
        showToast(t('sitl:customFrame.toastCopyFailed'));
        return;
      }
      const taken = new Set(list.map((f) => f.name.toLowerCase()));
      let copyName = `${rec.name} copy`; // i18n-exempt
      let n = 2;
      while (taken.has(copyName.toLowerCase())) copyName = `${rec.name} copy ${n++}`; // i18n-exempt
      const result = await window.electronAPI?.ardupilotSitlCustomFrameSave?.({ name: copyName, frame: rec.frame });
      if (result) {
        await refresh();
        showToast(t('sitl:customFrame.toastCopied', { name: copyName }));
      }
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string, name: string) => {
    if (!confirm(t('sitl:customFrame.confirmDelete', { name }))) return;
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
        showToast(t('sitl:customFrame.toastImported', { name: result.record.name }));
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
      if (result?.ok) showToast(t('sitl:customFrame.toastExported'));
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
    showToast(t('sitl:customFrame.toastActivated', { name: rec.name, model: modelForMotors }));
  };

  const onDeactivate = () => {
    setCustomFrame(undefined, undefined);
  };

  const updateField = (key: SitlNumericFieldKey, value: number) => {
    if (editor.kind === 'closed') return;
    const frame = { ...editor.frame, [key]: value };
    // Keep disc_area and the prop-Ø helper consistent: changing the motor count
    // rescales the disc from the current prop size; a manual disc_area edit is an
    // advanced override, so back-compute the prop-Ø it implies.
    if (key === 'num_motors' && propInputM && propInputM > 0 && value > 0) {
      frame.disc_area = discAreaFromProp(value, propInputM);
    }
    setEditor({ ...editor, frame });
    if (key === 'disc_area' && value > 0 && frame.num_motors > 0) {
      setPropInputM(propDiameterFromDisc(frame.num_motors, value));
    }
  };

  // Prop-Ø helper -> disc_area. Not routed through updateField('disc_area') so it
  // never fights its own back-compute.
  const setPropDiameter = (m: number) => {
    setPropInputM(m);
    if (editor.kind === 'closed' || m <= 0) return;
    const n = editor.frame.num_motors;
    if (n > 0) setEditor({ ...editor, frame: { ...editor.frame, disc_area: discAreaFromProp(n, m) } });
  };
  // Props are labelled in inches (5", 15", 30") the world over, so this field is
  // always inches regardless of the app's general dimension-unit preference.
  const onPropInput = (raw: string) => {
    const v = parseNumberDraft(raw.replace(',', '.'));
    if (v === null) return;
    setPropDiameter(v * 0.0254);
  };
  const onEstimateProp = () => {
    if (editor.kind === 'closed') return;
    const f = editor.frame;
    if (f.diagonal_size > 0 && f.num_motors > 0) setPropDiameter(estimatePropDiameter(f.diagonal_size, f.num_motors));
  };

  const getFieldHint = (field: SitlNumericFieldKey): string | undefined => {
    if (field === 'mass') return UNIT_LABELS.weight[weightUnit];
    if (field === 'diagonal_size') return t('sitl:customFrame.hintDiagonal', { unit: UNIT_LABELS.dimensions[dimensionUnit] });
    // Rotor disc area is a physical property in m² - NEVER the user's general
    // area unit (hectares/acres are for survey fields; a 2.5 m² disc showing as
    // "2.5 ha" is nonsense).
    if (field === 'disc_area') return t('sitl:customFrame.hintDiscArea');
    if (field === 'maxVoltage') return t('sitl:customFrame.hintMaxVoltage');
    if (field === 'refBatRes') return t('sitl:customFrame.hintRefBatRes');
    if (field === 'refAlt') return UNIT_LABELS.altitude[altitudeUnit];
    if (field === 'battCapacityAh') return UNIT_LABELS.electricCapacity[electricCapacityUnit];
    if (field === 'refSpd') return UNIT_LABELS.speed[speedUnit];
    return FIELD_HINTS[field];
  };

  const getFieldDisplayValue = (field: SitlNumericFieldKey): number => {
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
    // disc_area stays in m² (see getFieldHint) - no unit conversion.
    if (field === 'battCapacityAh') {
      return Number(capacityValueFromMah(value * 1000, electricCapacityUnit).toFixed(UNIT_PRECISION.electricCapacity[electricCapacityUnit]));
    }
    if (field === 'refSpd') {
      return Number(speedValueFromMetersPerSecond(value, speedUnit).toFixed(UNIT_PRECISION.speed[speedUnit]));
    }
    return value;
  };

  const updateFieldFromDisplay = (field: SitlNumericFieldKey, raw: string) => {
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
    // disc_area is entered directly in m² (see getFieldHint).
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

  // Dedicated disc-area block: prop diameter (helper) <-> disc_area, so users who
  // don't know their disc area just type the prop size they do know.
  const renderDiscBlock = () => {
    if (editor.kind === 'closed') return null;
    const f = editor.frame;
    // Prop diameter is shown in inches (the universal prop convention); the mm
    // equivalent is a secondary hint for anyone who measured with a ruler.
    const propDisplay = propInputM != null ? Number((propInputM * 39.3701).toFixed(1)) : '';
    const propMm = propInputM != null ? propInputM * 1000 : null;
    return (
      <div className="rounded-lg border border-subtle bg-surface-raised/40 p-2 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wide text-content-tertiary">{t('sitl:customFrame.rotorDiscArea')}</div>
          <button
            type="button"
            onClick={onEstimateProp}
            className="text-[10px] text-blue-400 hover:text-blue-300 underline"
            title={t('sitl:customFrame.estimateTip')}
          >
            {t('sitl:customFrame.estimate')}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] text-content-secondary">
              {t('sitl:customFrame.propDiameter')} <span className="text-content-tertiary ml-1">{propMm != null ? t('sitl:customFrame.propUnitInMm', { mm: propMm.toFixed(0) }) : t('sitl:customFrame.propUnitIn')}</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={propDisplay}
              onChange={(e) => onPropInput(e.target.value)}
              className="w-full px-2 py-1 text-xs bg-surface-input border border-subtle rounded text-content font-mono tabular-nums focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-[11px] text-content-secondary">
              disc_area <span className="text-content-tertiary ml-1">{t('sitl:customFrame.discAreaUnit')}</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={getFieldDisplayValue('disc_area')}
              onChange={(e) => updateFieldFromDisplay('disc_area', e.target.value)}
              className="w-full px-2 py-1 text-xs bg-surface-input border border-subtle rounded text-content font-mono tabular-nums focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        <p className="text-[10px] text-content-tertiary leading-relaxed">
          {t('sitl:customFrame.discAutoHint', { count: f.num_motors || 0 })}
        </p>
      </div>
    );
  };

  return (
    <div className="bg-surface rounded-xl border border-subtle">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-surface-raised rounded-t-xl"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className="text-sm font-medium text-content">{t('sitl:customFrame.title')}</span>
          {customFramePath && (
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/20 text-emerald-300 font-medium">
              {t('sitl:customFrame.activeBadge')}
            </span>
          )}
        </div>
        <span className="text-[11px] text-content-secondary">{t('sitl:customFrame.savedCount', { count: list.length })}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-subtle pt-3">
          {/* Active frame indicator */}
          {customFramePath && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <div className="text-xs text-emerald-200">
                <span className="font-medium">{t('sitl:customFrame.activeLabel')}</span>{' '}
                {list.find((f) => f.path === customFramePath)?.name ?? t('common:unknown')}
                {customFrameMotors && <span className="text-content-secondary">{t('sitl:customFrame.motorsSuffix', { count: customFrameMotors })}</span>}
              </div>
              <button
                onClick={onDeactivate}
                className="text-[11px] text-emerald-300 hover:text-emerald-100 underline"
              >
                {t('sitl:customFrame.clear')}
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
              <option value="">{t('sitl:customFrame.newFromTemplate')}</option>
              {Object.keys(SITL_FRAME_TEMPLATES).map((k) => (
                <option key={k} value={k}>{sitlFrameTemplateName(k)}</option>
              ))}
            </select>
            <button
              onClick={onImport}
              disabled={busy}
              className="text-xs px-2 py-1 rounded bg-surface-raised border border-subtle hover:border-blue-500/50 text-content flex items-center gap-1 disabled:opacity-50"
            >
              <Upload className="w-3 h-3" /> {t('sitl:customFrame.importJson')}
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
                          {t('sitl:customFrame.active')}
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
                      title={isActive ? t('sitl:customFrame.stopUsingTip') : t('sitl:customFrame.useTip')}
                    >
                      {isActive ? t('sitl:customFrame.stopUsing') : t('sitl:customFrame.use')}
                    </button>
                    <button onClick={() => onEdit(item.id)} className="p-1 rounded hover:bg-surface text-content-secondary hover:text-blue-400" title={t('common:edit')}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onDuplicate(item.id)} disabled={busy} className="p-1 rounded hover:bg-surface text-content-secondary hover:text-blue-400 disabled:opacity-50" title={t('sitl:customFrame.duplicateTip')}>
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onExport(item.id)} className="p-1 rounded hover:bg-surface text-content-secondary hover:text-blue-400" title={t('sitl:customFrame.exportJson')}>
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onDelete(item.id, item.name)} className="p-1 rounded hover:bg-surface text-content-secondary hover:text-red-400" title={t('sitl:customFrame.delete')}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {list.length === 0 && editor.kind === 'closed' && (
            <p className="text-[11px] text-content-secondary italic">
              {t('sitl:customFrame.empty')}
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
                  placeholder={t('sitl:customFrame.namePlaceholder')}
                  className="flex-1 px-2 py-1 text-sm bg-surface-input border border-subtle rounded text-content focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={onSave}
                  disabled={busy || !editor.name.trim()}
                  className="text-xs px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
                >
                  {t('common:save')}
                </button>
                <button
                  onClick={() => setEditor({ kind: 'closed' })}
                  className="p-1 rounded hover:bg-surface-raised text-content-secondary"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {FIELD_GROUPS.map((group) => (
                <Fragment key={group.title}>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-content-tertiary mb-1">
                      {t(group.titleKey)}
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
                  {group.title === 'Physical' && renderDiscBlock()}
                </Fragment>
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
              <Trans i18nKey="sitl:customFrame.activeFooter" components={{ code: <code className="px-1 bg-surface-raised rounded" /> }} />
            </p>
          )}
        </div>
      )}
    </div>
  );
}
