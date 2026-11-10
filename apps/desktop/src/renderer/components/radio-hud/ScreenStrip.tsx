import { ui } from '../ui/ui-hooks';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, LayoutTemplate, Plus, Square, X } from 'lucide-react';
import { TILE_META, TILE_TOP, type TileDef } from './hud-model';

/** A screen drawn small from its tile geometry, so it reads like the radio without rendering it. */
export function ScreenThumb({ tiles, screen, labels = true }: {
  tiles: TileDef[];
  screen: { w: number; h: number };
  labels?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="relative w-full overflow-hidden rounded bg-[#0d1820]"
      style={{ aspectRatio: `${screen.w} / ${screen.h}` }}
    >
      <div className="absolute inset-x-0 top-0 bg-[#16242f]" style={{ height: `${(TILE_TOP - 10) / screen.h * 100}%` }} />
      {tiles.map((tile, i) => (
        <div
          key={`${tile.id}-${i}`}
          className="absolute flex items-start overflow-hidden border border-[#2b3d4c] bg-[#1b2c38] p-0.5"
          style={{
            left: `${tile.x / screen.w * 100}%`,
            top: `${tile.y / screen.h * 100}%`,
            width: `${tile.w / screen.w * 100}%`,
            height: `${tile.h / screen.h * 100}%`,
          }}
        >
          {labels && (
            <span className="truncate text-[7px] uppercase leading-none text-[#9ca3af]">
              {t(TILE_META[tile.id]?.labelKey ?? tile.id)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** The screens that go onto the radio, as slides: pick, add, remove. */
export function ScreenStrip({ renderScreen, pages, active, screen, maxPages, onPick, onRemove, onAddEmpty, onDuplicate, onAddFromTemplate }: {
  /** Draws a real screen; falls back to the geometry sketch. */
  renderScreen?: (tiles: TileDef[]) => ReactNode;
  pages: TileDef[][];
  active: number;
  screen: { w: number; h: number };
  maxPages: number;
  onPick: (index: number) => void;
  onRemove: (index: number) => void;
  onAddEmpty: () => void;
  onDuplicate: () => void;
  onAddFromTemplate: () => void;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const k = 'radio-hud:studio';

  return (
    <div className="flex items-stretch gap-2.5 overflow-x-auto pb-1">
      {pages.map((tiles, i) => (
        <div key={i} className="group relative w-[190px] shrink-0">
          <button
            type="button"
            onClick={() => onPick(i)}
            aria-label={t(`${k}.screenN`, { n: i + 1 })}
            className={`w-full rounded-lg border-2 bg-surface-input p-1.5 text-left transition-colors ${
              i === active ? 'border-teal-500' : 'border-subtle hover:border-content-tertiary'
            }`}
          >
            {renderScreen ? renderScreen(tiles) : <ScreenThumb tiles={tiles} screen={screen} />}
            <span className="mt-1.5 block text-xs text-content">
              <span className="text-content-tertiary">{i + 1}</span> {t(`${k}.screenTiles`, { count: tiles.length })}
            </span>
          </button>
          {pages.length > 1 && (
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label={t(`${k}.removeScreen`, { n: i + 1 })}
              data-tip={t(`${k}.removeScreen`, { n: i + 1 })}
              className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded bg-surface-solid text-content-secondary hover:text-red-400 group-hover:flex"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
      {pages.length < maxPages && (
        <div className="relative w-[110px] shrink-0">
          <button
            {...ui('option')}
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-content-tertiary/50 text-xs text-content-secondary hover:border-content-tertiary hover:text-content"
          >
            <Plus className="h-4 w-4" />
            {t(`${k}.addScreen`)}
          </button>
          {menuOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-lg border border-subtle bg-surface-solid p-1 shadow-lg">
              {[
                { icon: <LayoutTemplate className="h-3.5 w-3.5" />, label: t(`${k}.addFromTemplate`), run: onAddFromTemplate },
                { icon: <Copy className="h-3.5 w-3.5" />, label: t(`${k}.duplicateScreen`), run: onDuplicate },
                { icon: <Square className="h-3.5 w-3.5" />, label: t(`${k}.emptyScreen`), run: onAddEmpty },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => { setMenuOpen(false); item.run(); }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-content hover:bg-surface-raised"
                >
                  <span className="text-content-tertiary">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
