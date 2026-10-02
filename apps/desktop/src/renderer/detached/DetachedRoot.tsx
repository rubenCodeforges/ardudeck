/**
 * DetachedRoot — top-level component rendered inside every pop-out window.
 *
 * Reads the URL query string to figure out which registered component to
 * mount, hydrates the window's stores from the main process's IPC broadcasts,
 * and renders the component edge-to-edge with no nav rail / sidebar / app
 * chrome. The OS title bar provides the only "window" affordance.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { getDetachedComponent } from './component-registry';
import { useDetachedSubscriptions } from './useDetachedSubscriptions';
import { initializeSettings } from '../stores/settings-store';
import { useTheme } from '../hooks/useTheme';
import { GlobalTooltip } from '../components/GlobalTooltip';

interface ParsedQuery {
  componentId: string;
  instance: string | null;
  title: string;
  props: Record<string, unknown>;
}

function parseQuery(): ParsedQuery {
  const p = new URLSearchParams(window.location.search);
  const componentId = p.get('componentId') ?? '';
  const instance = p.get('instance');
  const title = p.get('title') ?? componentId;
  const propsRaw = p.get('props');
  let props: Record<string, unknown> = {};
  if (propsRaw) {
    try {
      const parsed = JSON.parse(propsRaw);
      if (parsed && typeof parsed === 'object') {
        props = parsed as Record<string, unknown>;
      }
    } catch {
      // Bad serialization — fall back to empty props.
    }
  }
  return { componentId, instance, title, props };
}

export function DetachedRoot(): JSX.Element {
  const { t } = useTranslation();
  const query = useMemo(parseQuery, []);
  const def = getDetachedComponent(query.componentId);

  // Hydrate settings (theme preference, vehicle profile, etc.) from
  // electron-store. Without this the detached window starts with the
  // default 'dark' theme even if the user is in light mode.
  useEffect(() => {
    initializeSettings();
  }, []);

  // Apply the .light class on <html> so the theme tokens resolve to the
  // user's chosen palette. Mirrors what AppShell does in the main window.
  useTheme();

  // Set the document title so the OS shows the right text. Component-specific
  // updates (e.g. graph field path) come through props.
  useEffect(() => {
    document.title = query.title;
  }, [query.title]);

  // Wire up IPC subscriptions for telemetry/connection/status/inspector.
  useDetachedSubscriptions();

  if (!def) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-surface-base text-content-secondary p-6 text-center">
        <div>
          <div className="text-lg font-medium text-content mb-2">{t('detached:detachedRoot.unknownComponent')}</div>
          <div className="text-sm">
            <Trans
              i18nKey="detached:detachedRoot.notRegistered"
              values={{ id: query.componentId || t('detached:detachedRoot.missing') }}
              components={{ code: <code className="text-amber-500" /> }}
            />
          </div>
        </div>
      </div>
    );
  }

  const Component = def.Component;
  return (
    <div className="h-screen w-screen overflow-hidden bg-surface-base text-content flex flex-col">
      <DetachedChrome title={query.title} />
      <div className="flex-1 min-h-0">
        <Component {...query.props} />
      </div>
      {/* Body-level portal so data-tip tooltips render in this window too —
          App.tsx mounts its own; detached windows are a separate document. */}
      <GlobalTooltip />
    </div>
  );
}

/**
 * Thin window chrome bar in every detached window. Lives ABOVE the panel
 * content so it never collides with the panel's own header/toolbar. Contains
 * the two affordances every detached window needs:
 *   - left: a "Dock back" action that closes this detached window (and lets
 *     the docked sibling, if any, take over)
 *   - right: a pin toggle that keeps the window above ArduDeck's main window
 *
 * Kept short (28px) so it doesn't eat into the panel content, and styled to
 * blend into the OS title bar above it. No center title — the OS title bar
 * already shows that.
 */
function DetachedChrome({ title }: { title: string }): JSX.Element {
  const { t } = useTranslation();
  const [pinned, setPinned] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    window.electronAPI?.getSelfAlwaysOnTop?.().then((v: boolean) => {
      if (mounted) setPinned(!!v);
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const togglePin = useCallback(async () => {
    const next = await window.electronAPI.setSelfAlwaysOnTop(!pinned);
    setPinned(next);
  }, [pinned]);

  const dockBack = useCallback(() => {
    // Closing the window is the "re-dock" action: if there's a docked
    // sibling in the main window it becomes visible again, and if not the
    // user can re-open from the nav rail or the inspector. We focus the
    // main window first so the dock-back feels like a navigation move
    // rather than just a window close.
    window.electronAPI?.focusMainWindow?.().catch(() => {});
    window.close();
  }, []);

  return (
    <div
      className="h-7 flex-shrink-0 flex items-center justify-between gap-2 px-2 border-b border-subtle bg-surface-nav select-none"
      // macOS: lets the user drag the window by grabbing this bar, just like
      // the OS title bar above it. Buttons opt out via `app-region: no-drag`
      // (set inline so we don't need a custom Tailwind plugin).
      style={{ ['WebkitAppRegion' as never]: 'drag' as never }}
    >
      <button
        onClick={dockBack}
        className="h-5 px-2 inline-flex items-center gap-1 text-[11px] rounded text-content-secondary hover:text-content hover:bg-surface-raised transition-colors"
        style={{ ['WebkitAppRegion' as never]: 'no-drag' as never }}
        title={t('detached:detachedRoot.closeTitle')}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        <span>{t('detached:detachedRoot.dockBack')}</span>
      </button>

      <div className="flex-1 text-center text-[11px] text-content-tertiary truncate px-2">
        {title}
      </div>

      <button
        onClick={togglePin}
        className={`h-5 w-5 inline-flex items-center justify-center rounded transition-colors ${
          pinned
            ? 'text-blue-500 bg-blue-500/15 hover:bg-blue-500/25'
            : 'text-content-tertiary hover:text-content hover:bg-surface-raised'
        }`}
        style={{ ['WebkitAppRegion' as never]: 'no-drag' as never }}
        title={pinned ? t('detached:detachedRoot.pinned') : t('detached:detachedRoot.keepOnTop')}
        aria-label={t('detached:detachedRoot.toggleOnTop')}
      >
        {pinned ? (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M16 9V4l1-1V2H7v1l1 1v5l-2 4v2h5v6l1 1 1-1v-6h5v-2l-2-4z" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M16 9V4l1-1V2H7v1l1 1v5l-2 4v2h5v6l1 1 1-1v-6h5v-2l-2-4z" />
          </svg>
        )}
      </button>
    </div>
  );
}
