import { ui } from '../ui/ui-hooks';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, LayoutTemplate, Maximize2, Save, Trash2, X } from 'lucide-react';
import { HUD_TEMPLATES, MAX_PAGES, REF_SCREEN, fitTile, type HudVehicleKind, type TileDef } from './hud-model';
import type { SavedHudLayout } from './hud-layout-library';
import { ExperimentalBadge } from './ExperimentalBadge';

const KINDS: HudVehicleKind[] = ['copter', 'plane', 'rover', 'boat', 'sub'];

/** Lightbox: one screen at a time, slid with the arrows, the keyboard or the thumbnails. */
function ScreenLightbox({ title, pages, start, renderScreen, footer, onClose }: {
  title: string;
  pages: TileDef[][];
  start: number;
  renderScreen: (tiles: TileDef[]) => ReactNode;
  footer: (at: number) => ReactNode;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const k = 'radio-hud:studio';
  const [at, setAt] = useState(start);
  const count = pages.length;
  const go = (d: number) => setAt((v) => (v + d + count) % count);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // go and onClose only close over count, which is fixed for this lightbox
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);
  const arrow = (d: number) => (
    <button type="button" onClick={() => go(d)} disabled={count < 2}
      aria-label={d < 0 ? t(`${k}.previousScreen`) : t(`${k}.nextScreen`)}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-raised text-content hover:bg-surface-inset disabled:invisible">
      {d < 0 ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
    </button>
  );
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-6"
      onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-5xl flex-col gap-4">
        <div className="flex items-center gap-3 text-white">
          <h3 className="flex-1 text-base font-semibold">{title}</h3>
          <span className="text-sm text-white/60">{at + 1} / {count}</span>
          <button type="button" onClick={onClose} aria-label={t('common:close')} className="rounded p-1.5 text-white/70 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-center gap-4">
          {arrow(-1)}
          <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-white/10">{renderScreen(pages[at] ?? [])}</div>
          {arrow(1)}
        </div>
        {count > 1 && (
          <div className="flex justify-center gap-2" role="tablist" aria-label={t(`${k}.screensOfTemplate`)}>
            {pages.map((p, i) => (
              <button key={i} type="button" role="tab" aria-selected={i === at} aria-label={t(`${k}.screenN`, { n: i + 1 })}
                onClick={() => setAt(i)}
                className={`w-28 overflow-hidden rounded-md border-2 transition-opacity ${i === at ? 'border-teal-400' : 'border-transparent opacity-50 hover:opacity-90'}`}>
                {renderScreen(p)}
              </button>
            ))}
          </div>
        )}
        <div className="mx-auto w-full max-w-md">{footer(at)}</div>
      </div>
    </div>
  );
}

/** One screen of a template large, numbered tabs to flip through the rest; clicking it opens them all. */
function TemplateScreens({ pages, shown, onShown, renderScreen, onOpen }: {
  pages: TileDef[][];
  shown: number;
  onShown: (index: number) => void;
  renderScreen: (tiles: TileDef[]) => ReactNode;
  onOpen: (start: number) => void;
}) {
  const { t } = useTranslation();
  const k = 'radio-hud:studio';
  return (
    <div className="space-y-2">
      <div className="group relative">
        <button type="button" onClick={() => onOpen(shown)} aria-label={t(`${k}.showAllScreens`)}
          className="relative block w-full overflow-hidden rounded-md border border-subtle text-left">
          {renderScreen(pages[shown] ?? pages[0] ?? [])}
          <span className="absolute bottom-2 right-2 hidden items-center gap-1 rounded-md bg-black/75 px-2 py-1 text-[11px] text-white group-hover:flex">
            <Maximize2 className="h-3 w-3" />
            {t(`${k}.showAllScreens`)}
          </span>
        </button>
        {pages.length > 1 && ([-1, 1] as const).map((d) => (
          <button key={d} type="button"
            onClick={() => onShown((shown + d + pages.length) % pages.length)}
            aria-label={d < 0 ? t(`${k}.previousScreen`) : t(`${k}.nextScreen`)}
            className={`absolute top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white opacity-70 transition-opacity hover:bg-black/80 hover:opacity-100 group-hover:opacity-100 ${d < 0 ? 'left-1.5' : 'right-1.5'}`}>
            {d < 0 ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ))}
      </div>
      {pages.length > 1 ? (
        <div className="flex h-6 items-center gap-1.5" role="tablist" aria-label={t(`${k}.screensOfTemplate`)}>
          <span className="mr-0.5 text-[11px] text-content-tertiary">{t(`${k}.screenWord`)}</span>
          {pages.map((_, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === shown} onClick={() => onShown(i)}
              aria-label={t(`${k}.screenN`, { n: i + 1 })}
              className={`h-6 min-w-[24px] rounded-md border px-1.5 text-[11px] transition-colors ${
                i === shown ? 'border-teal-500/40 bg-teal-500/15 text-teal-300' : 'border-subtle text-content-secondary hover:text-content'
              }`}>
              {i + 1}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex h-6 items-center text-[11px] text-content-tertiary">{t(`${k}.singleScreen`)}</div>
      )}
    </div>
  );
}

/** A gallery card: screens on top, text in the middle, actions pinned to the bottom so rows line up. */
function TemplateCard({ pages, renderScreen, onOpen, children, actions }: {
  pages: TileDef[][];
  renderScreen: (tiles: TileDef[]) => ReactNode;
  onOpen: (start: number) => void;
  children: ReactNode;
  actions: (shown: number) => ReactNode;
}) {
  const [shown, setShown] = useState(0);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-subtle bg-surface-input p-4">
      <TemplateScreens pages={pages} shown={shown} onShown={setShown} renderScreen={renderScreen} onOpen={onOpen} />
      {children}
      <div className="mt-auto">{actions(shown)}</div>
    </div>
  );
}

/** Template gallery: a template is a full set of screens; "add" puts the screen being shown next to yours. */
export function TemplateGallery({ renderScreen: renderFor, mode, kind, connectedKind, screen, saved, roomForScreens, onClose, onUse, onDeleteSaved, onSaveCurrent }: {
  renderScreen: (tiles: TileDef[], kind: HudVehicleKind) => ReactNode;
  mode: 'replace' | 'add';
  kind: HudVehicleKind;
  connectedKind: HudVehicleKind | null;
  screen: { w: number; h: number };
  saved: SavedHudLayout[];
  roomForScreens: number;
  onClose: () => void;
  onUse: (pages: TileDef[][], how: 'replace' | 'add') => void;
  onDeleteSaved: (name: string) => void;
  onSaveCurrent: (name: string) => void;
}) {
  const { t } = useTranslation();
  const k = 'radio-hud:studio';
  const [filter, setFilter] = useState<HudVehicleKind>(kind);
  const renderScreen = (tiles: TileDef[]) => renderFor(tiles, filter);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState<{ title: string; pages: TileDef[][]; start: number } | null>(null);
  const fit = (pages: TileDef[][], from: { w: number; h: number }) => pages.map((p) => p.map((tile) => fitTile(tile, from, screen)));
  const templates = HUD_TEMPLATES.filter((tpl) => tpl.vehicles.includes(filter));

  const full = roomForScreens === 0;
  // "add" puts exactly the screen being looked at next to the pilot's own
  const actions = (pages: TileDef[][], shown: number) => (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        {mode === 'replace' ? (
          <button {...ui('button', { variant: 'primary' })} type="button" onClick={() => onUse(pages, 'replace')}
            data-tip={t(`${k}.useAllTip`)}
            className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500">
            {t(`${k}.useAllScreens`)}
          </button>
        ) : null}
        <button {...ui('button', { variant: 'secondary' })} type="button" onClick={() => onUse([pages[shown] ?? pages[0] ?? []], 'add')} disabled={full}
          data-tip={full ? undefined : t(`${k}.addScreenTip`)}
          className="flex-1 rounded-lg border border-subtle bg-surface-raised px-3 py-1.5 text-xs text-content hover:bg-surface-inset disabled:cursor-not-allowed disabled:opacity-40">
          {pages.length > 1 ? t(`${k}.addScreenN`, { n: shown + 1 }) : t(`${k}.addThisScreen`)}
        </button>
      </div>
      {full && <p className="text-[11px] text-content-tertiary">{t(`${k}.screensFull`, { max: MAX_PAGES })}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-overlay p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(`${k}.templates`)}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-6xl flex-col gap-5 overflow-hidden rounded-xl border border-subtle bg-surface-solid p-6 shadow-2xl"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-teal-500/20 bg-teal-500/10">
            <LayoutTemplate className="h-4 w-4 text-teal-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-content">{t(`${k}.templates`)}</h2>
            <p className="text-xs text-content-secondary">{t(`${k}.templatesHint`)}</p>
          </div>
          {saving ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!saveName.trim()) return;
                onSaveCurrent(saveName.trim());
                setSaveName('');
                setSaving(false);
              }}
              className="flex items-center gap-2"
            >
              <input {...ui('input')} autoFocus value={saveName} onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setSaving(false); } }}
                aria-label={t(`${k}.templateNamePlaceholder`)}
                placeholder={t(`${k}.templateNamePlaceholder`)}
                className="w-56 rounded-lg border border-subtle bg-surface-input px-2.5 py-1.5 text-sm text-content placeholder:text-content-tertiary focus:border-blue-500 focus:outline-none" />
              <button {...ui('button', { variant: 'primary' })} type="submit" disabled={!saveName.trim()}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40">
                {t('common:save')}
              </button>
              <button type="button" onClick={() => setSaving(false)} className="rounded-lg px-2 py-1.5 text-xs text-content-secondary hover:text-content">
                {t('common:cancel')}
              </button>
            </form>
          ) : (
            <button {...ui('button', { variant: 'secondary' })} type="button" onClick={() => setSaving(true)}
              className="flex items-center gap-1.5 rounded-lg border border-subtle bg-surface-raised px-3 py-1.5 text-xs text-content hover:bg-surface-inset">
              <Save className="h-3.5 w-3.5 text-content-tertiary" />
              {t(`${k}.saveCurrent`)}
            </button>
          )}
          <button type="button" onClick={onClose} aria-label={t('common:close')} className="rounded p-1.5 text-content-secondary hover:text-content">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div role="group" aria-label={t(`${k}.vehicle`)} className="flex flex-wrap gap-2">
          {KINDS.map((v) => (
            <button key={v} {...ui('chip', { active: v === filter })} type="button" onClick={() => setFilter(v)}
              className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors ${
                v === filter ? 'border-teal-500/40 bg-teal-500/15 text-teal-300' : 'border-subtle bg-surface-input text-content-secondary hover:text-content'
              }`}>
              {t(`${k}.kind.${v}`)}{v === connectedKind ? ` ${t(`${k}.connectedSuffix`)}` : ''}
            </button>
          ))}
        </div>

        <div className="-mr-2 flex-1 space-y-5 overflow-y-auto pr-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((tpl) => {
              const pages = fit(tpl.pages, REF_SCREEN);
              return (
                <TemplateCard key={tpl.id} pages={pages} renderScreen={renderScreen}
                  onOpen={(start) => setLightbox({ title: t(`${k}.template.${tpl.id}.name`), pages, start })}
                  actions={(shown) => actions(pages, shown)}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-content">{t(`${k}.template.${tpl.id}.name`)}</span>
                    <span className="text-xs text-content-tertiary">{t(`${k}.screenCount`, { count: pages.length })}</span>
                    {tpl.experimental && <ExperimentalBadge />}
                  </div>
                  <p className="text-xs leading-relaxed text-content-secondary">{t(`${k}.template.${tpl.id}.desc`)}</p>
                </TemplateCard>
              );
            })}
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-content-tertiary">{t(`${k}.yourTemplates`)}</h3>
            {saved.length === 0 && <p className="text-xs text-content-tertiary">{t(`${k}.noSavedTemplates`)}</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {saved.map((s) => {
                const pages = fit(s.pages, s.screen);
                return (
                  <TemplateCard key={s.name} pages={pages} renderScreen={renderScreen}
                    onOpen={(start) => setLightbox({ title: s.name, pages, start })}
                    actions={(shown) => actions(pages, shown)}>
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate text-sm font-semibold text-content">{s.name}</span>
                      <span className="text-xs text-content-tertiary">{t(`${k}.screenCount`, { count: pages.length })}</span>
                      <button type="button" onClick={() => onDeleteSaved(s.name)} aria-label={t(`${k}.deleteTemplate`, { name: s.name })}
                        data-tip={t(`${k}.deleteTemplate`, { name: s.name })}
                        className="rounded p-1 text-content-tertiary hover:text-red-400">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TemplateCard>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {lightbox && (
        <ScreenLightbox
          title={lightbox.title}
          pages={lightbox.pages}
          start={lightbox.start}
          renderScreen={renderScreen}
          footer={(at) => actions(lightbox.pages, at)}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
