/**
 * Read-only viewer for an ArduDeck-shipped Lua command script.
 *
 * Two views, switchable via header tabs:
 *   - Graph  - hand-authored visual graph (read-only React Flow)
 *   - Source - syntax-highlighted Lua source with line numbers
 *
 * "Review fullscreen" opens the currently-active view in a viewport-sized
 * modal so users can inspect comfortably before consenting to install.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { tokenizeLua, tokensByLine, TOKEN_CLASS } from './lua-highlight';
import { ScriptGraphReadonlyView } from './ScriptGraphReadonlyView';
import { ARDUDECK_COMMANDS_NODES, ARDUDECK_COMMANDS_EDGES } from './ardudeck-commands-graph';

type ViewMode = 'graph' | 'source';

interface LuaCodePreviewProps {
  source: string;
  filename: string;
  version: string;
  sha256: string;
}

export function LuaCodePreview({ source, filename, version, sha256 }: LuaCodePreviewProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<ViewMode>('graph');
  const [fullscreen, setFullscreen] = useState(false);
  const sizeKb = useMemo(() => (new Blob([source]).size / 1024).toFixed(1), [source]);
  const shortSha = sha256.slice(0, 12);
  const lineGroups = useMemo(() => tokensByLine(tokenizeLua(source)), [source]);

  const handleCopySha = () => {
    navigator.clipboard.writeText(sha256).catch(() => {});
  };

  return (
    <>
      <div className="flex flex-col h-full min-h-0 rounded-lg border border-default overflow-hidden bg-surface-base">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-subtle bg-surface text-xs">
          <div className="flex items-center gap-3 text-content-secondary min-w-0">
            <ViewToggle value={view} onChange={setView} />
            <span className="font-mono text-content shrink-0">{filename}</span>
            <span className="shrink-0">v{version}</span>
            <span className="shrink-0">{sizeKb} KB</span>
            <button
              onClick={handleCopySha}
              className="font-mono hover:text-content transition-colors truncate"
              title={t('script-installer:luaCodePreview.copySha', { sha256 })}
            >
              {t('script-installer:luaCodePreview.shaLabel', { sha: shortSha })}
            </button>
          </div>
          <button
            onClick={() => setFullscreen(true)}
            className="px-2 py-1 text-[11px] rounded bg-purple-600/80 hover:bg-purple-500 text-white transition-colors shrink-0"
            title={t('script-installer:luaCodePreview.openLarger')}
          >
            {t('script-installer:luaCodePreview.reviewFullscreen')}
          </button>
        </div>

        {/* Body */}
        {view === 'graph' ? (
          <div className="flex-1 min-h-0">
            <ScriptGraphReadonlyView nodes={ARDUDECK_COMMANDS_NODES} edges={ARDUDECK_COMMANDS_EDGES} />
          </div>
        ) : (
          <CodeBody lineGroups={lineGroups} variant="inline" />
        )}
      </div>

      {fullscreen && createPortal(
        <FullscreenViewer
          filename={filename}
          version={version}
          sha256={sha256}
          sizeKb={sizeKb}
          lineGroups={lineGroups}
          initialView={view}
          onClose={() => setFullscreen(false)}
        />,
        document.body,
      )}
    </>
  );
}

// ─── View toggle ─────────────────────────────────────────────────────────────

function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const { t } = useTranslation();
  const tabClass = (active: boolean) => `px-2 py-0.5 text-[11px] rounded transition-colors ${
    active ? 'bg-purple-600 text-white' : 'bg-surface-raised text-content-secondary hover:text-content'
  }`;
  return (
    <div className="flex items-center gap-0.5 mr-1 shrink-0">
      <button onClick={() => onChange('graph')} className={tabClass(value === 'graph')}>{t('script-installer:luaCodePreview.graph')}</button>
      <button onClick={() => onChange('source')} className={tabClass(value === 'source')}>{t('script-installer:luaCodePreview.source')}</button>
    </div>
  );
}

// ─── Code body (used by both inline and fullscreen) ──────────────────────────

interface CodeBodyProps {
  lineGroups: ReturnType<typeof tokensByLine>;
  variant: 'inline' | 'fullscreen';
}

function CodeBody({ lineGroups, variant }: CodeBodyProps) {
  const sizeClass = variant === 'fullscreen'
    ? 'text-[13px] leading-[1.65]'
    : 'text-[11.5px] leading-[1.6]';

  return (
    <div className={`flex-1 min-h-0 overflow-auto font-mono ${sizeClass}`}>
      <table className="border-collapse w-full">
        <tbody>
          {lineGroups.map((line, i) => (
            <tr key={i} className="hover:bg-white/[0.02]">
              <td className="select-none text-right pr-3 pl-3 text-content-tertiary border-r border-subtle align-top whitespace-nowrap">
                {i + 1}
              </td>
              <td className="pl-3 pr-3 whitespace-pre">
                {line.length === 0 ? '\u00A0' : line.map((tok, j) => (
                  <span key={j} className={TOKEN_CLASS[tok.kind]}>{tok.text}</span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Fullscreen viewer ───────────────────────────────────────────────────────

interface FullscreenViewerProps {
  filename: string;
  version: string;
  sha256: string;
  sizeKb: string;
  lineGroups: ReturnType<typeof tokensByLine>;
  initialView: ViewMode;
  onClose: () => void;
}

function FullscreenViewer({ filename, version, sha256, sizeKb, lineGroups, initialView, onClose }: FullscreenViewerProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<ViewMode>(initialView);
  const handleCopySha = () => {
    navigator.clipboard.writeText(sha256).catch(() => {});
  };
  return (
    <div className="fixed inset-0 z-[3500] bg-black/90 flex flex-col p-6">
      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-default overflow-hidden bg-surface-base">
        <div className="flex items-center justify-between px-4 py-3 border-b border-subtle bg-surface text-sm">
          <div className="flex items-center gap-4 text-content-secondary min-w-0">
            <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider rounded bg-purple-600/30 text-purple-300 border border-purple-600/40">
              {view === 'graph' ? t('script-installer:luaCodePreview.graphReview') : t('script-installer:luaCodePreview.sourceReview')}
            </span>
            <ViewToggle value={view} onChange={setView} />
            <span className="font-mono text-content">{filename}</span>
            <span>v{version}</span>
            <span>{sizeKb} KB</span>
            <button
              onClick={handleCopySha}
              className="font-mono text-xs hover:text-content transition-colors"
              title={t('script-installer:luaCodePreview.copySha', { sha256 })}
            >
              {t('script-installer:luaCodePreview.shaLabel', { sha: sha256.slice(0, 16) })}
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium bg-surface-raised hover:bg-surface text-content rounded border border-subtle"
          >
            {t('script-installer:luaCodePreview.closeEsc')}
          </button>
        </div>
        {view === 'graph' ? (
          <div className="flex-1 min-h-0">
            <ScriptGraphReadonlyView nodes={ARDUDECK_COMMANDS_NODES} edges={ARDUDECK_COMMANDS_EDGES} />
          </div>
        ) : (
          <CodeBody lineGroups={lineGroups} variant="fullscreen" />
        )}
        <div className="px-4 py-2 border-t border-subtle bg-surface text-[11px] text-content-tertiary">
          {t('script-installer:luaCodePreview.footer')}
        </div>
      </div>
      <EscToClose onClose={onClose} />
    </div>
  );
}

/** Lightweight Esc-to-close handler, isolated from the viewer's render. */
function EscToClose({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return null;
}
