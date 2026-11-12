import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pentagon, Spline, MapPin, Eye, EyeOff, Crosshair, Grid3x3, Trash2, Tag, FileUp, ListPlus, Plus, Layers } from 'lucide-react';
import {
  useGuideStore,
  GUIDE_ROLES,
  GUIDE_ROLE_COLORS,
  GUIDE_PALETTE,
  type MapGuide,
  type GuideGeometry,
  type GuideRole,
} from '../../stores/guide-store';
import { startPick } from '../../modules/module-map-registry';
import { polygonArea } from '../survey/geo-math';
import { SurveyedPointsDialog } from './SurveyedPointsDialog';

const GEOMETRY_ICON: Record<GuideGeometry, typeof Pentagon> = { polygon: Pentagon, line: Spline, points: MapPin };

const geometryOf = (g: MapGuide): GuideGeometry => g.kind ?? 'polygon';

function lineKm(points: MapGuide['polygon']): number {
  let m = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1]!;
    const q = points[i]!;
    const dy = (q.lat - p.lat) * 111_320;
    const dx = (q.lng - p.lng) * 111_320 * Math.cos((p.lat * Math.PI) / 180);
    m += Math.hypot(dx, dy);
  }
  return m / 1000;
}

function Section({ icon, title, action, children, flush }: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <div className="bg-surface-raised/50 rounded-lg border border-subtle overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-subtle">
        <span className="text-content-secondary flex items-center">{icon}</span>
        <h3 className="text-xs font-medium text-content flex-1">{title}</h3>
        {action}
      </div>
      <div className={flush ? '' : 'px-3 py-2.5'}>{children}</div>
    </div>
  );
}

function GuideRow({ guide }: { guide: MapGuide }): JSX.Element {
  const { t } = useTranslation();
  const { patchGuide, toggleGuide, removeGuide, focusGuide, startSurveyFromGuide } = useGuideStore.getState();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const geometry = geometryOf(guide);
  const Icon = GEOMETRY_ICON[geometry];
  const canSurvey = geometry === 'polygon' ? guide.polygon.length >= 3 : geometry === 'line' ? guide.polygon.length >= 2 : false;
  const size = geometry === 'polygon'
    ? t('mission:guidesPanel.hectares', { value: (polygonArea(guide.polygon) / 10_000).toFixed(1) })
    : geometry === 'line'
      ? t('mission:guidesPanel.km', { value: lineKm(guide.polygon).toFixed(2) })
      : t('mission:guidesPanel.points', { count: guide.polygon.length });
  const iconBtn = 'w-7 h-7 grid place-items-center rounded-md text-content-tertiary hover:text-content hover:bg-surface-raised transition-colors';
  const pinned = confirmDelete || paletteOpen;

  return (
    <div className="group relative flex items-center gap-2.5 px-3 py-2 hover:bg-surface-raised/60 transition-colors">
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setPaletteOpen((o) => !o)}
          className={`w-8 h-8 rounded-lg grid place-items-center transition-opacity ${guide.visible ? '' : 'opacity-40 grayscale'}`}
          style={{ backgroundColor: `${guide.color}22` }}
          data-tip={t('mission:guidesPanel.color')}
        >
          <Icon className="w-4 h-4" style={{ color: guide.color }} />
        </button>
        {paletteOpen && (
          <div className="absolute left-0 top-full mt-1 z-20 grid grid-cols-4 gap-1 p-1.5 rounded-lg border border-subtle bg-surface-solid shadow-xl">
            {GUIDE_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { patchGuide(guide.id, { color: c }); setPaletteOpen(false); }}
                className={`w-5 h-5 rounded ring-1 ring-black/20 ${c === guide.color ? 'outline outline-2 outline-offset-1 outline-blue-500' : ''}`}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <input
          value={guide.name}
          onChange={(e) => patchGuide(guide.id, { name: e.target.value })}
          className={`w-full bg-transparent text-xs font-medium rounded px-1 -mx-1 py-0.5 focus:outline-none focus:bg-surface-input ${guide.visible ? 'text-content' : 'text-content-tertiary'}`}
          aria-label={t('mission:guidesPanel.name')}
        />
        <div className="flex items-center gap-1 text-[10px] text-content-tertiary min-w-0">
          <select
            value={guide.role ?? 'area'}
            onChange={(e) => {
              const role = e.target.value as GuideRole;
              patchGuide(guide.id, { role, color: GUIDE_ROLE_COLORS[role] });
            }}
            className="appearance-none bg-transparent text-content-secondary hover:text-content cursor-pointer focus:outline-none"
            aria-label={t('mission:guidesPanel.role')}
            data-tip={t('mission:guidesPanel.role')}
          >
            {GUIDE_ROLES.map((r) => <option key={r} value={r}>{t(`mission:guidesPanel.roles.${r}`)}</option>)}
          </select>
          <span>·</span>
          <span className="font-mono tabular-nums shrink-0">{size}</span>
          {guide.holes.length > 0 && <span className="shrink-0">· {t('mission:guidesPanel.holes', { count: guide.holes.length })}</span>}
          {(guide.source || guide.notes) && <span className="truncate" data-tip={guide.notes}>· {guide.source ?? guide.notes}</span>}
        </div>
      </div>

      <div className={`items-center gap-0.5 shrink-0 ${pinned ? 'flex' : 'hidden group-hover:flex group-focus-within:flex'}`}>
        <button type="button" className={iconBtn} onClick={() => focusGuide(guide.id)} data-tip={t('mission:guidesPanel.zoomTo')}>
          <Crosshair className="w-3.5 h-3.5" />
        </button>
        {canSurvey && (
          <button type="button" className={iconBtn} onClick={() => startSurveyFromGuide(guide.id)} data-tip={geometry === 'line' ? t('mission:guidesPanel.surveyLine') : t('mission:guidesPanel.surveyArea')}>
            <Grid3x3 className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          className={confirmDelete ? 'h-7 px-2 rounded-md text-[11px] font-medium text-white bg-red-600 hover:bg-red-500' : `${iconBtn} hover:text-red-500`}
          onClick={() => (confirmDelete ? removeGuide(guide.id) : setConfirmDelete(true))}
          onMouseLeave={() => setConfirmDelete(false)}
          data-tip={confirmDelete ? undefined : t('mission:guidesPanel.delete')}
        >
          {confirmDelete ? t('mission:guidesPanel.confirmDelete') : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>
      <button type="button" className={`${iconBtn} shrink-0`} onClick={() => toggleGuide(guide.id)} data-tip={guide.visible ? t('mission:guidesPanel.hide') : t('mission:guidesPanel.show')}>
        {guide.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

const ADD_TOOLS: Array<{ id: 'polygon' | 'line' | 'points' | 'import' | 'enter'; icon: typeof Pentagon; color: string; labelKey: string; tipKey?: string }> = [
  { id: 'polygon', icon: Pentagon, color: 'text-orange-400', labelKey: 'mission:guidesPanel.addArea' },
  { id: 'line', icon: Spline, color: 'text-teal-400', labelKey: 'mission:guidesPanel.addLine' },
  { id: 'points', icon: MapPin, color: 'text-emerald-400', labelKey: 'mission:guidesPanel.addPoint' },
  { id: 'import', icon: FileUp, color: 'text-sky-400', labelKey: 'mission:guidesPanel.importShort', tipKey: 'mission:guidesButton.tip' },
  { id: 'enter', icon: ListPlus, color: 'text-violet-400', labelKey: 'mission:guidesPanel.enterShort', tipKey: 'mission:guidesButton.pointsTip' },
];

/** The mission planner's Guides tab: every reference shape (imported, drawn, from an agent or a cargo) in one list. */
export function GuidesPanel(): JSX.Element {
  const { t } = useTranslation();
  const guides = useGuideStore((s) => s.guides);
  const showLabels = useGuideStore((s) => s.showLabels);
  const { setShowLabels, setAllVisible, clearGuides, importGuides, upsertGuide, focusGuide } = useGuideStore.getState();
  const [drawing, setDrawing] = useState<GuideGeometry | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [pointsDialog, setPointsDialog] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const showToast = (text: string, kind: 'success' | 'error') => setNotice({ text, ok: kind === 'success' });
  const anyHidden = guides.some((g) => !g.visible);

  const draw = async (geometry: GuideGeometry) => {
    if (drawing) return;
    setDrawing(geometry);
    try {
      const points = await startPick(t(`mission:guidesPanel.drawPrompt.${geometry}`), geometry === 'line' ? 'path' : geometry === 'points' ? 'point' : 'polygon');
      if (!points || points.length === 0) return;
      const n = useGuideStore.getState().guides.filter((g) => geometryOf(g) === geometry).length + 1;
      const guide = upsertGuide({ name: t(`mission:guidesPanel.defaultName.${geometry}`, { n }), kind: geometry, polygon: points, role: geometry === 'points' ? 'note' : 'area' });
      focusGuide(guide.id);
    } finally {
      setDrawing(null);
    }
  };

  const runTool = (id: (typeof ADD_TOOLS)[number]['id']) => {
    if (id === 'import') {
      void importGuides().then((res) => {
        if (res.ok) showToast(t('mission:guidesButton.added', { count: res.count }), 'success');
        else if (res.error) showToast(res.error, 'error');
      });
    } else if (id === 'enter') {
      setPointsDialog(true);
    } else {
      void draw(id);
    }
  };

  const headerBtn = 'w-6 h-6 grid place-items-center rounded-md text-content-tertiary hover:text-content hover:bg-surface-raised transition-colors';

  return (
    <div className="h-full overflow-y-auto bg-surface p-3 space-y-3">
      <Section icon={<Plus className="w-3.5 h-3.5" />} title={t('mission:guidesPanel.addTitle')}>
        <div className="grid grid-cols-5 gap-1 rounded-lg border border-subtle bg-surface p-1">
          {ADD_TOOLS.map((tool) => {
            const Icon = tool.icon;
            const busy = drawing !== null && (tool.id === drawing);
            return (
              <button
                key={tool.id}
                type="button"
                disabled={drawing !== null && !busy}
                onClick={() => runTool(tool.id)}
                data-tip={tool.tipKey ? t(tool.tipKey) : undefined}
                className={`flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[11px] text-content-secondary hover:text-content hover:bg-surface-raised transition-colors disabled:opacity-40 ${busy ? 'bg-surface-raised text-content' : ''}`}
              >
                <Icon className={`w-4 h-4 ${tool.color}`} />
                <span className="leading-tight whitespace-nowrap">{t(tool.labelKey)}</span>
              </button>
            );
          })}
        </div>
        {drawing && <div className="mt-2 text-[11px] text-content-secondary">{t(`mission:guidesPanel.drawPrompt.${drawing}`)}</div>}
        {notice && (
          <div className={`mt-2 text-[11px] ${notice.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{notice.text}</div>
        )}
      </Section>

      <Section
        icon={<Layers className="w-3.5 h-3.5" />}
        title={guides.length > 0 ? t('mission:guidesPanel.onMapCount', { count: guides.length }) : t('mission:guidesPanel.onMap')}
        flush
        action={
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setShowLabels(!showLabels)}
              className={`${headerBtn} ${showLabels ? 'text-sky-400 bg-sky-500/10' : ''}`}
              data-tip={t('mission:guidesPanel.showLabels')}
              aria-pressed={showLabels}
            >
              <Tag className="w-3.5 h-3.5" />
            </button>
            {guides.length > 0 && (
              <button type="button" className={headerBtn} onClick={() => setAllVisible(anyHidden)} data-tip={anyHidden ? t('mission:guidesButton.showAll') : t('mission:guidesButton.hideAll')}>
                {anyHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
            )}
            {guides.length > 0 && (
              <button
                type="button"
                className={confirmClear ? 'h-6 px-2 rounded-md text-[11px] font-medium text-white bg-red-600 hover:bg-red-500' : `${headerBtn} hover:text-red-500`}
                onClick={() => { if (confirmClear) { clearGuides(); setConfirmClear(false); } else setConfirmClear(true); }}
                onMouseLeave={() => setConfirmClear(false)}
                data-tip={confirmClear ? undefined : t('mission:guidesButton.removeAll')}
              >
                {confirmClear ? t('mission:guidesButton.removeAllConfirm', { count: guides.length }) : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        }
      >
        {guides.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11px] text-content-tertiary">{t('mission:guidesPanel.empty')}</div>
        ) : (
          <div className="divide-y divide-subtle">
            {guides.map((g) => <GuideRow key={g.id} guide={g} />)}
          </div>
        )}
      </Section>

      {pointsDialog && <SurveyedPointsDialog onClose={() => setPointsDialog(false)} showToast={showToast} />}
    </div>
  );
}
