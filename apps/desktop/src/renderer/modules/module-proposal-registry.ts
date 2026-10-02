/**
 * Pending vehicle proposals from modules (host.vehicle). The module asks, the
 * pilot answers, the HOST writes. Nothing here is skippable by a module: it
 * has no write path, only this queue.
 */

import type { FenceProposal, ProposalResult } from '@ardudeck/module-sdk';
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

export interface PendingProposal {
  key: string;
  slug: string;
  /** Module display name where known, else the slug. */
  from: string;
  proposal: FenceProposal;
  existing: ExistingFence;
  resolve: (r: ProposalResult) => void;
}

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
  if (!proposal?.inclusion || proposal.inclusion.length < 3) {
    return Promise.resolve({ accepted: false, error: t('modules:moduleProposal.needsThreePoints') });
  }
  return new Promise<ProposalResult>((resolve) => {
    pending = {
      key: `p${++seq}`,
      slug,
      from,
      proposal,
      existing,
      resolve: (r) => {
        pending = null;
        emit();
        resolve(r);
      },
    };
    emit();
  });
}

/** Withdraw anything a module has waiting, for unload. */
export function cancelProposalsFor(slug: string): void {
  if (pending?.slug === slug) pending.resolve({ accepted: false });
}
