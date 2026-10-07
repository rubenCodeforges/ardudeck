import { useTranslation } from 'react-i18next';
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Download, Boxes, Package, KeyRound, X, User, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { useModuleStore } from '../../stores/module-store';
import { HangarApps } from './HangarApps';
import type {
  ModuleProgress,
  InstalledModule,
  PublicCargo,
  CargoDetail,
  CargoPreviewBlock,
} from '../../../shared/module-types';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function PackageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Cargo icon (remote iconUrl with a cube-glyph fallback)
// ---------------------------------------------------------------------------

/** The icon.png a cargo ships in its own bundle; CargoIcon falls back to the cube when there is none. */
function bundledIconUrl(slug: string): string {
  return `ardudeck-module://${slug}/icon.png`;
}

function CargoIcon({
  iconUrl,
  active,
  className,
}: {
  iconUrl: string | null;
  active: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  // A new URL (a dev cargo rebuilt, an icon added) deserves a fresh attempt.
  useEffect(() => setFailed(false), [iconUrl]);
  const wrapper = `rounded-lg flex items-center justify-center shrink-0 overflow-hidden ${
    active
      ? 'bg-purple-500/10 border border-purple-500/20'
      : 'bg-surface-raised border border-subtle'
  } ${className ?? ''}`;

  if (iconUrl && !failed) {
    return (
      <div className={wrapper}>
        <img
          src={iconUrl}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className={wrapper}>
      <PackageIcon className={`w-5 h-5 ${active ? 'text-purple-400' : 'text-content-tertiary'}`} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Display name helper
// ---------------------------------------------------------------------------

function toDisplayName(name: string): string {
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// License Type Badge
// ---------------------------------------------------------------------------

function LicenseTypeBadge({ type }: { type: InstalledModule['licenseType'] }) {
  const { t } = useTranslation();
  const styles = {
    perpetual: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    subscription: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    trial: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };

  const labels = {
    perpetual: t('modules:moduleManager.licensePerpetual'),
    subscription: t('modules:moduleManager.licenseSubscription'),
    trial: t('modules:moduleManager.licenseTrial'),
  };

  return (
    <span className={`px-2 py-0.5 text-xs rounded-full border ${styles[type]}`}>
      {labels[type]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Installed controls (shared by the On board list and the browse grid)
// ---------------------------------------------------------------------------

function UpdatePill({
  isUpdating,
  onUpdate,
}: {
  isUpdating: boolean;
  onUpdate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onUpdate}
      disabled={isUpdating}
      className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full border transition-colors shrink-0 ${
        isUpdating
          ? 'bg-blue-500/10 text-blue-400/60 border-blue-500/20 cursor-wait'
          : 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20 hover:text-blue-300'
      }`}
      data-tip={t('modules:moduleManager.updateTip')}
    >
      {isUpdating ? (
        <span className="w-2.5 h-2.5 rounded-full border border-blue-400/30 border-t-blue-400 animate-spin" />
      ) : (
        <ArrowUpIcon className="w-2.5 h-2.5" />
      )}
      {isUpdating ? t('modules:moduleManager.updating') : t('modules:moduleManager.update')}
    </button>
  );
}

function InstalledControls({
  isEnabled,
  onRemove,
  onToggle,
}: {
  isEnabled: boolean;
  onRemove: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div className="shrink-0 flex items-center gap-1">
      <button
        onClick={() => onToggle(!isEnabled)}
        role="switch"
        aria-checked={isEnabled}
        data-tip={isEnabled ? t('modules:moduleManager.turnOff') : t('modules:moduleManager.turnOn')}
        className={`relative w-9 h-5 rounded-full transition-colors ${
          isEnabled ? 'bg-emerald-500' : 'bg-surface-inset border border-subtle'
        }`}
      >
        <span
          className={`absolute left-0 top-0.5 w-4 h-4 rounded-full bg-white border border-strong shadow-sm transition-transform ${
            isEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </button>
      {confirmRemove ? (
        <div className="flex items-center gap-1 ml-1">
          <button
            onClick={() => {
              onRemove();
              setConfirmRemove(false);
            }}
            className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
          >
            {t('common:confirm')}
          </button>
          <button
            onClick={() => setConfirmRemove(false)}
            className="px-2 py-1 text-xs bg-surface-raised text-content-secondary rounded transition-colors"
          >
            {t('common:cancel')}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirmRemove(true)}
          className="p-1.5 ml-1 rounded-lg text-content-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors"
          data-tip={t('modules:moduleManager.removeCargo')}
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress Indicator
// ---------------------------------------------------------------------------

function ActivationProgress({ progress }: { progress: ModuleProgress }) {
  const { t } = useTranslation();
  const stageLabels: Record<ModuleProgress['stage'], string> = {
    validating: t('modules:moduleManager.stageValidating'),
    activating: t('modules:moduleManager.stageActivating'),
    downloading: t('modules:moduleManager.stageDownloading'),
    verifying: t('modules:moduleManager.stageVerifying'),
    complete: t('modules:moduleManager.stageComplete'),
    error: t('modules:moduleManager.stageError'),
  };

  const stageColors: Record<ModuleProgress['stage'], string> = {
    validating: 'text-blue-400',
    activating: 'text-blue-400',
    downloading: 'text-blue-400',
    verifying: 'text-blue-400',
    complete: 'text-emerald-400',
    error: 'text-red-400',
  };

  return (
    <div className="bg-surface rounded-xl border border-subtle p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
          {progress.stage === 'complete' ? (
            <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
          ) : progress.stage === 'error' ? (
            <AlertIcon className="w-5 h-5 text-red-400" />
          ) : (
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        <div>
          <h3 className={`text-sm font-medium ${stageColors[progress.stage]}`}>
            {stageLabels[progress.stage]}
          </h3>
          <p className="text-xs text-content-secondary">{progress.message}</p>
        </div>
      </div>

      {/* Progress bar */}
      {progress.percent !== undefined && progress.stage !== 'error' && (
        <div className="w-full h-1.5 bg-surface-inset rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              progress.stage === 'complete' ? 'bg-emerald-500' : 'bg-blue-500'
            }`}
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Install button (shared by the browse grid and the detail modal)
// ---------------------------------------------------------------------------

function InstallButton({
  isInstalling,
  onInstall,
  className = 'text-xs py-1.5 px-3',
}: {
  isInstalling: boolean;
  onInstall: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onInstall}
      disabled={isInstalling}
      className={`btn btn-primary shrink-0 flex items-center gap-1.5 ${className}`}
      data-tip={t('modules:moduleManager.installTip')}
    >
      {isInstalling ? (
        <>
          <span className="w-3 h-3 rounded-full border border-white/40 border-t-white animate-spin" />
          {t('modules:moduleManager.installing')}
        </>
      ) : (
        <>
          <Download className="w-3.5 h-3.5" />
          {t('common:install')}
        </>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Browse Card (public catalog cargo)
// ---------------------------------------------------------------------------

function BrowseCard({
  cargo,
  installed,
  hasUpdate,
  isUpdating,
  isInstalling,
  onInstall,
  onUpdate,
  onRemove,
  onToggle,
  onOpenDetail,
}: {
  cargo: PublicCargo;
  installed: InstalledModule | null;
  hasUpdate: boolean;
  isUpdating: boolean;
  isInstalling: boolean;
  onInstall: () => void;
  onUpdate: () => void;
  onRemove: () => void;
  onToggle: (enabled: boolean) => void;
  onOpenDetail: () => void;
}) {
  const { t } = useTranslation();
  const isEnabled = installed ? installed.enabled !== false : false;
  const version = cargo.version ?? installed?.version ?? '';
  const cover = useModuleStore((st) => st.covers[cargo.slug]);
  const [coverFailed, setCoverFailed] = useState(false);

  return (
    <div
      onClick={onOpenDetail}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDetail();
        }
      }}
      role="button"
      tabIndex={0}
      data-tip={t('modules:moduleManager.viewDetails')}
      className="card flex flex-col overflow-hidden cursor-pointer hover:border-purple-500/30 transition-colors focus:outline-none focus:ring-1 focus:ring-purple-500/40"
    >
      {cover && !coverFailed && (
        <div className="relative aspect-video bg-surface-raised border-b border-subtle overflow-hidden">
          <img
            src={cover}
            alt=""
            loading="lazy"
            className={`w-full h-full object-cover ${installed && !isEnabled ? 'opacity-60' : ''}`}
            onError={() => setCoverFailed(true)}
          />
        </div>
      )}
      <div className="card-body flex-1 space-y-3">
        <div className="flex items-start gap-3">
          <CargoIcon iconUrl={cargo.iconUrl} active={!installed || isEnabled} className="w-10 h-10" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-content truncate">{toDisplayName(cargo.name)}</h3>
              {installed && (
                <span className="shrink-0 px-2 py-0.5 text-[10px] rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  {t('modules:moduleManager.installed')}
                </span>
              )}
            </div>
            <p className="text-xs text-content-secondary font-mono mt-0.5 truncate">{cargo.slug}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-content-tertiary">
          {cargo.category && (
            <span className="px-2 py-0.5 rounded-full border border-subtle bg-surface-raised text-content-secondary">
              {cargo.category}
            </span>
          )}
          {version && <span>v{version}</span>}
          <span className="flex items-center gap-1" data-tip={t('modules:moduleManager.totalInstalls')}>
            <Download className="w-3 h-3" />
            {cargo.downloads.toLocaleString()}
          </span>
        </div>

        {cargo.description && (
          <p className="text-xs text-content-secondary leading-relaxed line-clamp-2">
            {cargo.description}
          </p>
        )}
      </div>

      {/* Footer holds the install / installed controls; clicks here must not
          open the detail modal (the controls keep their own behaviour). */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="border-t border-subtle px-4 py-3 flex items-center justify-between gap-2"
      >
        {installed ? (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-content-secondary truncate">
                {isEnabled ? t('common:active') : t('modules:moduleManager.turnedOff')}
              </span>
              {hasUpdate && <UpdatePill isUpdating={isUpdating} onUpdate={onUpdate} />}
            </div>
            <InstalledControls isEnabled={isEnabled} onRemove={onRemove} onToggle={onToggle} />
          </>
        ) : (
          <>
            <span />
            <InstallButton isInstalling={isInstalling} onInstall={onInstall} />
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cargo detail modal (rich marketing preview for a single cargo)
// ---------------------------------------------------------------------------

// One screenshot that quietly drops itself out of the gallery if its URL fails
// to load, so a missing image never leaves a broken frame behind.
/**
 * Stage plus thumbnail strip, matching the Hangar listing. A stack of stills at
 * their natural size reads badly when they are different shapes, which is what
 * a panel shot next to a map shot always is.
 */
function ScreenshotGallery({ images }: { images: { url: string; alt?: string }[] }) {
  const { t } = useTranslation();
  const usable = images.filter((img) => !!img.url);
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState<Record<string, true>>({});
  const [zoomed, setZoomed] = useState(false);
  const stripRef = useRef<HTMLDivElement | null>(null);

  const shown = usable.filter((img) => !broken[img.url]);
  const index = Math.min(active, Math.max(0, shown.length - 1));
  const go = (delta: number) => setActive((i) => (i + delta + shown.length) % shown.length);

  useEffect(() => {
    const thumb = stripRef.current?.children[index] as HTMLElement | undefined;
    thumb?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [index]);

  if (shown.length === 0) return null;
  const caption = shown[index]?.alt ?? '';

  return (
    <div
      className="space-y-3"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      }}
    >
      <div
        className="group relative cursor-zoom-in overflow-hidden rounded-xl border border-subtle bg-black"
        onClick={() => setZoomed(true)}
        role="button"
        tabIndex={-1}
        aria-label={t('modules:moduleManager.viewFullSize')}
      >
        {/* Every slide mounted and cross-faded: swapping one src leaves a blank
            frame for the length of the fetch. */}
        <div className="relative aspect-video w-full">
          {shown.map((img, i) => (
            <img
              key={img.url}
              src={img.url}
              alt={i === index ? (img.alt ?? '') : ''}
              aria-hidden={i !== index}
              loading="lazy"
              onError={() => setBroken((b) => ({ ...b, [img.url]: true }))}
              className="absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ease-out"
              style={{ opacity: i === index ? 1 : 0 }}
            />
          ))}
        </div>

        {shown.length > 1 && (
          <>
            <GalleryArrow side="left" onClick={() => go(-1)} />
            <GalleryArrow side="right" onClick={() => go(1)} />
            <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] tabular-nums text-white/80">
              {index + 1} / {shown.length}
            </span>
          </>
        )}
      </div>

      {caption && <p className="text-xs text-content-tertiary">{caption}</p>}

      {zoomed && shown[index] && (
        <Lightbox
          src={shown[index]!.url}
          alt={shown[index]!.alt ?? ''}
          position={`${index + 1} / ${shown.length}`}
          onClose={() => setZoomed(false)}
          onPrev={shown.length > 1 ? () => go(-1) : undefined}
          onNext={shown.length > 1 ? () => go(1) : undefined}
        />
      )}

      {shown.length > 1 && (
        <div ref={stripRef} className="flex gap-2 overflow-x-auto pb-1">
          {shown.map((img, i) => (
            <button
              key={`${img.url}-${i}`}
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActive(i); }}
              aria-label={img.alt ?? `Screenshot ${i + 1}`}
              className={`relative h-14 w-24 shrink-0 overflow-hidden rounded-lg border bg-black transition-colors ${
                i === index ? 'border-blue-500' : 'border-subtle opacity-70 hover:opacity-100'
              }`}
            >
              <img src={img.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Full-size view. Portalled so it escapes the detail modal's own stacking. */
function Lightbox({
  src,
  alt,
  position,
  onClose,
  onPrev,
  onNext,
}: {
  src: string;
  alt: string;
  position: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onPrev?.();
      else if (e.key === 'ArrowRight') onNext?.();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, onPrev, onNext]);

  return createPortal(
    <div
      className="fixed inset-0 z-[4000] flex cursor-zoom-out flex-col items-center justify-center bg-black/85 p-6"
      onClick={onClose}
    >
      <img
        src={src}
        alt={alt}
        className="max-h-[calc(100vh-7rem)] max-w-[min(100vw-3rem,1600px)] cursor-default rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      {alt && <p className="mt-3 max-w-2xl text-center text-xs text-white/70">{alt}</p>}

      <span className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] tabular-nums text-white/80">
        {position}
      </span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label={t('common:close')}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/80 hover:bg-black/75 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
      {onPrev && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          aria-label={t('modules:moduleManager.previous')}
          className="absolute left-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/80 hover:bg-black/75 hover:text-white"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {onNext && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          aria-label={t('common:next')}
          className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/80 hover:bg-black/75 hover:text-white"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>,
    document.body,
  );
}

/** Half-hidden until the stage is hovered, so the picture is not permanently covered. */
function GalleryArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const { t } = useTranslation();
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      aria-label={side === 'left' ? t('modules:moduleManager.previous') : t('common:next')}
      className={`absolute top-1/2 -translate-y-1/2 ${side === 'left' ? 'left-2' : 'right-2'}
        flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/50
        text-white/80 opacity-0 transition-all hover:bg-black/75 hover:text-white
        focus-visible:opacity-100 group-hover:opacity-100`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function PreviewBlockView({ block }: { block: CargoPreviewBlock }) {
  const { t } = useTranslation();
  switch (block.type) {
    case 'hero':
      return (
        <div className="max-w-2xl">
          <h3 className="text-2xl font-semibold text-content leading-tight">{block.headline}</h3>
          {block.subtitle && (
            <p className="mt-2 text-sm text-content-secondary leading-relaxed">{block.subtitle}</p>
          )}
        </div>
      );
    case 'screenshots':
      return <ScreenshotGallery images={block.images} />;
    case 'features':
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 max-w-2xl">
          {block.items.map((item, i) => (
            <div key={i} className="flex gap-2.5">
              <CheckCircleIcon className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
              <div>
                <p className="text-sm font-medium text-content leading-snug">{item.title}</p>
                {item.description && (
                  <p className="text-xs text-content-secondary mt-1 leading-relaxed">
                    {item.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      );
    case 'stats':
      return (
        <div className="max-w-2xl">
          {block.title && (
            <div className="flex items-center gap-2 mb-3">
              <span className="h-3 w-0.5 rounded-full bg-purple-600 dark:bg-purple-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-content-tertiary">
                {block.title}
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {block.tiles.map((tile, i) => (
              <div
                key={i}
                className="group relative overflow-hidden rounded-xl border border-subtle bg-surface-raised px-4 py-3.5 transition-all duration-200 hover:border-purple-500/40 hover:shadow-[0_8px_22px_-10px_rgba(168,85,247,0.35)]"
              >
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-50 dark:opacity-70 transition-opacity duration-200 group-hover:opacity-100" />
                <span className="absolute left-0 top-0 h-full w-0.5 bg-purple-500/60 dark:bg-purple-500/40 transition-colors duration-200 group-hover:bg-purple-400" />
                <div className="relative">
                  <p className="text-sm font-semibold text-purple-700 dark:text-purple-400 leading-tight">{tile.value}</p>
                  <p className="text-[11px] text-content-tertiary mt-1 leading-snug uppercase tracking-wide">
                    {tile.label}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    case 'conversation':
      return (
        <div className="rounded-2xl border border-subtle bg-surface-raised overflow-hidden max-w-xl">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-subtle">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
            <span className="text-xs font-semibold text-content">{block.title ?? t('modules:moduleManager.preview')}</span>
          </div>
          <div className="p-4 space-y-3">
            {block.messages.map((m, i) =>
              m.role === 'user' ? (
                <div
                  key={i}
                  className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-purple-500/15 border border-purple-500/20 px-3.5 py-2 text-xs text-content"
                >
                  {m.text}
                </div>
              ) : (
                <div
                  key={i}
                  className="max-w-[88%] rounded-2xl rounded-bl-sm bg-surface-solid border border-subtle px-3.5 py-2.5 text-xs text-content-secondary leading-relaxed"
                >
                  {m.text}
                </div>
              ),
            )}
            {block.footer && (
              <div className="pt-2 border-t border-subtle text-[10px] text-amber-400">{block.footer}</div>
            )}
          </div>
        </div>
      );
    default:
      return null;
  }
}

function CargoDetailModal({
  slug,
  cargo,
  detail,
  loading,
  error,
  installed,
  hasUpdate,
  isUpdating,
  isInstalling,
  onInstall,
  onUpdate,
  onRemove,
  onToggle,
  onRetry,
  onClose,
}: {
  slug: string;
  cargo: PublicCargo | null;
  detail: CargoDetail | null;
  loading: boolean;
  error: string | null;
  installed: InstalledModule | null;
  hasUpdate: boolean;
  isUpdating: boolean;
  isInstalling: boolean;
  onInstall: () => void;
  onUpdate: () => void;
  onRemove: () => void;
  onToggle: (enabled: boolean) => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The catalog entry renders the header instantly; the fetched detail enriches
  // it (author, full description, marketing blocks) once it arrives.
  const iconUrl = detail?.iconUrl ?? cargo?.iconUrl ?? null;
  const displayName = toDisplayName(detail?.name ?? cargo?.name ?? slug);
  const category = detail?.category ?? cargo?.category ?? null;
  const version = detail?.latestVersion ?? cargo?.version ?? installed?.version ?? '';
  const downloads = detail?.downloads ?? cargo?.downloads ?? null;
  const description = detail?.description ?? cargo?.description ?? null;
  const blocks = detail?.preview?.blocks ?? [];
  const isEnabled = installed ? installed.enabled !== false : false;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-solid rounded-2xl border border-subtle w-full max-w-3xl max-h-[88vh] shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="shrink-0 flex items-start gap-4 px-6 py-5 border-b border-subtle">
          <CargoIcon iconUrl={iconUrl} active={!installed || isEnabled} className="w-14 h-14" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-content truncate">{displayName}</h2>
              {installed && (
                <span className="shrink-0 px-2 py-0.5 text-[10px] rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  {t('modules:moduleManager.installed')}
                </span>
              )}
            </div>
            <p className="text-xs text-content-secondary font-mono mt-0.5 truncate">{slug}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-content-tertiary">
              {category && (
                <span className="px-2 py-0.5 rounded-full border border-subtle bg-surface-raised text-content-secondary">
                  {category}
                </span>
              )}
              {detail?.authorName && (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {detail.authorName}
                </span>
              )}
              {version && <span>v{version}</span>}
              {downloads !== null && (
                <span className="flex items-center gap-1" data-tip={t('modules:moduleManager.totalInstalls')}>
                  <Download className="w-3 h-3" />
                  {downloads.toLocaleString()}
                </span>
              )}
            </div>
          </div>

          {/* Primary action: install, or the installed state + controls */}
          <div className="shrink-0 flex items-center gap-2">
            {installed ? (
              <>
                {hasUpdate && <UpdatePill isUpdating={isUpdating} onUpdate={onUpdate} />}
                <InstalledControls isEnabled={isEnabled} onRemove={onRemove} onToggle={onToggle} />
              </>
            ) : (
              <InstallButton
                isInstalling={isInstalling}
                onInstall={onInstall}
                className="text-sm py-2 px-4"
              />
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-raised text-content-secondary hover:text-content transition-colors"
              data-tip={t('common:close')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {loading && !detail ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error && !detail ? (
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertIcon className="w-5 h-5 text-red-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-red-400">{t('modules:moduleManager.detailsError')}</p>
                <p className="text-xs text-content-secondary mt-0.5 break-words">{error}</p>
              </div>
              <button
                onClick={onRetry}
                className="px-3 py-1.5 text-xs text-content-secondary hover:text-content bg-surface-raised border border-subtle rounded-lg transition-colors shrink-0"
              >
                {t('common:retry')}
              </button>
            </div>
          ) : blocks.length > 0 ? (
            <div className="space-y-8">
              {blocks.map((block, i) => (
                <PreviewBlockView key={i} block={block} />
              ))}
            </div>
          ) : description ? (
            // Older cargo with no authored preview: show the full description.
            <p className="text-sm text-content-secondary leading-relaxed whitespace-pre-line max-w-2xl">
              {description}
            </p>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-surface-raised border border-subtle flex items-center justify-center mb-4">
                <PackageIcon className="w-7 h-7 text-content-tertiary" />
              </div>
              <p className="text-sm text-content-secondary">{t('modules:moduleManager.noDetails')}</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Module Card (On board list row)
// ---------------------------------------------------------------------------

function ModuleCard({
  module,
  hasUpdate,
  isUpdating,
  onUpdate,
  onRemove,
  onToggle,
}: {
  module: InstalledModule;
  hasUpdate: boolean;
  isUpdating: boolean;
  onUpdate: () => void;
  onRemove: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const isEnabled = module.enabled !== false;
  const catalogIcon = useModuleStore((st) => st.catalog.find((c) => c.slug === module.slug)?.iconUrl ?? null);

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <CargoIcon iconUrl={catalogIcon ?? bundledIconUrl(module.slug)} active={isEnabled} className="w-10 h-10" />

      {/* Info */}
      <div className={`flex-1 min-w-0 ${isEnabled ? '' : 'opacity-60'}`}>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-content truncate">{toDisplayName(module.name)}</h3>
          <span className="text-xs text-content-tertiary shrink-0">v{module.version}</span>
          {hasUpdate && <UpdatePill isUpdating={isUpdating} onUpdate={onUpdate} />}
        </div>
        <p className="text-xs text-content-secondary font-mono mt-0.5 truncate">{module.slug}</p>
      </div>

      {/* License + controls */}
      <div className={`shrink-0 ${isEnabled ? '' : 'opacity-60'}`}>
        <LicenseTypeBadge type={module.licenseType} />
      </div>
      <div className="shrink-0 pl-2 border-l border-subtle">
        <InstalledControls isEnabled={isEnabled} onRemove={onRemove} onToggle={onToggle} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-surface border border-subtle flex items-center justify-center mb-5">
        <PackageIcon className="w-8 h-8 text-content-tertiary" />
      </div>
      <h3 className="text-lg font-medium text-content mb-2">{t('modules:moduleManager.emptyTitle')}</h3>
      <p className="text-sm text-content-secondary max-w-sm leading-relaxed">
        {t('modules:moduleManager.emptyBody')}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type CargoTabId = 'browse' | 'installed';

const CARGO_TABS: { id: CargoTabId; labelKey: string; icon: LucideIcon }[] = [
  { id: 'browse', labelKey: 'modules:moduleManager.tabBrowse', icon: Boxes },
  { id: 'installed', labelKey: 'modules:moduleManager.onBoard', icon: Package },
];

// Per-tab colour coding, same convention as the Settings and Parameters tabs:
// the icon carries its colour always (dimmed when inactive) and the active pill
// fills with it. Palette colours, so the /20 /30 opacity suffixes are allowed.
const TAB_COLORS: Record<CargoTabId, { active: string; icon: string; badge: string }> = {
  browse:    { active: 'bg-purple-500/20 text-purple-400 border-purple-500/30',   icon: 'text-purple-400',  badge: 'bg-purple-500/30 text-purple-300' },
  installed: { active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: 'text-emerald-400', badge: 'bg-emerald-500/30 text-emerald-300' },
};

// ---------------------------------------------------------------------------
// Main View
// ---------------------------------------------------------------------------

function DevCargoSection() {
  const { t } = useTranslation();
  const [available, setAvailable] = useState(false);
  const [items, setItems] = useState<{ slug: string; name: string; version: string; path: string }[]>([]);
  const [error, setError] = useState('');
  // Bumped on every rebuild so a freshly added icon.png shows without reopening the screen.
  const [iconEpoch, setIconEpoch] = useState(0);
  useEffect(() => {
    const off = window.electronAPI.onModuleDevChanged?.(() => setIconEpoch((e) => e + 1));
    return () => { off?.(); };
  }, []);

  const refresh = async () => setItems(await window.electronAPI.moduleDevList());

  useEffect(() => {
    void (async () => {
      const ok = await window.electronAPI.moduleDevAvailable();
      setAvailable(ok);
      if (ok) await refresh();
    })();
  }, []);

  if (!available) return null;

  return (
    <div className="mt-8 rounded-lg border border-dashed border-amber-500/40 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-content">{t('modules:moduleManager.developer')}</div>
          <p className="mt-0.5 text-xs text-content-secondary">
            {t('modules:moduleManager.developerHint')}
          </p>
        </div>
        <button
          type="button"
          className="rounded bg-surface-raised px-3 py-1.5 text-sm text-content hover:bg-surface-hover"
          onClick={async () => {
            const r = await window.electronAPI.moduleDevLoad();
            setError(r.ok ? '' : (r.error ?? t('modules:moduleManager.couldNotLoad')));
            await refresh();
          }}
        >
          {t('modules:moduleManager.loadUnpacked')}
        </button>
      </div>

      {error && error !== 'Cancelled' && (
        <div className="mt-2 text-xs text-red-400">{error}</div>
      )}

      {items.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {items.map((m) => (
            <div
              key={m.slug}
              className="flex items-center justify-between rounded border border-subtle px-3 py-2"
            >
              <div className="flex items-center gap-3 min-w-0">
                <CargoIcon iconUrl={`${bundledIconUrl(m.slug)}?v=${iconEpoch}`} active className="w-10 h-10" />
                <div className="min-w-0">
                  <div className="truncate text-sm text-content">
                    {m.name} <span className="text-content-tertiary">{m.version}</span>
                  </div>
                  <div className="truncate text-[11px] text-content-tertiary">{m.path}</div>
                </div>
              </div>
              <div className="ml-3 flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  className="text-xs text-content-secondary hover:text-content"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent('ardudeck:reload-module', { detail: m.slug }),
                    )
                  }
                >
                  {t('common:reload')}
                </button>
                <button
                  type="button"
                  className="text-xs text-content-secondary hover:text-content"
                  onClick={async () => {
                    await window.electronAPI.moduleDevUnload(m.slug);
                    await refresh();
                  }}
                >
                  {t('modules:moduleManager.unload')}
                </button>
              </div>
            </div>
          ))}
          <p className="pt-1 text-[11px] text-content-tertiary">
            {t('modules:moduleManager.devRestartNote')}
          </p>
        </div>
      )}
    </div>
  );
}

export function ModuleManagerView() {
  const { t } = useTranslation();
  const {
    modules,
    isLoading,
    error,
    activating,
    progress,
    updates,
    updating,
    checkingUpdates,
    updatesCheckedAt,
    updatesError,
    catalog,
    catalogLoading,
    catalogError,
    installingSlug,
    openDetailSlug,
    detail,
    detailLoading,
    detailError,
    loadModules,
    activateLicense,
    removeLicense,
    checkUpdates,
    updateModule,
    updateAll,
    setEnabled,
    setProgress,
    clearError,
    fetchCatalog,
    installFree,
    openDetail,
    closeDetail,
  } = useModuleStore();

  const [keyInput, setKeyInput] = useState('');
  const [restartRequired, setRestartRequired] = useState(false);
  const [activeTab, setActiveTab] = useState<CargoTabId>('browse');
  const [showKey, setShowKey] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load modules, check for updates and fetch the browse catalog on mount
  useEffect(() => {
    loadModules();
    checkUpdates();
    fetchCatalog();
  }, [loadModules, checkUpdates, fetchCatalog]);

  // Subscribe to progress events from main process
  useEffect(() => {
    const cleanup = window.electronAPI.onModuleProgress((p) => {
      setProgress(p);
    });
    return () => { cleanup(); };
  }, [setProgress]);

  const handleActivate = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;

    clearError();
    const result = await activateLicense(trimmed);
    if (result.success) {
      setKeyInput('');
      setShowKey(false);
      // Newly installed modules are only loaded into the running app at
      // startup, so the module won't appear until ArduDeck restarts.
      setRestartRequired(true);
      // A freshly activated key lands on board, so surface it right away.
      setActiveTab('installed');
      // Refresh updates
      checkUpdates();
    }
  };

  const openKeyPanel = () => {
    setShowKey(true);
    clearError();
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleActivate();
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setKeyInput(text.trim());
      }
    } catch {
      // Clipboard access denied
    }
  };

  const updateSlugs = new Set(updates.map((u) => u.slug));
  const installedBySlug = new Map(modules.map((m) => [m.slug, m]));

  // Category filter for the Browse grid. Categories come straight from the
  // fetched catalog, so the chips only ever offer tags that actually exist.
  const categories = Array.from(
    new Set(catalog.map((c) => c.category).filter((c): c is string => !!c)),
  ).sort();
  const catLabel = (c: string) => (c === 'ai' ? 'AI' : c === 'osd' ? 'OSD' : c.charAt(0).toUpperCase() + c.slice(1));
  const visibleCatalog = selectedCategory ? catalog.filter((c) => c.category === selectedCategory) : catalog;

  const handleInstallFree = async (slug: string) => {
    clearError();
    const result = await installFree(slug);
    // Installable cargo only loads at startup, so a fresh install needs a
    // restart; activatable cargo flips its gate reactively.
    if (result.success) setRestartRequired(true);
  };

  const handleToggle = async (mod: InstalledModule, enabled: boolean) => {
    const result = await setEnabled(mod.slug, enabled);
    // Bundle cargo only loads/unloads at startup; activatable cargo flips its
    // capability gate reactively and needs no restart.
    if (result.success && !mod.activatable) setRestartRequired(true);
  };

  const handleUpdate = async (slug: string) => {
    clearError();
    const result = await updateModule(slug);
    // Updated code only loads at startup, same as a fresh install.
    if (result.success) setRestartRequired(true);
  };

  const handleUpdateAll = async () => {
    clearError();
    const succeeded = await updateAll();
    if (succeeded > 0) setRestartRequired(true);
  };

  return (
    <div className="h-full flex flex-col bg-surface-input">
      {/* Header (pinned) */}
      <div className="shrink-0 px-6 pt-6 pb-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                <PackageIcon className="w-5 h-5 text-purple-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold text-content">{t('modules:moduleManager.title')}</h1>
                <p className="text-sm text-content-secondary mt-0.5">
                  {t('modules:moduleManager.subtitle')}
                </p>
              </div>
            </div>
            <button
              onClick={() => (showKey ? setShowKey(false) : openKeyPanel())}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors shrink-0 ${
                showKey
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                  : 'text-content-secondary hover:text-content bg-surface-raised border-subtle'
              }`}
              data-tip={t('modules:moduleManager.haveKeyTip')}
            >
              <KeyRound className="w-3.5 h-3.5" />
              {t('modules:moduleManager.haveKey')}
            </button>
          </div>

          {/* Key expander (edge case, kept out of the main scroll) */}
          {showKey && (
            <div className="card mt-4">
              <div className="card-body space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-content flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-blue-400" />
                    {t('modules:moduleManager.addKeyTitle')}
                  </h2>
                  <button
                    onClick={() => setShowKey(false)}
                    className="p-1 rounded text-content-tertiary hover:text-content hover:bg-surface-raised transition-colors"
                    data-tip={t('common:close')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      ref={inputRef}
                      type="text"
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="ARDUDECK.xxxxxxxx.xxxxxxxx" /* i18n-exempt */
                      disabled={activating}
                      className="w-full px-3 py-2.5 bg-surface-input border border-subtle rounded-lg text-sm text-content placeholder-content-tertiary focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 disabled:opacity-50 font-mono"
                      spellCheck={false}
                      autoComplete="off"
                    />
                    {!keyInput && (
                      <button
                        onClick={handlePaste}
                        className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-content-secondary hover:text-content bg-surface-raised rounded transition-colors"
                      >
                        {t('modules:moduleManager.paste')}
                      </button>
                    )}
                  </div>
                  <button
                    onClick={handleActivate}
                    disabled={!keyInput.trim() || activating}
                    className="btn btn-primary text-sm shrink-0"
                  >
                    {activating ? t('modules:moduleManager.adding') : t('common:add')}
                  </button>
                </div>
                <p className="text-xs text-content-tertiary">
                  {t('modules:moduleManager.keyHint')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs (pinned) */}
      <div className="shrink-0 px-4 py-2 border-b border-subtle bg-surface-overlay-subtle overflow-x-auto">
        <div className="max-w-6xl mx-auto flex gap-1">
          {CARGO_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            const colors = TAB_COLORS[tab.id];
            const count = tab.id === 'browse' ? catalog.length : modules.length;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  isActive
                    ? colors.active
                    : 'text-content-secondary hover:text-content hover:bg-surface'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${colors.icon}${isActive ? '' : ' opacity-50'}`} />
                {t(tab.labelKey)}
                {count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    isActive ? colors.badge : 'bg-surface-raised text-content-secondary'
                  }`}>
                    {count}
                  </span>
                )}
                {tab.id === 'installed' && updates.length > 0 && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    data-tip={t('modules:moduleManager.updatesAvailable', { count: updates.length })}
                  >
                    {t('modules:moduleManager.newCount', { count: updates.length })}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cross-tab banners: error, install progress, restart prompt */}
      {(error || (progress && progress.stage !== 'complete') || restartRequired) && (
        <div className="shrink-0 px-6 pt-4 bg-surface-input">
          <div className="max-w-6xl mx-auto space-y-3">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertIcon className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-sm text-red-400 flex-1 min-w-0 break-words">{error}</p>
                <button
                  onClick={clearError}
                  className="p-1 rounded text-red-400/70 hover:text-red-400 transition-colors shrink-0"
                  data-tip={t('common:dismiss')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {progress && progress.stage !== 'complete' && (
              <ActivationProgress progress={progress} />
            )}

            {restartRequired && (
              <div className="card border-amber-500/30">
                <div className="card-body flex items-center gap-4 py-3">
                  <AlertIcon className="w-5 h-5 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-content">{t('modules:moduleManager.restartRequired')}</h3>
                    <p className="text-sm text-content-secondary mt-0.5">
                      {t('modules:moduleManager.restartBody')}
                    </p>
                  </div>
                  <button
                    onClick={() => window.electronAPI.relaunchApp()}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium rounded-lg transition-colors shrink-0"
                  >
                    {t('modules:moduleManager.restartNow')}
                  </button>
                  <button
                    onClick={() => setRestartRequired(false)}
                    className="px-3 py-2 text-sm text-content-secondary hover:text-content transition-colors shrink-0"
                  >
                    {t('modules:moduleManager.later')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active tab content (scrolls) */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-6">
          {activeTab === 'browse' && (
            <div className="space-y-4">
              <div className="card">
                <div className="card-body flex gap-3">
                  <Boxes className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-content">{t('modules:moduleManager.whatIsCargo')}</h3>
                    <p className="text-xs text-content-secondary leading-relaxed">
                      {t('modules:moduleManager.whatIsCargoBody')}
                    </p>
                  </div>
                </div>
              </div>
              <HangarApps mode="browse" />

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-1.5 h-5 bg-purple-500 rounded-full shrink-0" />
                  <h2 className="text-sm font-medium text-content uppercase tracking-wider">{t('modules:moduleManager.availableCargo')}</h2>
                  {catalog.length > 0 && (
                    <span className="text-xs text-content-tertiary">{catalog.length}</span>
                  )}
                </div>
                <button
                  onClick={() => fetchCatalog()}
                  disabled={catalogLoading}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-content-secondary hover:text-content bg-surface-raised border border-subtle rounded-lg transition-colors disabled:opacity-60 shrink-0"
                >
                  <RefreshIcon className={`w-3.5 h-3.5 ${catalogLoading ? 'animate-spin' : ''}`} />
                  {t('common:refresh')}
                </button>
              </div>

              {catalog.length > 0 && categories.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      selectedCategory === null
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                        : 'text-content-secondary bg-surface-raised border-subtle hover:text-content'
                    }`}
                  >
                    {t('common:all')}
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                        selectedCategory === cat
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                          : 'text-content-secondary bg-surface-raised border-subtle hover:text-content'
                      }`}
                    >
                      {catLabel(cat)}
                    </button>
                  ))}
                </div>
              )}

              {catalogLoading && catalog.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : catalogError ? (
                <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <AlertIcon className="w-5 h-5 text-red-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-red-400">{t('modules:moduleManager.hangarUnreachable')}</p>
                    <p className="text-xs text-content-secondary mt-0.5 break-words">{catalogError}</p>
                  </div>
                  <button
                    onClick={() => fetchCatalog()}
                    className="px-3 py-1.5 text-xs text-content-secondary hover:text-content bg-surface-raised border border-subtle rounded-lg transition-colors shrink-0"
                  >
                    {t('common:retry')}
                  </button>
                </div>
              ) : catalog.length === 0 ? (
                <div className="card">
                  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-surface-raised border border-subtle flex items-center justify-center mb-4">
                      <Boxes className="w-7 h-7 text-content-tertiary" />
                    </div>
                    <h3 className="text-base font-medium text-content mb-1.5">{t('modules:moduleManager.hangarEmpty')}</h3>
                    <p className="text-sm text-content-secondary max-w-sm leading-relaxed">
                      {t('modules:moduleManager.hangarEmptyBody')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {visibleCatalog.map((cargo) => {
                    const installed = installedBySlug.get(cargo.slug) ?? null;
                    return (
                      <BrowseCard
                        key={cargo.slug}
                        cargo={cargo}
                        installed={installed}
                        hasUpdate={updateSlugs.has(cargo.slug)}
                        isUpdating={updating === cargo.slug || updating === 'all'}
                        isInstalling={installingSlug === cargo.slug}
                        onInstall={() => handleInstallFree(cargo.slug)}
                        onUpdate={() => handleUpdate(cargo.slug)}
                        onRemove={() => installed && removeLicense(installed.licenseKey)}
                        onToggle={(enabled) => installed && handleToggle(installed, enabled)}
                        onOpenDetail={() => openDetail(cargo.slug)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'installed' && (
            <div className="space-y-4">
              <HangarApps mode="installed" />

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-1.5 h-5 bg-emerald-500 rounded-full shrink-0" />
                  <h2 className="text-sm font-medium text-content uppercase tracking-wider">{t('modules:moduleManager.onBoard')}</h2>
                  {modules.length > 0 && (
                    <span className="text-xs text-content-tertiary">{modules.length}</span>
                  )}
                </div>
                {modules.length > 0 && (
                  <div className="flex items-center gap-2 shrink-0">
                    {updatesError ? (
                      <span className="text-xs text-red-400" data-tip={updatesError}>
                        {t('modules:moduleManager.checkFailed')}
                      </span>
                    ) : updatesCheckedAt && !checkingUpdates && updates.length === 0 ? (
                      <span className="text-xs text-content-secondary">{t('modules:moduleManager.upToDate')}</span>
                    ) : null}
                    {updates.length > 0 && (
                      <button
                        onClick={handleUpdateAll}
                        disabled={updating !== null}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          updating !== null
                            ? 'bg-blue-600/40 text-white/60 cursor-wait'
                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                        data-tip={t('modules:moduleManager.updateAllTip')}
                      >
                        <ArrowUpIcon className="w-3.5 h-3.5" />
                        {updating === 'all'
                          ? t('modules:moduleManager.updatingAll')
                          : updates.length > 1
                            ? t('modules:moduleManager.updateAll', { count: updates.length })
                            : t('modules:moduleManager.update')}
                      </button>
                    )}
                    <button
                      onClick={() => checkUpdates()}
                      disabled={checkingUpdates}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-content-secondary hover:text-content bg-surface-raised border border-subtle rounded-lg transition-colors disabled:opacity-60"
                    >
                      <RefreshIcon className={`w-3.5 h-3.5 ${checkingUpdates ? 'animate-spin' : ''}`} />
                      {checkingUpdates ? t('modules:moduleManager.checking') : t('modules:moduleManager.checkUpdates')}
                    </button>
                  </div>
                )}
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : modules.length === 0 ? (
                <div className="card">
                  <EmptyState />
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <div className="divide-y divide-subtle">
                    {modules.map((mod) => (
                      <ModuleCard
                        key={mod.slug}
                        module={mod}
                        hasUpdate={updateSlugs.has(mod.slug)}
                        isUpdating={updating === mod.slug || updating === 'all'}
                        onUpdate={() => handleUpdate(mod.slug)}
                        onRemove={() => removeLicense(mod.licenseKey)}
                        onToggle={(enabled) => handleToggle(mod, enabled)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <DevCargoSection />

      {openDetailSlug && (() => {
        const detailCargo = catalog.find((c) => c.slug === openDetailSlug) ?? null;
        const detailInstalled = installedBySlug.get(openDetailSlug) ?? null;
        return (
          <CargoDetailModal
            slug={openDetailSlug}
            cargo={detailCargo}
            detail={detail}
            loading={detailLoading}
            error={detailError}
            installed={detailInstalled}
            hasUpdate={updateSlugs.has(openDetailSlug)}
            isUpdating={updating === openDetailSlug || updating === 'all'}
            isInstalling={installingSlug === openDetailSlug}
            onInstall={() => handleInstallFree(openDetailSlug)}
            onUpdate={() => handleUpdate(openDetailSlug)}
            onRemove={() => detailInstalled && removeLicense(detailInstalled.licenseKey)}
            onToggle={(enabled) => detailInstalled && handleToggle(detailInstalled, enabled)}
            onRetry={() => openDetail(openDetailSlug)}
            onClose={closeDetail}
          />
        );
      })()}
    </div>
  );
}
