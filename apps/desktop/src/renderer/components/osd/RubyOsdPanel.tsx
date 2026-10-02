/**
 * RubyFPV OSD editor panel - the left rail in the OSD Designer's RubyFPV mode.
 *
 * RubyFPV's built-in OSD is toggle-based, not drag-based: each element is on or
 * off per screen, RubyFPV auto-arranges them from a layout preset plus font and
 * transparency preferences, across 5 switchable screens. This panel edits that
 * model (via ruby-osd-store); the centre preview shows the resulting layout.
 */

import { useTranslation } from 'react-i18next';
import { Radio, LayoutGrid, SlidersHorizontal, RotateCcw, type LucideIcon } from 'lucide-react';
import { useRubyOsdStore, getFontSize, getTransparency } from '../../stores/ruby-osd-store';
import { RUBY_OSD_ELEMENTS, RUBY_OSD_PRESET, isElementEnabled, rubyOsdElementLabel, rubyOsdCategoryLabel, type RubyOsdCategory } from '../../utils/osd/ruby-osd';

const CATEGORY_ORDER: RubyOsdCategory[] = [
  'Flight', 'Power', 'GPS', 'Navigation', 'Link', 'Video', 'System', 'Instruments', 'Grid',
];

const PRESET_OPTIONS: { value: number; labelKey: string }[] = [
  { value: RUBY_OSD_PRESET.NONE, labelKey: 'common:none' },
  { value: RUBY_OSD_PRESET.MINIMAL, labelKey: 'common:minimal' },
  { value: RUBY_OSD_PRESET.COMPACT, labelKey: 'osd:rubyOsdPanel.presetCompact' },
  { value: RUBY_OSD_PRESET.DEFAULT, labelKey: 'common:default' },
  { value: RUBY_OSD_PRESET.CUSTOM, labelKey: 'osd:rubyOsdPanel.presetCustom' },
];

export function RubyOsdPanel() {
  const { t } = useTranslation();
  const params = useRubyOsdStore((s) => s.params);
  const editingScreen = useRubyOsdStore((s) => s.editingScreen);
  const setEditingScreen = useRubyOsdStore((s) => s.setEditingScreen);
  const setCurrentScreen = useRubyOsdStore((s) => s.setCurrentScreen);
  const toggleElement = useRubyOsdStore((s) => s.toggleElement);
  const setPreset = useRubyOsdStore((s) => s.setPreset);
  const setFontSize = useRubyOsdStore((s) => s.setFontSize);
  const setTransparency = useRubyOsdStore((s) => s.setTransparency);
  const reset = useRubyOsdStore((s) => s.reset);

  const screen = params.screens[editingScreen]!;
  const isActive = params.currentScreen === editingScreen;

  return (
    <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden">
      {/* What this composes */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-subtle bg-rose-500/[0.06]">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-rose-500/15 text-rose-300">
          <Radio className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-content leading-tight">{t('osd:rubyOsdPanel.title')}</div>
          <div className="text-[10px] text-content-tertiary leading-tight">{t('osd:rubyOsdPanel.subtitle')}</div>
        </div>
      </div>

      {/* Screen selector */}
      <Section title={t('osd:rubyOsdPanel.screen')} icon={LayoutGrid}>
        <div className="flex items-center gap-1 px-1">
          {params.screens.map((_, i) => (
            <button
              key={i}
              onClick={() => setEditingScreen(i)}
              className={`relative flex-1 h-8 rounded-md text-[11px] font-medium transition-colors ${
                i === editingScreen ? 'bg-rose-600/80 text-white' : 'text-content-secondary hover:text-content bg-surface-raised'
              }`}
              data-tip={t('osd:rubyOsdPanel.editScreen', { n: i + 1 })}
            >
              {i + 1}
              {params.currentScreen === i && (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-green-400" data-tip={t('osd:rubyOsdPanel.activeScreen')} />
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between px-2 pt-2">
          <span className="text-[10px] text-content-tertiary">
            {isActive ? t('osd:rubyOsdPanel.screenActive') : t('osd:rubyOsdPanel.editingScreen', { n: editingScreen + 1 })}
          </span>
          {!isActive && (
            <button
              onClick={() => setCurrentScreen(editingScreen)}
              className="text-[10px] font-medium px-2 py-1 rounded bg-surface-raised hover:bg-surface text-content"
            >
              {t('osd:rubyOsdPanel.setActive')}
            </button>
          )}
        </div>
      </Section>

      {/* Layout */}
      <Section title={t('osd:rubyOsdPanel.layout')} icon={SlidersHorizontal}>
        <Row label={t('osd:rubyOsdPanel.preset')}>
          <select
            value={screen.layoutPreset}
            onChange={(e) => setPreset(parseInt(e.target.value))}
            className="bg-surface-input text-content text-xs rounded-lg px-2.5 py-1 border border-subtle focus:border-rose-500 focus:outline-none"
          >
            {PRESET_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </select>
        </Row>
        <Row label={t('osd:rubyOsdPanel.fontSize', { value: getFontSize(screen.preferences) })}>
          <input type="range" min={0} max={6} step={1} value={getFontSize(screen.preferences)}
            onChange={(e) => setFontSize(parseInt(e.target.value))} className="w-full accent-rose-500" />
        </Row>
        <Row label={t('osd:rubyOsdPanel.transparency', { value: getTransparency(screen.preferences) })}>
          <input type="range" min={0} max={4} step={1} value={getTransparency(screen.preferences)}
            onChange={(e) => setTransparency(parseInt(e.target.value))} className="w-full accent-rose-500" />
        </Row>
      </Section>

      {/* Elements by category */}
      <Section title={t('osd:rubyOsdPanel.elements')} icon={Radio}>
        {CATEGORY_ORDER.map((cat) => {
          const items = RUBY_OSD_ELEMENTS.filter((e) => e.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat} className="mb-1">
              <div className="px-2 pt-1.5 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-content-tertiary">{rubyOsdCategoryLabel(cat)}</div>
              {items.map((el) => {
                const on = isElementEnabled(params, editingScreen, el.id);
                return (
                  <button
                    key={el.id}
                    onClick={() => toggleElement(el.id)}
                    className={`group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-surface-raised ${on ? 'text-content' : 'text-content-secondary'}`}
                  >
                    <span className="flex-1 truncate">{rubyOsdElementLabel(el)}</span>
                    <span className={`h-3.5 w-3.5 shrink-0 rounded-[4px] border transition-colors ${on ? 'border-rose-500 bg-rose-500' : 'border-strong bg-surface-input'} flex items-center justify-center`}>
                      {on && <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
        <button onClick={reset} className="mt-2 flex w-full items-center gap-2 text-xs px-2 py-1.5 rounded-md hover:bg-surface-raised text-content-secondary">
          <RotateCcw className="h-3.5 w-3.5" /> {t('osd:rubyOsdPanel.resetAll')}
        </button>
      </Section>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="border-b border-subtle px-3 py-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-content-secondary" />
        <h3 className="text-[10px] font-semibold text-content-secondary uppercase tracking-wider">{title}</h3>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5">
      <span className="text-[11px] text-content-secondary shrink-0">{label}</span>
      <div className="flex min-w-0 flex-1 justify-end">{children}</div>
    </div>
  );
}
