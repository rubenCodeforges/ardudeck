import { useState } from 'react';
import { Apple, ChevronLeft, ChevronRight, Download, Loader2, Monitor, Play, Terminal, Package, Puzzle } from 'lucide-react';
import type { AppPlatform, AppPreviewBlock, HangarApp } from '../../../shared/app-types';

const PLATFORMS: { id: AppPlatform; label: string; icon: typeof Apple }[] = [
  { id: 'darwin', label: 'macOS', icon: Apple },
  { id: 'win32', label: 'Windows', icon: Monitor },
  { id: 'linux', label: 'Linux', icon: Terminal },
];

function thisPlatform(): AppPlatform {
  const p = navigator.userAgent;
  if (/Mac/.test(p)) return 'darwin';
  if (/Win/.test(p)) return 'win32';
  return 'linux';
}

function humanSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

type Media = { kind: 'video'; url: string; poster?: string; alt?: string } | { kind: 'image'; url: string; alt?: string };

function mediaOf(blocks: AppPreviewBlock[]): Media[] {
  const out: Media[] = [];
  for (const b of blocks) if (b.type === 'video') out.push({ kind: 'video', url: b.url, poster: b.poster, alt: b.alt });
  for (const b of blocks) if (b.type === 'screenshots') for (const i of b.images) out.push({ kind: 'image', url: i.url, alt: i.alt });
  return out;
}

/**
 * An app in the Cargo Bay, shown the way the Hangar website shows it.
 *
 * It used to be a line of text and an Install button, which is the right shape for a cargo (a
 * capability you switch on) and the wrong one for a PROGRAM. The listing already carries a
 * trailer and screenshots; not showing them here meant the one place a pilot decides to install
 * it was the only place that told them nothing about what it looks like.
 */
export function HangarAppCard({
  app,
  installing,
  progress,
  onInstall,
}: {
  app: HangarApp;
  installing: boolean;
  progress: string | null;
  onInstall: () => void;
}) {
  const media = mediaOf(app.preview?.blocks ?? []);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const mine = thisPlatform();
  const size = app.sizes?.[mine];
  const current = media[active];
  const go = (d: number) => { setPlaying(false); setActive((i) => (i + d + media.length) % media.length); };

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col lg:flex-row">
        {media.length > 0 && (
          <div className="group relative w-full shrink-0 overflow-hidden bg-black lg:w-80">
            {/*
             * EVERY slide is mounted and cross-faded, rather than one <img> whose src is swapped.
             * Swapping the src asks the network for each picture at the moment it is needed, so
             * paging sat on a blank frame for as long as the fetch took, and arrived with no
             * transition. Mounted once, they are fetched in parallel up front and every later
             * change is a GPU opacity fade with nothing to wait for.
             */}
            <div className="relative aspect-video w-full">
              {media.map((m, i) => (
                <img
                  key={m.url}
                  src={m.kind === 'video' ? m.poster : m.url}
                  alt={i === active ? (m.alt ?? '') : ''}
                  aria-hidden={i !== active}
                  className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out"
                  style={{ opacity: i === active ? 1 : 0 }}
                />
              ))}

              {current?.kind === 'video' && playing && (
                <video
                  src={current.url}
                  poster={current.poster}
                  controls
                  autoPlay
                  className="absolute inset-0 h-full w-full bg-black"
                />
              )}

              {current?.kind === 'video' && !playing && (
                <button
                  type="button"
                  onClick={() => setPlaying(true)}
                  aria-label="Play trailer"
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 transition-transform duration-200 group-hover:scale-110">
                    <Play className="h-5 w-5 fill-white text-white" />
                  </span>
                </button>
              )}

              {media.length > 1 && !playing && (
                <>
                  <Arrow side="left" onClick={() => go(-1)} />
                  <Arrow side="right" onClick={() => go(1)} />
                  <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-mono text-white/80">
                    {active + 1}/{media.length}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate font-semibold text-content">{app.name}</h3>
                <span className="shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-sky-400">
                  App
                </span>
              </div>
              <p className="text-xs text-content-tertiary">
                {app.latestVersion ? `v${app.latestVersion}` : 'unreleased'} · {app.authorName}
              </p>
            </div>

            <button
              onClick={onInstall}
              disabled={installing}
              className="btn btn-primary flex shrink-0 items-center gap-1.5 disabled:opacity-60"
            >
              {installing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {installing ? 'Installing' : 'Install'}
              {!installing && size && <span className="opacity-70">{humanSize(size)}</span>}
            </button>
          </div>

          <p className="line-clamp-3 text-sm leading-relaxed text-content-secondary">
            {app.description ?? 'No description.'}
          </p>

          <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-subtle pt-3">
            {app.standalone && <Badge icon={Package} label="Runs standalone" />}
            {app.insideArduDeck && <Badge icon={Puzzle} label="Works inside ArduDeck" />}
            <span className="ml-auto flex items-center gap-1.5">
              {PLATFORMS.map(({ id, label, icon: Icon }) => (
                <span
                  key={id}
                  title={app.platforms.includes(id) ? `${label} build available` : `No ${label} build`}
                  className={app.platforms.includes(id)
                    ? id === mine ? 'text-sky-400' : 'text-content-secondary'
                    : 'text-content-tertiary opacity-30'}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
              ))}
            </span>
          </div>

          {installing && progress && <p className="text-xs text-sky-400">{progress}</p>}
        </div>
      </div>
    </div>
  );
}

function Badge({ icon: Icon, label }: { icon: typeof Package; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-subtle bg-surface-raised px-2 py-0.5 text-[11px] text-content-secondary">
      <Icon className="h-3 w-3 text-sky-400" />
      {label}
    </span>
  );
}

function Arrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous' : 'Next'}
      className={`absolute top-1/2 -translate-y-1/2 ${side === 'left' ? 'left-1.5' : 'right-1.5'} flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/80 opacity-0 transition-opacity hover:bg-black/75 group-hover:opacity-100`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
