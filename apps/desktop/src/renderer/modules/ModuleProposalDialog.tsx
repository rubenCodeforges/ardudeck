/** Consent for a module's vehicle proposal. Host-owned, so a module cannot bypass it. */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { t as translate } from '../../shared/i18n/index.js';
import {
  getPendingProposal,
  subscribeProposal,
  type PendingProposal,
} from './module-proposal-registry';

function extent(points: { lat: number; lng: number }[]): string {
  if (points.length === 0) return '';
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const h = (Math.max(...lats) - Math.min(...lats)) * 111320;
  const w = (Math.max(...lngs) - Math.min(...lngs)) * 111320 * Math.cos((midLat * Math.PI) / 180);
  return translate('modules:moduleProposalDialog.extent', { width: Math.round(w), height: Math.round(h) });
}

/** The outline, so the pilot sees the shape rather than a point count. */
function Outline({ points, closed = true }: { points: { lat: number; lng: number }[]; closed?: boolean }): JSX.Element | null {
  const { t } = useTranslation();
  if (points.length < (closed ? 3 : 2)) return null;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 1e-6;
  const spanLng = maxLng - minLng || 1e-6;
  const d = points
    .map((p, i) => {
      const x = 4 + ((p.lng - minLng) / spanLng) * 192;
      // SVG y grows downward; north should be up.
      const y = 4 + (1 - (p.lat - minLat) / spanLat) * 92;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox="0 0 200 100" className="w-full h-[100px]" role="img" aria-label={t('modules:moduleProposalDialog.outlineLabel')}>
      <rect x="0" y="0" width="200" height="100" fill="rgba(255,255,255,0.03)" />
      <path d={closed ? `${d} Z` : d} fill={closed ? 'rgba(34,197,94,0.12)' : 'none'} stroke="#22c55e" strokeWidth="1.5" />
    </svg>
  );
}

export function ModuleProposalDialog(): JSX.Element | null {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingProposal | null>(getPendingProposal);
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeProposal(() => setPending(getPendingProposal())), []);
  useEffect(() => {
    if (pending) setBusy(false);
  }, [pending]);

  if (!pending) return null;
  const { from } = pending;
  const proposal = pending.proposal;
  const kept: string[] = [];
  if (pending.kind === 'fence') {
    if (pending.existing.exclusionShapes > 0) kept.push(t('modules:moduleProposalDialog.exclusionZones', { count: pending.existing.exclusionShapes }));
    if (pending.existing.hasReturnPoint) kept.push(t('modules:moduleProposalDialog.returnPoint'));
  }
  const heading = pending.kind === 'landing' ? t('modules:moduleProposalDialog.asksToLand', { from })
    : pending.kind === 'mission' ? t('modules:moduleProposalDialog.asksToPlan', { from })
    : pending.kind === 'survey' ? t('modules:moduleProposalDialog.asksToSurvey', { from })
    : t('modules:moduleProposalDialog.asksToWrite', { from });
  const confirm = pending.kind === 'landing' ? t('modules:moduleProposalDialog.flyAndLand')
    : pending.kind === 'mission' || pending.kind === 'survey' ? t('modules:moduleProposalDialog.addToMission')
    : t('modules:moduleProposalDialog.writeToAircraft');
  const blocked = pending.kind === 'landing' ? pending.refusal : null;

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50">
      <div className="w-[420px] max-w-[92vw] rounded-lg border border-subtle bg-surface-solid shadow-xl">
        <div className="px-4 pt-4">
          <div className="text-[11px] uppercase tracking-wide text-content-tertiary">{heading}</div>
          <div className="mt-1 text-base font-semibold text-content">{proposal.name}</div>
          <p className="mt-1 text-xs text-content-secondary">{proposal.reason}</p>
        </div>

        {pending.kind === 'mission' && (
          <div className="px-4 pt-3">
            <Outline points={pending.proposal.items.map((i) => ({ lat: i.lat, lng: i.lng }))} closed={false} />
            <div className="mt-2 text-xs text-content-secondary tabular-nums">
              {t('modules:moduleProposalDialog.missionSummary', { count: pending.proposal.items.length, extent: extent(pending.proposal.items.map((i) => ({ lat: i.lat, lng: i.lng }))) })}
            </div>
            <div className={`mt-2 rounded border px-2 py-1.5 text-xs ${pending.proposal.mode === 'replace' && pending.existingItems > 0 ? 'border-amber-500/60 text-amber-400' : 'border-subtle text-content-tertiary'}`}>
              {pending.proposal.mode === 'replace'
                ? t('modules:moduleProposalDialog.missionReplace', { count: pending.existingItems })
                : t('modules:moduleProposalDialog.missionAppend', { count: pending.existingItems })}
            </div>
          </div>
        )}

        {pending.kind === 'survey' && (() => {
          const sp = pending.proposal;
          const corridor = sp.pattern === 'corridor';
          const area = sp.areaM2 >= 10_000
            ? t('modules:moduleProposalDialog.areaHa', { value: (sp.areaM2 / 10_000).toFixed(1) })
            : t('modules:moduleProposalDialog.areaM2', { value: Math.round(sp.areaM2) });
          return (
            <div className="px-4 pt-3">
              <Outline points={sp.polygon} closed={!corridor} />
              <div className="mt-2 text-xs text-content-secondary tabular-nums">
                {corridor
                  ? t('modules:moduleProposalDialog.surveyCorridor', { count: sp.polygon.length, alt: Math.round(sp.altitudeM), extent: extent(sp.polygon) })
                  : t('modules:moduleProposalDialog.surveySummary', { pattern: sp.pattern, alt: Math.round(sp.altitudeM), area, extent: extent(sp.polygon) })}
              </div>
              <div className="mt-2 rounded border border-subtle px-2 py-1.5 text-xs text-content-tertiary">{t('modules:moduleProposalDialog.surveyNote')}</div>
            </div>
          );
        })()}

        {pending.kind === 'landing' && (
          <div className="px-4 pt-3">
            <div className="rounded border border-subtle bg-surface-inset px-3 py-2 font-mono text-xs tabular-nums text-content">
              {pending.proposal.at.lat.toFixed(6)}, {pending.proposal.at.lng.toFixed(6)}
            </div>
            <div className="mt-2 text-xs text-content-secondary">{t('modules:moduleProposalDialog.landingSummary', { alt: Math.round(pending.proposal.transitAltRelM) })}</div>
            {blocked && <div className="mt-2 rounded border border-red-500/60 px-2 py-1.5 text-xs text-red-400">{blocked}</div>}
          </div>
        )}

        {pending.kind === 'fence' && (() => { const proposal = pending.proposal; const existing = pending.existing; return (
        <div className="px-4 pt-3">
          <Outline points={proposal.inclusion ?? proposal.exclusions?.[0]?.points ?? []} />
          {proposal.inclusion && (
            <div className="mt-2 text-xs text-content-secondary tabular-nums">
              {t('modules:moduleProposalDialog.inclusionSummary', { count: proposal.inclusion.length, extent: extent(proposal.inclusion) })}
            </div>
          )}
          {proposal.exclusions && proposal.exclusions.length > 0 && (
            <div className="mt-2 text-xs text-content-secondary tabular-nums">
              {t('modules:moduleProposalDialog.exclusionSummary', {
                count: proposal.exclusions.length,
                points: proposal.exclusions.reduce((n, e) => n + e.points.length, 0),
              })}
            </div>
          )}
          {proposal.inclusion && existing.inclusionShapes > 0 && (
            <div className="mt-2 rounded border border-amber-500/60 px-2 py-1.5 text-xs text-amber-400">
              {t('modules:moduleProposalDialog.replacesFence', { count: existing.inclusionShapes, points: existing.inclusionPoints })}
            </div>
          )}
          {kept.length > 0 && (
            <div className="mt-2 text-xs text-content-tertiary">
              {t('modules:moduleProposalDialog.keptAsTheyAre', { items: kept.join(t('modules:moduleProposalDialog.and')) })}
            </div>
          )}
        </div>
        ); })()}

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-subtle px-4 py-3">
          <button
            type="button"
            className="rounded px-3 py-1.5 text-sm text-content-secondary hover:text-content"
            onClick={() => pending.resolve({ accepted: false })}
          >
            {t('common:cancel')}
          </button>
          <button
            type="button"
            disabled={busy || !!blocked}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            onClick={() => {
              setBusy(true);
              pending.resolve({ accepted: true });
            }}
          >
            {busy ? t('common:writing') : confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
