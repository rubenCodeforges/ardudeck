/**
 * MAVLink signing audit log + compliance evidence.
 *
 * Procurement reviewers for defense, public-safety and critical-infrastructure
 * buyers ask the same question: "show me the link was secured, and prove the
 * record wasn't doctored." This module keeps a hash-chained, append-only log of
 * every signing state change and turns it (plus the current posture) into an
 * exportable evidence pack.
 *
 * The chain links each entry to the previous one via SHA-256, so an in-place
 * edit, insertion or deletion inside the retained window is detectable: re-hash
 * the chain and the first mismatch is the tampered entry. This is tamper-EVIDENT,
 * not tamper-proof (the store is local), which is the honest claim to make.
 *
 * Scope boundary baked into the report copy: we secure and attest the link and
 * the ground station, NOT the airframe. Signing is authentication, not
 * encryption, and a USB connection bypasses it.
 */
import { randomUUID } from 'node:crypto';
import Store from 'electron-store';
import { GENESIS, hashEntry, verifyAuditChain } from './signing-audit-chain.js';
import type {
  SigningAuditEvent,
  SigningAuditActor,
  SigningAuditEntry,
  ChainVerification,
  SecureLinkPosture,
} from '../../shared/signing-audit-types.js';

export type {
  SigningAuditEvent,
  SigningAuditActor,
  SigningAuditEntry,
  ChainVerification,
  SecureLinkPosture,
} from '../../shared/signing-audit-types.js';
export { verifyAuditChain } from './signing-audit-chain.js';

// Cap the retained window so the store can't grow unbounded. Rotation drops the
// oldest entries; verification runs from the first retained entry forward.
const MAX_ENTRIES = 5000;

const auditStore = new Store<{ entries: SigningAuditEntry[]; nextSeq: number }>({
  name: 'mavlink-signing-audit',
  defaults: { entries: [], nextSeq: 1 },
});

export interface RecordSigningEventInput {
  event: SigningAuditEvent;
  actor: SigningAuditActor;
  detail: string;
  fingerprint?: string;
  sysid?: number;
  transport?: string;
  /** Injected so the call sites stay testable; defaults to Date.now(). */
  now?: number;
}

/** Append a signing event to the chained audit log. Returns the new entry. */
export function recordSigningEvent(input: RecordSigningEventInput): SigningAuditEntry {
  const entries = auditStore.get('entries');
  const seq = auditStore.get('nextSeq');
  const prevHash = entries.length > 0 ? entries[entries.length - 1]!.hash : GENESIS;
  const ts = input.now ?? Date.now();
  const base: Omit<SigningAuditEntry, 'hash'> = {
    seq,
    id: randomUUID(),
    ts,
    isoTime: new Date(ts).toISOString(),
    event: input.event,
    actor: input.actor,
    detail: input.detail,
    prevHash,
    ...(input.fingerprint ? { fingerprint: input.fingerprint } : {}),
    ...(input.sysid !== undefined ? { sysid: input.sysid } : {}),
    ...(input.transport ? { transport: input.transport } : {}),
  };
  const entry: SigningAuditEntry = { ...base, hash: hashEntry(base) };
  const next = [...entries, entry];
  // Rotate oldest if over cap.
  const trimmed = next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
  auditStore.set('entries', trimmed);
  auditStore.set('nextSeq', seq + 1);
  return entry;
}

export function getAuditLog(): SigningAuditEntry[] {
  return auditStore.get('entries');
}

export interface EvidencePackContext {
  posture: SecureLinkPosture;
  connection: {
    connected: boolean;
    transport?: string;
    sysid?: number;
    mavlinkVersion?: number;
    boardUid?: string | null;
  };
  app: { name: string; version: string; platform: string; electron: string };
  generatedAt: number;
}

export interface EvidencePack {
  schema: 'ardudeck.secure-link-evidence/v1';
  generatedAt: string;
  app: EvidencePackContext['app'];
  connection: EvidencePackContext['connection'];
  posture: SecureLinkPosture;
  chain: ChainVerification;
  auditLog: SigningAuditEntry[];
  scope: string[];
}

const SCOPE_STATEMENT = [
  'This evidence pack attests to the security of the MAVLink link and the ground station only. It does NOT certify the aircraft, autopilot firmware, or any NDAA / Blue UAS airframe status.',
  'MAVLink-2 signing provides packet authentication, not encryption. Telemetry payloads are not confidential on the wire.',
  'A direct USB / serial connection to the autopilot bypasses signing entirely. Signing protects network and radio links.',
  'The audit log is tamper-evident (SHA-256 hash chain) but stored locally; it is not a tamper-proof external ledger.',
];

/** Assemble the machine-readable evidence pack. */
export function buildEvidencePack(ctx: EvidencePackContext): EvidencePack {
  const auditLog = getAuditLog();
  return {
    schema: 'ardudeck.secure-link-evidence/v1',
    generatedAt: new Date(ctx.generatedAt).toISOString(),
    app: ctx.app,
    connection: ctx.connection,
    posture: ctx.posture,
    chain: verifyAuditChain(auditLog),
    auditLog,
    scope: SCOPE_STATEMENT,
  };
}

const EVENT_LABELS: Record<SigningAuditEvent, string> = {
  'key-set': 'Signing key set', // i18n-exempt
  'key-sent-to-fc': 'Key pushed to flight controller', // i18n-exempt
  'signing-enabled': 'Signing enabled', // i18n-exempt
  'signing-disabled': 'Signing disabled', // i18n-exempt
  'key-auto-matched': 'Saved key auto-matched on connect', // i18n-exempt
  'key-mismatch': 'Key mismatch (FC signed, no matching key)', // i18n-exempt
  'key-removed': 'Signing key removed', // i18n-exempt
  'startup-auto-enable': 'Signing auto-enabled at startup', // i18n-exempt
};

/** Render a human-readable posture report (Markdown) for a procurement reviewer. */
export function renderPostureReport(pack: EvidencePack): string {
  const p = pack.posture;
  const lines: string[] = [];
  lines.push('# ArduDeck Secure Link - Compliance Evidence');
  lines.push('');
  lines.push(`Generated: ${pack.generatedAt}`);
  lines.push(`Application: ${pack.app.name} v${pack.app.version} (${pack.app.platform}, Electron ${pack.app.electron})`);
  lines.push('');
  lines.push('## Current secure-link posture');
  lines.push('');
  lines.push(`- Outgoing packet signing: ${p.signingEnabled ? 'ENABLED' : 'disabled'}`);
  lines.push(`- Signing key loaded: ${p.hasKey ? 'yes' : 'no'}`);
  lines.push(`- Key delivered to flight controller this session: ${p.sentToFc ? 'yes' : 'no'}`);
  lines.push(`- Flight controller emitting signed packets: ${p.fcSigning ? 'yes' : 'no'}`);
  lines.push(`- Key mismatch detected: ${p.keyMismatch ? 'YES (investigate)' : 'no'}`);
  if (p.activeFingerprint) lines.push(`- Active key fingerprint: ${p.activeFingerprint}`);
  lines.push(`- Saved keys: ${p.savedKeys.length}`);
  for (const k of p.savedKeys) {
    const ids = k.systemIds.length > 0 ? ` (verified sysid ${k.systemIds.join(', ')})` : '';
    lines.push(`  - ${k.fingerprint}${k.label ? ` "${k.label}"` : ''}${ids}`);
  }
  lines.push('');
  lines.push('## Connection at time of export');
  lines.push('');
  lines.push(`- Connected: ${pack.connection.connected ? 'yes' : 'no'}`);
  if (pack.connection.transport) lines.push(`- Transport: ${pack.connection.transport}`);
  if (pack.connection.sysid !== undefined) lines.push(`- System ID: ${pack.connection.sysid}`);
  if (pack.connection.mavlinkVersion) lines.push(`- MAVLink version: ${pack.connection.mavlinkVersion}`);
  if (pack.connection.boardUid) lines.push(`- Board UID: ${pack.connection.boardUid}`);
  lines.push('');
  lines.push('## Tamper-evident audit log');
  lines.push('');
  lines.push(`- Hash chain integrity: ${pack.chain.ok ? 'VERIFIED' : `BROKEN at seq ${pack.chain.brokenAtSeq}`}`);
  lines.push(`- Entries: ${pack.chain.count}`);
  lines.push('');
  if (pack.auditLog.length === 0) {
    lines.push('_No signing events recorded yet._');
  } else {
    lines.push('| Seq | Time (UTC) | Event | Actor | Key | Sysid | Detail |');
    lines.push('|-----|------------|-------|-------|-----|-------|--------|');
    for (const e of pack.auditLog) {
      lines.push(
        `| ${e.seq} | ${e.isoTime} | ${EVENT_LABELS[e.event]} | ${e.actor} | ${e.fingerprint ?? ''} | ${e.sysid ?? ''} | ${e.detail.replace(/\|/g, '/')} |`,
      );
    }
  }
  lines.push('');
  lines.push('## Scope and limitations');
  lines.push('');
  for (const s of pack.scope) lines.push(`- ${s}`);
  lines.push('');
  return lines.join('\n');
}
