import { useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsDetached } from '../../stores/workspace-store';

interface DetachableProps {
  /**
   * Stable id matching the renderer's detached component-registry. For
   * single-instance components use just the registry key (e.g. "attitude").
   * For multi-instance ones (e.g. field graphs), also provide `instance` so
   * each pop-out gets its own window.
   */
  componentId: string;
  instance?: string;
  /** Title shown in the OS title bar of the detached window. */
  title: string;
  /** Optional initial bounds for the detached window. */
  initialBounds?: { width: number; height: number };
  /** Props serialized into the URL and reconstructed in the detached window. */
  props?: Record<string, unknown>;
  /**
   * When false, the pop-out button is hidden but the wrapper still tracks
   * detached state. Useful for components that are only meaningful when
   * docked (rare; default true).
   */
  enabled?: boolean;
  /** Inline render — what the user sees when the panel is docked. */
  children: ReactNode;
}

/**
 * Detachable — wraps any panel/view to add a pop-out affordance. The wrapper
 * is render-only: state and IPC live in the workspace store + main-process
 * window-manager. When the panel is popped out, the inline area swaps to a
 * placeholder so the user can re-dock with one click.
 *
 * Visual contract: the pop-out button sits absolutely positioned in the
 * top-right corner of the wrapper. The host panel is responsible for its own
 * header — we never inject one. This is what lets us drop Detachable around
 * existing panels without re-flowing their layouts.
 */
export function Detachable({
  componentId,
  instance,
  title,
  initialBounds,
  props,
  enabled = true,
  children,
}: DetachableProps): JSX.Element {
  const { t } = useTranslation();
  const isDetached = useIsDetached(componentId, instance);

  const handlePopOut = useCallback(() => {
    window.electronAPI.openDetachedWindow({
      componentId,
      ...(instance !== undefined ? { instance } : {}),
      title,
      ...(initialBounds !== undefined ? { initialBounds } : {}),
      ...(props !== undefined ? { props } : {}),
    });
  }, [componentId, instance, title, initialBounds, props]);

  const handleReDock = useCallback(() => {
    const id = instance ? `${componentId}:${instance}` : componentId;
    window.electronAPI.closeDetachedWindow(id);
  }, [componentId, instance]);

  if (isDetached) {
    return (
      <div className="relative h-full w-full group">
        <DetachedPlaceholder title={title} onReDock={handleReDock} />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full group">
      {children}
      {enabled && (
        <button
          onClick={handlePopOut}
          className="absolute top-2 right-2 z-30 p-1.5 rounded-md bg-surface-raised/80 hover:bg-surface-raised backdrop-blur-sm border border-subtle text-content-secondary hover:text-content opacity-0 group-hover:opacity-100 transition-opacity"
          title={t('ui:detachable.openInNewWindow', { title })}
          aria-label={t('ui:detachable.openInNewWindow', { title })}
        >
          <PopOutIcon />
        </button>
      )}
    </div>
  );
}

function DetachedPlaceholder({
  title,
  onReDock,
}: {
  title: string;
  onReDock: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="h-full w-full flex items-center justify-center p-6 bg-surface border border-dashed border-subtle rounded-xl">
      <div className="text-center max-w-xs">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
          <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </div>
        <div className="text-sm font-medium text-content mb-1">{title}</div>
        <div className="text-xs text-content-secondary mb-3">{t('ui:detachable.openInSeparateWindow')}</div>
        <button
          onClick={onReDock}
          className="px-3 py-1.5 text-xs bg-blue-500/15 hover:bg-blue-500/25 text-blue-500 border border-blue-500/40 rounded-md transition-colors"
        >
          {t('ui:detachable.dockBackHere')}
        </button>
      </div>
    </div>
  );
}

function PopOutIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M14 3h7m0 0v7m0-7L10 14M5 5h4M5 19h14a0 0 0 010 0v-4" />
    </svg>
  );
}
