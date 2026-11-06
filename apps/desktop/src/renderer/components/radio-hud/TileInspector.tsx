import { ui } from '../ui/ui-hooks';
import { useTranslation } from 'react-i18next';
import { MousePointerClick, Plus, Trash2 } from 'lucide-react';
import { TILE_META, TILES_FIRST, type HudVehicleKind, type TileDef } from './hud-model';
import { TILE_ICONS } from './tile-icons';
import { ExperimentalBadge } from './ExperimentalBadge';

/** Settings of the tile picked on the preview, and the tiles that can still go on this screen. */
export function TileInspector({ tile, kind, unplaced, onVariant, onRemove, onAdd }: {
  tile: TileDef | null;
  kind: HudVehicleKind;
  unplaced: string[];
  onVariant: (variant: string) => void;
  onRemove: () => void;
  onAdd: (id: string) => void;
}) {
  const { t } = useTranslation();
  const k = 'radio-hud:studio';
  const meta = tile ? TILE_META[tile.id] : undefined;
  const first = TILES_FIRST[kind];
  const ordered = [...unplaced].sort((a, b) => {
    const ia = first.indexOf(a);
    const ib = first.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const suggested = ordered.filter((id) => first.includes(id));
  const rest = ordered.filter((id) => !first.includes(id));

  const icon = (id: string, size: string) => {
    const entry = TILE_ICONS[id];
    return entry ? <entry.Icon className={`${size} shrink-0 ${entry.color}`} /> : null;
  };
  const addButton = (id: string) => (
    <button key={id} type="button" onClick={() => onAdd(id)}
      className="group flex items-center gap-2 rounded-lg border border-subtle bg-surface-input px-2.5 py-1.5 text-left text-xs text-content hover:bg-surface-raised">
      {icon(id, 'h-3.5 w-3.5')}
      <span className="flex-1 truncate">{t(TILE_META[id]?.labelKey ?? id)}</span>
      {TILE_META[id]?.experimental && <ExperimentalBadge />}
      <Plus className="h-3 w-3 shrink-0 text-content-tertiary group-hover:text-content" />
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-3 rounded-xl border border-subtle bg-surface-input p-3.5">
        {tile && meta ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-content">{icon(tile.id, 'h-4 w-4')}{t(meta.labelKey)}{meta.experimental && <ExperimentalBadge />}</span>
              <button type="button" onClick={onRemove} aria-label={t('common:remove')} data-tip={t('common:remove')}
                className="shrink-0 rounded-md p-1.5 text-red-400 hover:bg-red-500/10">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs leading-relaxed text-content-secondary">{t(`${k}.tileHelp.${tile.id}`)}</p>
            {meta.variants && meta.variants.length > 1 && (
              <div className="space-y-1.5">
                <span className="text-[11px] uppercase tracking-wide text-content-tertiary">{t(`${k}.style`)}</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {meta.variants.map((v) => (
                    <button key={v} {...ui('chip', { active: v === tile.variant })} type="button" onClick={() => onVariant(v)}
                      className={`rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                        v === tile.variant ? 'border-teal-500/40 bg-teal-500/10 text-teal-300' : 'border-subtle bg-surface-input text-content-secondary hover:text-content'
                      }`}>
                      {t(`${k}.variant.${v}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="text-[11px] text-content-tertiary">{t(`${k}.dragHint`)}</p>
          </>
        ) : (
          <div className="flex items-start gap-2.5 text-xs text-content-secondary">
            <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0 text-content-tertiary" />
            {t(`${k}.pickATile`)}
          </div>
        )}
      </div>

      {unplaced.length > 0 && (
        <div className="space-y-2.5 rounded-xl border border-subtle bg-surface-input p-3.5">
          <span className="text-sm font-semibold text-content">{t(`${k}.addTile`)}</span>
          {suggested.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-1.5">{suggested.map(addButton)}</div>
          )}
          {rest.length > 0 && (
            <>
              {suggested.length > 0 && <span className="block text-[11px] text-content-tertiary">{t(`${k}.moreTiles`)}</span>}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-1.5">{rest.map(addButton)}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
