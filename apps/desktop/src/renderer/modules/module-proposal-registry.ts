/**
 * Pending vehicle proposals from modules (host.vehicle). The module asks, the
 * pilot answers, the HOST writes. Nothing here is skippable by a module: it
 * has no write path, only this queue.
 */

import type { FenceProposal, LandingProposal, MissionProposal, ProposalResult } from '@ardudeck/module-sdk';
import { t } from '../../shared/i18n/index.js';

/**
 * What a write would do to the fence already held. A module proposes ONE
 * inclusion volume, and ArduPilot treats several inclusion shapes as an
 * intersection, so the host replaces inclusion geometry rather than stacking
 * onto it. Exclusion zones and the return point are the pilot's and are kept.
 */
export interface ExistingFence {
  /** Inclusion shapes and points this write replaces. */
  inclusionShapes: number;
  inclusionPoints: number;
  /** Exclusion shapes kept as they are. */
  exclusionShapes: number;
  hasReturnPoint: boolean;
}

interface PendingBase {
  key: string;
  slug: string;
  /** Module display name where known, else the slug. */
  from: string;
  resolve: (r: ProposalResult) => void;
}

export interface PendingFence extends PendingBase {
  kind: 'fence';
  proposal: FenceProposal;
  existing: ExistingFence;
}

export interface PendingMission extends PendingBase {
  kind: 'mission';
  proposal: MissionProposal;
  /** Waypoints the mission holds now, so "replace" says what goes. */
  existingItems: number;
}

export interface PendingLanding extends PendingBase {
  kind: 'landing';
  proposal: LandingProposal;
  /** Why the aircraft cannot do it right now, or null. */
  refusal: string | null;
}

/** A survey area to plan with the host's own survey generator. Agents propose these; modules use registerSurveyGenerator instead. */
export interface SurveyProposal {
  name: string;
  reason: string;
  /** Closed boundary, or the centerline for the corridor pattern. */
  polygon: { lat: number; lng: number }[];
  pattern: string;
  altitudeM: number;
  /** Ground area of a closed boundary in square metres, 0 for a corridor. */
  areaM2: number;
}

export interface PendingSurvey extends PendingBase {
  kind: 'survey';
  proposal: SurveyProposal;
}

export type PendingProposal = PendingFence | PendingMission | PendingLanding | PendingSurvey;

let pending: PendingProposal | null = null;
const listeners = new Set<() => void>();
let seq = 0;

function emit(): void {
  for (const l of listeners) l();
}

export function subscribeProposal(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getPendingProposal(): PendingProposal | null {
  return pending;
}

/**
 * Queue a proposal and wait for the pilot. One at a time on purpose: two
 * fence dialogs stacked on each other is how the wrong one gets confirmed.
 */
export function proposeFence(
  slug: string,
  from: string,
  proposal: FenceProposal,
  existing: ExistingFence,
): Promise<ProposalResult> {
  if (pending) {
    return Promise.resolve({ accepted: false, error: t('modules:moduleProposal.alreadyOpen') });
  }
  const hasInclusion = Array.isArray(proposal?.inclusion) && proposal.inclusion.length >= 3;
  const hasExclusions = Array.isArray(proposal?.exclusions) && proposal.exclusions.some((e) => (e?.points?.length ?? 0) >= 3);
  if (!hasInclusion && !hasExclusions) {
    return Promise.resolve({ accepted: false, error: t('modules:moduleProposal.needsThreePoints') });
  }
  return queue({ kind: 'fence', slug, from, proposal, existing });
}

function queue(p: Omit<PendingFence, 'key' | 'resolve'> | Omit<PendingMission, 'key' | 'resolve'> | Omit<PendingLanding, 'key' | 'resolve'> | Omit<PendingSurvey, 'key' | 'resolve'>): Promise<ProposalResult> {
  return new Promise<ProposalResult>((resolve) => {
    pending = {
      ...p,
      key: `p${++seq}`,
      resolve: (r) => {
        pending = null;
        emit();
        resolve(r);
      },
    } as PendingProposal;
    emit();
  });
}

export function proposeMission(slug: string, from: string, proposal: MissionProposal, existingItems: number): Promise<ProposalResult> {
  if (pending) return Promise.resolve({ accepted: false, error: t('modules:moduleProposal.alreadyOpen') });
  const ok = Array.isArray(proposal?.items) && proposal.items.length > 0 && proposal.items.every((i) => Number.isFinite(i?.lat) && Number.isFinite(i?.lng) && Number.isFinite(i?.altitude));
  if (!ok) return Promise.resolve({ accepted: false, error: t('modules:moduleProposal.needsItems') });
  return queue({ kind: 'mission', slug, from, proposal, existingItems });
}

export function proposeLanding(slug: string, from: string, proposal: LandingProposal, refusal: string | null): Promise<ProposalResult> {
  if (pending) return Promise.resolve({ accepted: false, error: t('modules:moduleProposal.alreadyOpen') });
  if (!Number.isFinite(proposal?.at?.lat) || !Number.isFinite(proposal?.at?.lng)) return Promise.resolve({ accepted: false, error: t('modules:moduleProposal.needsPoint') });
  return queue({ kind: 'landing', slug, from, proposal, refusal });
}

export function proposeSurvey(slug: string, from: string, proposal: SurveyProposal): Promise<ProposalResult> {
  if (pending) return Promise.resolve({ accepted: false, error: t('modules:moduleProposal.alreadyOpen') });
  const min = proposal?.pattern === 'corridor' || proposal?.pattern === 'panorama' ? 2 : 3;
  const ok = Array.isArray(proposal?.polygon) && proposal.polygon.length >= min && proposal.polygon.every((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng));
  if (!ok) return Promise.resolve({ accepted: false, error: t('modules:moduleProposal.needsThreePoints') });
  return queue({ kind: 'survey', slug, from, proposal });
}

/** Withdraw anything a module has waiting, for unload. */
export function cancelProposalsFor(slug: string): void {
  if (pending?.slug === slug) pending.resolve({ accepted: false });
}
