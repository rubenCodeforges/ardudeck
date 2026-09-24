/**
 * Fleet Vault: version-controlled parameter snapshots, missions and survey
 * areas with optional GitHub backup/sync. UI over the local git repo managed
 * by the main process.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CloudOff,
  GitBranch,
  Github,
  Camera,
  FolderOpen,
  RefreshCw,
  Cpu,
  Map as MapIcon,
  History,
  X,
  ShieldAlert,
  ChevronRight,
  Check,
  Pencil,
} from 'lucide-react';
import { useFleetRepoStore, useCurrentVaultUnit, isRestoreTargetMatch, isRestoreFirmwareMatch } from '../../stores/fleet-repo-store';
import { VaultAutoSyncToggle } from './VaultAutoSyncToggle';
import { useParameterStore } from '../../stores/parameter-store';
import { useConnectionStore } from '../../stores/connection-store';

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function fmtValue(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return String(parseFloat(v.toPrecision(7)));
}

// ── GitHub connect dialog ───────────────────────────────────────

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <button
      onClick={() => window.electronAPI?.openExternal(href)}
      className="text-blue-500 hover:text-blue-400 hover:underline transition-colors"
    >
      {children}
    </button>
  );
}

function GithubDialog({ onClose }: { onClose: () => void }) {
  const status = useFleetRepoStore((s) => s.status);
  const refresh = useFleetRepoStore((s) => s.refresh);
  const [device, setDevice] = useState<{ userCode: string; verificationUri: string; deviceCode: string; interval: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pat, setPat] = useState('');
  const [repoName, setRepoName] = useState(
    status?.github.mode === 'custom' ? 'ardudeck-fleet' : status?.github.repo ?? 'ardudeck-fleet',
  );
  const [showCustom, setShowCustom] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [customToken, setCustomToken] = useState('');
  const [customUser, setCustomUser] = useState('');
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const connected = status?.github.connected ?? false;

  useEffect(() => () => {
    if (pollTimer.current) clearInterval(pollTimer.current);
  }, []);

  const startDeviceFlow = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await window.electronAPI?.fleetRepoGhDeviceStart();
    setBusy(false);
    if (!res?.success || !res.deviceCode) {
      setError(res?.error ?? 'Could not reach GitHub');
      return;
    }
    setDevice({
      userCode: res.userCode!,
      verificationUri: res.verificationUri!,
      deviceCode: res.deviceCode,
      interval: res.interval ?? 5,
    });
    window.electronAPI?.openExternal(res.verificationUri!);
    pollTimer.current = setInterval(async () => {
      const poll = await window.electronAPI?.fleetRepoGhDevicePoll(res.deviceCode!);
      if (poll?.state === 'ok') {
        if (pollTimer.current) clearInterval(pollTimer.current);
        setDevice(null);
        await refresh();
      } else if (poll?.state === 'error') {
        if (pollTimer.current) clearInterval(pollTimer.current);
        setDevice(null);
        setError(poll.error ?? 'Authorization failed');
      }
    }, ((res.interval ?? 5) + 1) * 1000);
  }, [refresh]);

  const submitPat = useCallback(async () => {
    if (!pat.trim()) return;
    setBusy(true);
    setError(null);
    const res = await window.electronAPI?.fleetRepoGhSetToken(pat.trim());
    setBusy(false);
    if (!res?.success) {
      setError(res?.error ?? 'Token rejected');
      return;
    }
    setPat('');
    await refresh();
  }, [pat, refresh]);

  const [repoList, setRepoList] = useState<Array<{ fullName: string; private: boolean }> | null>(null);
  const [pickedRepo, setPickedRepo] = useState('');

  const loadRepoList = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await window.electronAPI?.fleetRepoGhListRepos();
    setBusy(false);
    if (!res?.success || !res.repos) {
      setError(res?.error ?? 'Could not list repositories');
      return;
    }
    setRepoList(res.repos);
    setPickedRepo(res.repos[0]?.fullName ?? '');
  }, []);

  const useExistingRepo = useCallback(async () => {
    if (!pickedRepo) return;
    setBusy(true);
    setError(null);
    const res = await window.electronAPI?.fleetRepoGhUseExisting(pickedRepo);
    setBusy(false);
    if (!res?.success) {
      setError(res?.error ?? 'Could not use that repository');
      return;
    }
    setRepoList(null);
    await refresh();
  }, [pickedRepo, refresh]);

  const createRepo = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await window.electronAPI?.fleetRepoGhCreateRepo(repoName.trim() || 'ardudeck-fleet');
    setBusy(false);
    if (!res?.success) {
      setError(res?.error ?? 'Could not create repository');
      return;
    }
    await refresh();
  }, [repoName, refresh]);

  const disconnect = useCallback(async () => {
    await window.electronAPI?.fleetRepoGhDisconnect();
    setDevice(null);
    await refresh();
  }, [refresh]);

  const submitCustom = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await window.electronAPI?.fleetRepoSetCustomRemote(
      customUrl, customToken, customUser.trim() || undefined,
    );
    setBusy(false);
    if (!res?.success) {
      setError(res?.error ?? 'Could not save the repository');
      return;
    }
    setCustomToken('');
    await refresh();
  }, [customUrl, customToken, customUser, refresh]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9998]" onClick={onClose}>
      <div
        className="bg-surface-solid rounded-2xl border border-subtle w-full max-w-md mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-subtle">
          <div className="flex items-center gap-2.5">
            <Github className="w-4.5 h-4.5 text-content" />
            <h2 className="text-sm font-semibold text-content">GitHub backup</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-surface-raised text-content-secondary hover:text-content transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {error && (
            <div className="text-[11px] text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
          )}

          {!connected && !device && (
            <>
              <p className="text-[11px] text-content-secondary leading-relaxed">
                ArduDeck backs up your parameter snapshots, missions and areas to an online
                repository. Everything keeps working offline; sync happens when you ask for it.
                Two ways to connect:
              </p>

              {/* Option 1: sign in */}
              <div className="rounded-xl border border-subtle p-3.5">
                <div className="text-xs font-medium text-content mb-1">1. Sign in with GitHub</div>
                <p className="text-[10px] text-content-tertiary leading-relaxed mb-2.5">
                  Easiest. ArduDeck creates a private repository for you. GitHub's approval page
                  asks for repository access in general (that is how GitHub permissions work);
                  ArduDeck only touches the one vault repository.
                </p>
                <button
                  onClick={startDeviceFlow}
                  disabled={busy}
                  className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  Connect GitHub account
                </button>
                <p className="text-[10px] text-content-tertiary mt-2">
                  No account yet? <ExtLink href="https://github.com/signup">Create one free at github.com</ExtLink>
                </p>
              </div>

              {/* Option 2: token */}
              <div className="rounded-xl border border-subtle p-3.5">
                <div className="text-xs font-medium text-content mb-1">2. Paste a GitHub token</div>
                <p className="text-[10px] text-content-tertiary leading-relaxed mb-2.5">
                  No approval page. Create a token yourself (a fine-grained one limited to a single
                  repository gives ArduDeck access to nothing else) and paste it here.{' '}
                  <ExtLink href="https://github.com/settings/personal-access-tokens/new">Open the token page</ExtLink>
                  {' '}(choose "Only select repositories" and give Contents read and write), or read{' '}
                  <ExtLink href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token">GitHub's step-by-step guide</ExtLink>.
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={pat}
                    onChange={(e) => setPat(e.target.value)}
                    placeholder="Personal access token"
                    className="flex-1 text-xs bg-surface-input border border-subtle rounded-lg px-3 py-2 text-content placeholder:text-content-tertiary focus:outline-none focus:border-blue-500/40"
                  />
                  <button
                    onClick={submitPat}
                    disabled={busy || !pat.trim()}
                    className="px-3 py-2 rounded-lg bg-surface-raised border border-subtle text-xs text-content hover:bg-surface-overlay transition-colors disabled:opacity-50"
                  >
                    Use
                  </button>
                </div>
              </div>

              {/* Option 3: bring your own repo (any git host) */}
              <button
                onClick={() => setShowCustom((v) => !v)}
                className="self-start text-[11px] text-content-secondary hover:text-content transition-colors"
              >
                {showCustom ? 'Hide advanced option' : 'Advanced: I already have a repository (GitHub, GitLab, self-hosted)'}
              </button>
              {showCustom && (
                <div className="rounded-xl border border-subtle p-3.5 flex flex-col gap-2">
                  <p className="text-[10px] text-content-tertiary leading-relaxed">
                    Point ArduDeck at any existing empty repository over HTTPS. SSH URLs are
                    converted to HTTPS automatically. The token needs read and write access to
                    that repository (GitLab tokens: set username to "oauth2").{' '}
                    <ExtLink href="https://github.com/new">Create an empty repository on GitHub</ExtLink>
                    {' '}(set it to Private, don't add a README).
                  </p>
                  <input
                    type="text"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder="https://host/you/repo.git"
                    className="w-full text-xs bg-surface-input border border-subtle rounded-lg px-3 py-2 text-content placeholder:text-content-tertiary focus:outline-none focus:border-blue-500/40"
                  />
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={customToken}
                      onChange={(e) => setCustomToken(e.target.value)}
                      placeholder="Token"
                      className="flex-1 text-xs bg-surface-input border border-subtle rounded-lg px-3 py-2 text-content placeholder:text-content-tertiary focus:outline-none focus:border-blue-500/40"
                    />
                    <input
                      type="text"
                      value={customUser}
                      onChange={(e) => setCustomUser(e.target.value)}
                      placeholder="Username (optional)"
                      className="w-36 text-xs bg-surface-input border border-subtle rounded-lg px-3 py-2 text-content placeholder:text-content-tertiary focus:outline-none focus:border-blue-500/40"
                    />
                  </div>
                  <button
                    onClick={submitCustom}
                    disabled={busy || !customUrl.trim() || !customToken.trim()}
                    className="self-end px-3 py-2 rounded-lg bg-surface-raised border border-subtle text-xs text-content hover:bg-surface-overlay transition-colors disabled:opacity-50"
                  >
                    Use this repository
                  </button>
                </div>
              )}
            </>
          )}

          {device && (
            <div className="flex flex-col items-center gap-3 py-2">
              <p className="text-[11px] text-content-secondary">Enter this code at {device.verificationUri.replace('https://', '')}</p>
              <div className="text-2xl font-bold tracking-[0.3em] text-content bg-surface-raised border border-subtle rounded-xl px-5 py-3 font-mono">
                {device.userCode}
              </div>
              <p className="text-[10px] text-content-tertiary">Waiting for authorization...</p>
            </div>
          )}

          {connected && status?.github.mode === 'custom' && (
            <>
              <div className="flex items-center gap-2 text-xs text-content">
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                Using your repository
              </div>
              <p className="text-[10px] font-mono text-content-secondary break-all">{status.github.repo}</p>
              <button
                onClick={disconnect}
                className="self-start text-[11px] text-red-500 hover:text-red-400 transition-colors"
              >
                Disconnect
              </button>
            </>
          )}

          {connected && status?.github.mode !== 'custom' && (
            <>
              <div className="flex items-center gap-2 text-xs text-content">
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                Connected as <span className="font-semibold">{status?.github.login}</span>
              </div>
              <div>
                <label className="text-[10px] text-content-secondary block mb-1">Repository (private, created if missing)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value)}
                    className="flex-1 text-xs bg-surface-input border border-subtle rounded-lg px-3 py-2 text-content focus:outline-none focus:border-blue-500/40"
                  />
                  <button
                    onClick={createRepo}
                    disabled={busy || !repoName.trim()}
                    className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs transition-colors disabled:opacity-50"
                  >
                    {status?.github.repo ? 'Update' : 'Create'}
                  </button>
                </div>
                {status?.github.repo && (
                  <p className="text-[10px] text-content-tertiary mt-1.5">
                    Using {status.github.login}/{status.github.repo}
                  </p>
                )}
              </div>

              {/* Adopt an existing repository (with its history) */}
              {repoList === null ? (
                <button
                  onClick={loadRepoList}
                  disabled={busy}
                  className="self-start text-[11px] text-content-secondary hover:text-content transition-colors disabled:opacity-50"
                >
                  Or pick one of your existing repositories...
                </button>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-content-secondary">
                    Existing repository (its history is kept; only possible while this vault is empty)
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={pickedRepo}
                      onChange={(e) => setPickedRepo(e.target.value)}
                      className="flex-1 text-xs bg-surface-input border border-subtle rounded-lg px-2 py-2 text-content focus:outline-none focus:border-blue-500/40"
                    >
                      {repoList.map((r) => (
                        <option key={r.fullName} value={r.fullName}>
                          {r.fullName}{r.private ? '' : ' (public)'}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={useExistingRepo}
                      disabled={busy || !pickedRepo}
                      className="px-3 py-2 rounded-lg bg-surface-raised border border-subtle text-xs text-content hover:bg-surface-overlay transition-colors disabled:opacity-50"
                    >
                      Use
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={disconnect}
                className="self-start text-[11px] text-red-500 hover:text-red-400 transition-colors"
              >
                Disconnect account
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Diff panel ──────────────────────────────────────────────────

function DiffPanel() {
  const diff = useFleetRepoStore((s) => s.diff);
  const clearDiff = useFleetRepoStore((s) => s.clearDiff);
  const restoreSnapshot = useFleetRepoStore((s) => s.restoreSnapshot);
  const restoreBusy = useFleetRepoStore((s) => s.restoreBusy);
  const restoreProgress = useFleetRepoStore((s) => s.restoreProgress);
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const liveFirmware = useConnectionStore((s) => s.connectionState.firmware);
  const units = useFleetRepoStore((s) => s.units);
  const unitOverride = useFleetRepoStore((s) => s.unitOverride);
  const currentUnit = useCurrentVaultUnit();
  const [includeCal, setIncludeCal] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // History is repo-wide, so the open snapshot may belong to another aircraft.
  // The store refuses that restore outright; this mirrors the same rule so the
  // button explains itself instead of failing on click.
  const snapshotOwner = diff ? units.find((u) => u.uid === diff.uid) : undefined;
  const ownerName = snapshotOwner?.name ?? diff?.uid ?? '';
  const targetMatches = diff
    ? isRestoreTargetMatch(diff.uid, unitOverride, currentUnit?.uid ?? null, snapshotOwner?.aliases)
    : false;
  // Same unit can still be the wrong stack: a reflashed board keeps its uid.
  const firmwareMatches = isRestoreFirmwareMatch(diff?.snapshotFirmware, liveFirmware);

  if (!diff) return null;
  const calCount = diff.changed.filter((r) => r.calibration).length;
  const applicable = diff.changed.filter((r) => includeCal || !r.calibration).length;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-subtle">
        <button
          onClick={clearDiff}
          className="text-[11px] text-content-secondary hover:text-content transition-colors"
        >
          Back to history
        </button>
        <div className="flex-1" />
        <span className="text-[11px] text-content-secondary">
          {diff.changed.length} differ, {diff.sameCount} identical, {diff.totalInSnapshot} in snapshot
        </span>
      </div>

      {!diff.liveAvailable && (
        <div className="mx-4 mt-3 text-[11px] text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          {diff.liveLoading
            ? 'Parameters are still downloading from the vehicle. Open this snapshot again once the download finishes.'
            : 'No live parameters loaded. Connect the vehicle to compare and restore.'}
        </div>
      )}

      {diff.liveAvailable && diff.changed.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-xs text-content-secondary">
          Vehicle matches this snapshot.
        </div>
      )}

      {diff.liveAvailable && diff.changed.length > 0 && (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-content-tertiary">
                  <th className="text-left font-medium pb-2">Parameter</th>
                  <th className="text-right font-medium pb-2">Vehicle now</th>
                  <th className="text-right font-medium pb-2">Snapshot</th>
                </tr>
              </thead>
              <tbody>
                {diff.changed.map((row) => (
                  <tr key={row.id} className="border-t border-subtle">
                    <td className="py-1.5 font-mono text-content flex items-center gap-1.5">
                      {row.id}
                      {row.calibration && (
                        <span
                          className="inline-flex items-center gap-0.5 text-[9px] text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded px-1"
                          data-tip="Per-unit calibration - excluded from restore by default"
                        >
                          <ShieldAlert className="w-2.5 h-2.5" /> CAL
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-right font-mono text-content-secondary">
                      {row.currentValue !== null ? fmtValue(row.currentValue) : '-'}
                    </td>
                    <td className="py-1.5 text-right font-mono text-content">{fmtValue(row.snapshotValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {diff.missingOnVehicle.length > 0 && (
              <p className="text-[10px] text-content-tertiary mt-3">
                {diff.missingOnVehicle.length} snapshot param{diff.missingOnVehicle.length === 1 ? '' : 's'} not present on this vehicle (skipped).
              </p>
            )}
          </div>

          <div className="px-4 py-3 border-t border-subtle flex items-center gap-3">
            {calCount > 0 && (
              <label className="flex items-center gap-1.5 text-[11px] text-content-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeCal}
                  onChange={(e) => { setIncludeCal(e.target.checked); setConfirming(false); }}
                  className="w-3.5 h-3.5 rounded"
                />
                Include {calCount} calibration param{calCount === 1 ? '' : 's'}
              </label>
            )}
            <div className="flex-1" />
            {restoreBusy && restoreProgress ? (
              <span className="text-[11px] text-content-secondary">
                Writing {restoreProgress.done}/{restoreProgress.total}...
              </span>
            ) : confirming ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-content-secondary">
                  Write {applicable} value{applicable === 1 ? '' : 's'} to the vehicle?
                </span>
                <button
                  onClick={async () => { setConfirming(false); await restoreSnapshot(includeCal); }}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors"
                >
                  Restore
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="px-2 py-1.5 rounded-lg text-xs text-content-secondary hover:text-content transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                disabled={!isConnected || applicable === 0 || !targetMatches || !firmwareMatches}
                className="px-3 py-1.5 rounded-lg bg-surface-raised border border-subtle text-xs text-content hover:bg-surface-overlay transition-colors disabled:opacity-50"
                data-tip={
                  !isConnected
                    ? 'Connect the vehicle to restore'
                    : !targetMatches
                      ? `This snapshot belongs to ${ownerName}. Restore only writes to the vehicle it came from; set "Working on" to ${ownerName} if this is that aircraft.`
                      : !firmwareMatches
                        ? `This snapshot was taken from ${diff.snapshotFirmware}, but the vehicle is running ${liveFirmware}. Parameter names do not carry across flight stacks.`
                        : undefined
                }
              >
                Restore snapshot...
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main view ───────────────────────────────────────────────────

export function VaultView() {
  const status = useFleetRepoStore((s) => s.status);
  const units = useFleetRepoStore((s) => s.units);
  const sites = useFleetRepoStore((s) => s.sites);
  const history = useFleetRepoStore((s) => s.history);
  const filterPrefix = useFleetRepoStore((s) => s.filterPrefix);
  const setFilterPrefix = useFleetRepoStore((s) => s.setFilterPrefix);
  const refresh = useFleetRepoStore((s) => s.refresh);
  const snapshotParams = useFleetRepoStore((s) => s.snapshotParams);
  const snapshotMission = useFleetRepoStore((s) => s.snapshotMission);
  const snapshotArea = useFleetRepoStore((s) => s.snapshotArea);
  const renameUnit = useFleetRepoStore((s) => s.renameUnit);
  const linkUnit = useFleetRepoStore((s) => s.linkUnit);
  const unitOverride = useFleetRepoStore((s) => s.unitOverride);
  const setUnitOverride = useFleetRepoStore((s) => s.setUnitOverride);
  const snapshotBusy = useFleetRepoStore((s) => s.snapshotBusy);
  const sync = useFleetRepoStore((s) => s.sync);
  const syncBusy = useFleetRepoStore((s) => s.syncBusy);
  const lastError = useFleetRepoStore((s) => s.lastError);
  const lastNotice = useFleetRepoStore((s) => s.lastNotice);
  const clearMessages = useFleetRepoStore((s) => s.clearMessages);
  const diff = useFleetRepoStore((s) => s.diff);
  const diffLoading = useFleetRepoStore((s) => s.diffLoading);
  const loadDiff = useFleetRepoStore((s) => s.loadDiff);

  const paramCount = useParameterStore((s) => s.paramCount);
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const currentUnit = useCurrentVaultUnit();

  const [ghOpen, setGhOpen] = useState(false);
  const [renamingUid, setRenamingUid] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [linkTarget, setLinkTarget] = useState('');
  const [siteName, setSiteName] = useState('');
  const [missionName, setMissionName] = useState('');
  const [preview, setPreview] = useState<{ title: string; content: string } | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-dismiss notices
  useEffect(() => {
    if (!lastNotice && !lastError) return;
    const t = setTimeout(clearMessages, 6000);
    return () => clearTimeout(t);
  }, [lastNotice, lastError, clearMessages]);

  const filteredHistory = useMemo(() => {
    if (!filterPrefix) return history;
    return history.filter((h) => h.files.some((f) => f.startsWith(filterPrefix)));
  }, [history, filterPrefix]);

  const unitByUid = useMemo(() => new Map(units.map((u) => [u.uid, u])), [units]);

  // Alias-aware: the connected vehicle may be linked into a unit whose folder
  // id differs from its live board id (identity scheme changes, swapped FCs)
  const isCurrentUnit = useCallback(
    (u: { uid: string; aliases?: string[] }) =>
      currentUnit !== null && (u.uid === currentUnit.uid || (u.aliases?.includes(currentUnit.uid) ?? false)),
    [currentUnit],
  );
  const currentHasUnit = useMemo(() => units.some(isCurrentUnit), [units, isCurrentUnit]);

  const openCommit = useCallback(async (entry: (typeof history)[number]) => {
    setPreview(null);
    const paramFile = entry.files.find((f) => /^units\/[^/]+\/params\.param$/.test(f));
    if (paramFile) {
      const uid = paramFile.split('/')[1]!;
      await loadDiff(entry.oid, uid);
      return;
    }
    const contentFile = entry.files.find((f) => f.endsWith('.waypoints') || f.endsWith('.kml'));
    if (contentFile) {
      const content = await window.electronAPI?.fleetRepoReadFile(contentFile, entry.oid);
      if (content) setPreview({ title: contentFile, content });
    }
  }, [loadDiff]);

  const ghConnected = status?.github.connected ?? false;
  const canSync = ghConnected && Boolean(status?.github.repo);

  return (
    <div className="h-full flex flex-col bg-surface-base">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-subtle">
        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
          <GitBranch className="w-4 h-4 text-blue-500" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-content leading-tight">Fleet Vault</h1>
          <p className="text-[10px] text-content-secondary">
            Backup and history for settings, missions and survey areas ·{' '}
            {status ? `${status.commitCount} save${status.commitCount === 1 ? '' : 's'}` : 'Loading...'}
            {status?.github.lastSyncAt ? ` · copied online ${timeAgo(status.github.lastSyncAt)}` : ''}
          </p>
        </div>
        <div className="flex-1" />
        {lastNotice && <span className="text-[11px] text-emerald-500">{lastNotice}</span>}
        {lastError && <span className="text-[11px] text-red-500 max-w-md truncate" data-tip={lastError}>{lastError}</span>}
        <button
          onClick={() => window.electronAPI?.fleetRepoOpenDir()}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-content-secondary hover:text-content hover:bg-surface-raised transition-colors"
          data-tip="Open vault folder"
        >
          <FolderOpen className="w-4 h-4" />
        </button>
        {canSync && <VaultAutoSyncToggle savesLabel="Auto sync on" />}
        {canSync && (
          <button
            onClick={sync}
            disabled={syncBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-raised border border-subtle text-xs text-content hover:bg-surface-overlay transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncBusy ? 'animate-spin' : ''}`} />
            Sync
          </button>
        )}
        <button
          onClick={() => setGhOpen(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
            ghConnected
              ? 'bg-surface-raised border border-subtle text-content hover:bg-surface-overlay'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}
        >
          <Github className="w-3.5 h-3.5" />
          {ghConnected ? status?.github.login ?? 'Backup on' : 'Set up backup'}
        </button>
      </div>

      {!ghConnected && (
        <div className="flex items-center gap-2 px-5 py-2 border-b border-subtle bg-amber-500/10">
          <CloudOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-[11px] text-content-secondary">
            Everything here is saved on this computer only. Turn on online backup to keep a copy off the machine and
            open the same missions and areas on another computer.
          </span>
          <button
            onClick={() => setGhOpen(true)}
            className="ml-auto px-2 py-1 rounded-md text-[11px] font-medium bg-amber-500/20 text-amber-700 dark:text-amber-200 hover:brightness-110 transition-colors"
          >
            Set up backup
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <div className="w-72 border-r border-subtle flex flex-col overflow-y-auto">
          {/* Snapshot current vehicle */}
          <div className="p-3 border-b border-subtle">
            <button
              onClick={() => snapshotParams()}
              disabled={snapshotBusy || !isConnected || paramCount === 0}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors disabled:opacity-40"
              data-tip={!isConnected ? 'Connect a vehicle first' : paramCount === 0 ? 'Waiting for parameters' : undefined}
            >
              <Camera className="w-3.5 h-3.5" />
              <span className="truncate">
                {currentUnit ? `Snapshot ${currentUnit.name}` : 'Snapshot vehicle params'}
              </span>
            </button>
            {/* Manual override for when automatic vehicle matching guesses wrong */}
            {isConnected && units.length > 0 && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="text-[10px] text-content-tertiary shrink-0">Working on</span>
                <select
                  value={unitOverride ?? ''}
                  onChange={(e) => setUnitOverride(e.target.value || null)}
                  className={`flex-1 min-w-0 text-[10px] bg-surface-input border rounded px-1.5 py-1 text-content focus:outline-none ${
                    unitOverride ? 'border-blue-500/40' : 'border-subtle'
                  }`}
                  data-tip="Snapshots go to this vehicle. Auto detect uses the board id and profile."
                >
                  <option value="">Auto detect</option>
                  {units.map((u) => (
                    <option key={u.uid} value={u.uid}>{u.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Units */}
          <div className="px-3 pt-3">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-3.5 h-3.5 text-content-secondary" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-content-secondary">Units</span>
            </div>
            {units.length === 0 && !currentUnit && (
              <p className="text-[11px] text-content-tertiary pb-2">No snapshots yet.</p>
            )}
            <div className="flex flex-col gap-1 pb-2">
              {/* Connected vehicle without any snapshot yet: show it so the
                  user sees what "Snapshot" will act on, and let them link it
                  to an existing unit if it's really the same vehicle */}
              {currentUnit && !currentHasUnit && (
                <div className="px-2.5 py-2 rounded-lg border border-dashed border-emerald-500/40 bg-emerald-500/5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs text-content font-medium truncate">{currentUnit.name}</span>
                    {currentUnit.sitl && (
                      <span className="text-[9px] font-semibold px-1 rounded bg-amber-500/15 text-amber-500 border border-amber-500/25">
                        SITL
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-content-tertiary">connected now, no snapshots yet</div>
                  {units.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <select
                        value={linkTarget}
                        onChange={(e) => setLinkTarget(e.target.value)}
                        className="flex-1 min-w-0 text-[10px] bg-surface-input border border-subtle rounded px-1.5 py-1 text-content focus:outline-none"
                        data-tip="Already snapshotted this vehicle under another name? Link it so history continues there."
                      >
                        <option value="">Same vehicle as...</option>
                        {units.map((u) => (
                          <option key={u.uid} value={u.uid}>{u.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => linkTarget && linkUnit(linkTarget, currentUnit.uid)}
                        disabled={!linkTarget}
                        className="px-2 py-1 rounded text-[10px] bg-surface-raised border border-subtle text-content hover:bg-surface-overlay transition-colors disabled:opacity-40"
                      >
                        Link
                      </button>
                    </div>
                  )}
                </div>
              )}
              {units.map((u) => {
                const prefix = `units/${u.uid}`;
                const active = filterPrefix === prefix;
                const renaming = renamingUid === u.uid;
                return (
                  <div
                    key={u.uid}
                    onClick={() => { if (!renaming) setFilterPrefix(active ? null : prefix); }}
                    className={`group/unit text-left px-2.5 py-2 rounded-lg border transition-colors cursor-pointer ${
                      active
                        ? 'bg-blue-500/10 border-blue-500/30'
                        : 'bg-surface border-subtle hover:bg-surface-raised'
                    }`}
                  >
                    {renaming ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            setRenamingUid(null);
                            if (renameDraft.trim() && renameDraft.trim() !== u.name) {
                              await renameUnit(u.uid, renameDraft.trim());
                            }
                          } else if (e.key === 'Escape') {
                            setRenamingUid(null);
                          }
                        }}
                        onBlur={() => setRenamingUid(null)}
                        className="w-full text-xs bg-surface-input border border-blue-500/40 rounded px-1.5 py-0.5 text-content focus:outline-none"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {isCurrentUnit(u) && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"
                            data-tip="This vehicle is connected right now"
                          />
                        )}
                        <span className="text-xs text-content font-medium truncate">{u.name}</span>
                        {u.sitl && (
                          <span
                            className="text-[9px] font-semibold px-1 rounded bg-amber-500/15 text-amber-500 border border-amber-500/25"
                            data-tip="Simulator snapshots, kept separate from real aircraft"
                          >
                            SITL
                          </span>
                        )}
                        <div className="flex-1" />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingUid(u.uid);
                            setRenameDraft(u.name);
                          }}
                          className="opacity-0 group-hover/unit:opacity-100 text-content-tertiary hover:text-content transition-opacity"
                          data-tip="Rename"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <div className="text-[10px] text-content-tertiary">
                      {u.vehicleType ? `${u.vehicleType} - ` : ''}
                      {u.paramCount ? `${u.paramCount} params` : ''}
                      {u.lastSnapshotAt ? ` - ${timeAgo(u.lastSnapshotAt)}` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sites */}
          <div className="px-3 pt-2 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <MapIcon className="w-3.5 h-3.5 text-content-secondary" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-content-secondary">Sites</span>
            </div>
            <div className="flex flex-col gap-1 pb-2">
              {sites.map((s) => {
                const prefix = `sites/${s.site}`;
                const active = filterPrefix === prefix;
                return (
                  <button
                    key={s.site}
                    onClick={() => setFilterPrefix(active ? null : prefix)}
                    className={`text-left px-2.5 py-2 rounded-lg border transition-colors ${
                      active
                        ? 'bg-blue-500/10 border-blue-500/30'
                        : 'bg-surface border-subtle hover:bg-surface-raised'
                    }`}
                  >
                    <div className="text-xs text-content font-medium truncate">{s.site}</div>
                    <div className="text-[10px] text-content-tertiary">
                      {s.missions.length} mission{s.missions.length === 1 ? '' : 's'}
                      {s.hasBoundary ? ' - boundary' : ''}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Save mission / area to a site */}
            <div className="mt-1 flex flex-col gap-1.5">
              <input
                type="text"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="Site name"
                className="w-full text-[11px] bg-surface-input border border-subtle rounded-lg px-2.5 py-1.5 text-content placeholder:text-content-tertiary focus:outline-none focus:border-blue-500/40"
              />
              <input
                type="text"
                value={missionName}
                onChange={(e) => setMissionName(e.target.value)}
                placeholder="Mission name (for mission saves)"
                className="w-full text-[11px] bg-surface-input border border-subtle rounded-lg px-2.5 py-1.5 text-content placeholder:text-content-tertiary focus:outline-none focus:border-blue-500/40"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={() => snapshotMission(siteName.trim() || 'default', missionName.trim() || 'mission')}
                  disabled={snapshotBusy || !siteName.trim()}
                  className="flex-1 py-1.5 rounded-lg bg-surface-raised border border-subtle text-[11px] text-content hover:bg-surface-overlay transition-colors disabled:opacity-40"
                  data-tip="Save the currently planned mission into this site"
                >
                  Save mission
                </button>
                <button
                  onClick={() => snapshotArea(siteName.trim() || 'default')}
                  disabled={snapshotBusy || !siteName.trim()}
                  className="flex-1 py-1.5 rounded-lg bg-surface-raised border border-subtle text-[11px] text-content hover:bg-surface-overlay transition-colors disabled:opacity-40"
                  data-tip="Save the survey polygons on the map as this site's boundary"
                >
                  Save boundary
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main: diff, preview, or history */}
        {diff || diffLoading ? (
          diffLoading ? (
            <div className="flex-1 flex items-center justify-center text-xs text-content-secondary">Loading snapshot...</div>
          ) : (
            <DiffPanel />
          )
        ) : preview ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-subtle">
              <button
                onClick={() => setPreview(null)}
                className="text-[11px] text-content-secondary hover:text-content transition-colors"
              >
                Back to history
              </button>
              <span className="text-[11px] font-mono text-content-secondary truncate">{preview.title}</span>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-[11px] font-mono text-content-secondary whitespace-pre">
              {preview.content}
            </pre>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              <History className="w-3.5 h-3.5 text-content-secondary" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-content-secondary">
                {filterPrefix ? `History: ${filterPrefix}` : 'History'}
              </span>
              {filterPrefix && (
                <button
                  onClick={() => setFilterPrefix(null)}
                  className="text-[10px] text-content-tertiary hover:text-content transition-colors"
                >
                  clear filter
                </button>
              )}
            </div>
            {filteredHistory.length === 0 && filterPrefix && (
              <p className="px-4 py-6 text-xs text-content-tertiary">
                No saves here yet.
              </p>
            )}
            {filteredHistory.length === 0 && !filterPrefix && (
              <div className="max-w-md mx-auto mt-10 px-6">
                <h2 className="text-sm font-semibold text-content mb-1.5">Your drone's memory</h2>
                <p className="text-xs text-content-secondary leading-relaxed mb-5">
                  The vault keeps safe copies of your drone's settings, missions and survey areas,
                  so you can always see what changed and go back.
                </p>
                <div className="flex flex-col gap-4">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                      <Camera className="w-4 h-4 text-blue-500" />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-content">1. Save a copy</div>
                      <p className="text-[11px] text-content-secondary leading-relaxed">
                        Connect your drone and press "Snapshot vehicle params". Every setting is saved.
                        Do it before and after you change anything.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                      <History className="w-4 h-4 text-blue-500" />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-content">2. Look back anytime</div>
                      <p className="text-[11px] text-content-secondary leading-relaxed">
                        Flying worse after a change? Open an old copy, see exactly which settings
                        are different, and put them back with one click.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                      <Github className="w-4 h-4 text-blue-500" />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-content">3. Keep it safe online (optional)</div>
                      <p className="text-[11px] text-content-secondary leading-relaxed">
                        Connect a free GitHub account and your copies are backed up to the cloud
                        and shared with your other computers.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="flex flex-col px-3 pb-4">
              {filteredHistory.map((entry) => {
                const unitUid = entry.files.find((f) => f.startsWith('units/'))?.split('/')[1];
                const unit = unitUid ? unitByUid.get(unitUid) : undefined;
                const site = entry.files.find((f) => f.startsWith('sites/'))?.split('/')[1];
                return (
                <button
                  key={entry.oid}
                  onClick={() => openCommit(entry)}
                  className="group text-left px-3 py-2.5 rounded-lg hover:bg-surface-raised transition-colors border-b border-subtle last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    {(unit || unitUid) && (
                      <span className="flex items-center gap-1 shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">
                        {(unit ? isCurrentUnit(unit) : currentUnit?.uid === unitUid) && (
                          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                        )}
                        {unit?.name ?? unitUid}
                      </span>
                    )}
                    {!unitUid && site && (
                      <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-500 border border-teal-500/20">
                        {site}
                      </span>
                    )}
                    <span className="text-xs text-content truncate">{entry.message}</span>
                    <div className="flex-1" />
                    <span className="text-[10px] text-content-tertiary shrink-0">{timeAgo(entry.timestamp)}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-content-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {entry.files.length > 0 && (
                    <div className="text-[10px] font-mono text-content-tertiary truncate mt-0.5">
                      {entry.files.join(', ')}
                    </div>
                  )}
                </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {ghOpen && <GithubDialog onClose={() => setGhOpen(false)} />}
    </div>
  );
}
