import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { SavedConnection } from '../../stores/settings-store';

interface Props {
  recents: SavedConnection[];
  currentLabel: string;
  onSelect: (c: SavedConnection) => void;
  onRemove: (label: string) => void;
  disabled?: boolean;
}

const SEARCH_THRESHOLD = 6;

export function RecentConnectionsButton({ recents, currentLabel, onSelect, onRemove, disabled }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const timer = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  if (recents.length === 0) return null;

  const filtered = query.trim()
    ? recents.filter((c) => c.label.toLowerCase().includes(query.trim().toLowerCase()))
    : recents;

  return (
    <div ref={containerRef} className="absolute right-2 top-1/2 -translate-y-1/2">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors disabled:opacity-40 ${
          open
            ? 'bg-blue-500/15 text-blue-400'
            : 'text-content-tertiary hover:text-content-secondary hover:bg-surface-raised'
        }`}
        title={t('connection:recentConnections.title', { count: recents.length })}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-[10px] font-semibold tabular-nums leading-none">{recents.length}</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-default bg-surface shadow-xl z-50 overflow-hidden"
        >
          {recents.length > SEARCH_THRESHOLD && (
            <div className="p-2 border-b border-subtle">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('connection:recentConnections.filter')}
                className="w-full bg-input border border-default rounded px-2 py-1 text-xs text-content placeholder-content-tertiary focus:outline-none focus:border-blue-500/50"
              />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-content-tertiary text-center">{t('connection:recentConnections.noMatches')}</div>
            ) : (
              filtered.map((c) => {
                const isActive = c.label === currentLabel;
                return (
                  <div
                    key={c.label}
                    role="option"
                    aria-selected={isActive}
                    className={`group flex items-center transition-colors ${
                      isActive ? 'bg-blue-500/10' : 'hover:bg-surface-raised'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(c);
                        setOpen(false);
                      }}
                      className={`flex-1 text-left px-3 py-2 text-[11px] font-mono truncate ${
                        isActive ? 'text-blue-400 font-semibold' : 'text-content-secondary'
                      }`}
                    >
                      {c.label}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(c.label);
                      }}
                      className="px-2 py-2 text-content-tertiary hover:text-red-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      title={t('connection:recentConnections.removeFromRecent')}
                      aria-label={t('connection:recentConnections.removeLabel', { label: c.label })}
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
