// Backup setup (GitHub or any git host). Host-owned so credentials never pass through a cargo.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Github, X, Check } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { useFleetRepoStore } from '../../stores/fleet-repo-store';

function ExtLink({ href, children }: { href: string; children?: React.ReactNode }) {
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
  const { t } = useTranslation();
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
      setError(res?.error ?? t('vault:githubDialog.errReach'));
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
        setError(poll.error ?? t('vault:githubDialog.errAuth'));
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
      setError(res?.error ?? t('vault:githubDialog.errToken'));
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
      setError(res?.error ?? t('vault:githubDialog.errList'));
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
      setError(res?.error ?? t('vault:githubDialog.errUse'));
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
      setError(res?.error ?? t('vault:githubDialog.errCreate'));
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
      setError(res?.error ?? t('vault:githubDialog.errSave'));
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
            <h2 className="text-sm font-semibold text-content">{t('vault:githubDialog.title')}</h2>
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
                {t('vault:githubDialog.intro')}
              </p>

              {/* Option 1: sign in */}
              <div className="rounded-xl border border-subtle p-3.5">
                <div className="text-xs font-medium text-content mb-1">{t('vault:githubDialog.option1Title')}</div>
                <p className="text-[10px] text-content-tertiary leading-relaxed mb-2.5">
                  {t('vault:githubDialog.option1Body')}
                </p>
                <button
                  onClick={startDeviceFlow}
                  disabled={busy}
                  className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {t('vault:githubDialog.connectAccount')}
                </button>
                <p className="text-[10px] text-content-tertiary mt-2">
                  <Trans
                    i18nKey="vault:githubDialog.noAccount"
                    components={{ link: <ExtLink href="https://github.com/signup" /> }}
                  />
                </p>
              </div>

              {/* Option 2: token */}
              <div className="rounded-xl border border-subtle p-3.5">
                <div className="text-xs font-medium text-content mb-1">{t('vault:githubDialog.option2Title')}</div>
                <p className="text-[10px] text-content-tertiary leading-relaxed mb-2.5">
                  <Trans
                    i18nKey="vault:githubDialog.option2Body"
                    components={{
                      tokenLink: <ExtLink href="https://github.com/settings/personal-access-tokens/new" />,
                      guideLink: <ExtLink href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token" />,
                    }}
                  />
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={pat}
                    onChange={(e) => setPat(e.target.value)}
                    placeholder={t('vault:githubDialog.patPlaceholder')}
                    className="flex-1 text-xs bg-surface-input border border-subtle rounded-lg px-3 py-2 text-content placeholder:text-content-tertiary focus:outline-none focus:border-blue-500/40"
                  />
                  <button
                    onClick={submitPat}
                    disabled={busy || !pat.trim()}
                    className="px-3 py-2 rounded-lg bg-surface-raised border border-subtle text-xs text-content hover:bg-surface-overlay transition-colors disabled:opacity-50"
                  >
                    {t('vault:githubDialog.use')}
                  </button>
                </div>
              </div>

              {/* Option 3: bring your own repo (any git host) */}
              <button
                onClick={() => setShowCustom((v) => !v)}
                className="self-start text-[11px] text-content-secondary hover:text-content transition-colors"
              >
                {showCustom ? t('vault:githubDialog.hideAdvanced') : t('vault:githubDialog.showAdvanced')}
              </button>
              {showCustom && (
                <div className="rounded-xl border border-subtle p-3.5 flex flex-col gap-2">
                  <p className="text-[10px] text-content-tertiary leading-relaxed">
                    <Trans
                      i18nKey="vault:githubDialog.customBody"
                      components={{ link: <ExtLink href="https://github.com/new" /> }}
                    />
                  </p>
                  <input
                    type="text"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder="https://host/you/repo.git" /* i18n-exempt */
                    className="w-full text-xs bg-surface-input border border-subtle rounded-lg px-3 py-2 text-content placeholder:text-content-tertiary focus:outline-none focus:border-blue-500/40"
                  />
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={customToken}
                      onChange={(e) => setCustomToken(e.target.value)}
                      placeholder={t('vault:githubDialog.tokenPlaceholder')}
                      className="flex-1 text-xs bg-surface-input border border-subtle rounded-lg px-3 py-2 text-content placeholder:text-content-tertiary focus:outline-none focus:border-blue-500/40"
                    />
                    <input
                      type="text"
                      value={customUser}
                      onChange={(e) => setCustomUser(e.target.value)}
                      placeholder={t('vault:githubDialog.usernamePlaceholder')}
                      className="w-36 text-xs bg-surface-input border border-subtle rounded-lg px-3 py-2 text-content placeholder:text-content-tertiary focus:outline-none focus:border-blue-500/40"
                    />
                  </div>
                  <button
                    onClick={submitCustom}
                    disabled={busy || !customUrl.trim() || !customToken.trim()}
                    className="self-end px-3 py-2 rounded-lg bg-surface-raised border border-subtle text-xs text-content hover:bg-surface-overlay transition-colors disabled:opacity-50"
                  >
                    {t('vault:githubDialog.useThisRepo')}
                  </button>
                </div>
              )}
            </>
          )}

          {device && (
            <div className="flex flex-col items-center gap-3 py-2">
              <p className="text-[11px] text-content-secondary">{t('vault:githubDialog.enterCode', { url: device.verificationUri.replace('https://', '') })}</p>
              <div className="text-2xl font-bold tracking-[0.3em] text-content bg-surface-raised border border-subtle rounded-xl px-5 py-3 font-mono">
                {device.userCode}
              </div>
              <p className="text-[10px] text-content-tertiary">{t('vault:githubDialog.waitingAuth')}</p>
            </div>
          )}

          {connected && status?.github.mode === 'custom' && (
            <>
              <div className="flex items-center gap-2 text-xs text-content">
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                {t('vault:githubDialog.usingYourRepo')}
              </div>
              <p className="text-[10px] font-mono text-content-secondary break-all">{status.github.repo}</p>
              <button
                onClick={disconnect}
                className="self-start text-[11px] text-red-500 hover:text-red-400 transition-colors"
              >
                {t('common:disconnect')}
              </button>
            </>
          )}

          {connected && status?.github.mode !== 'custom' && (
            <>
              <div className="flex items-center gap-2 text-xs text-content">
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <Trans
                  i18nKey="vault:githubDialog.connectedAs"
                  values={{ login: status?.github.login }}
                  components={{ b: <span className="font-semibold" /> }}
                />
              </div>
              <div>
                <label className="text-[10px] text-content-secondary block mb-1">{t('vault:githubDialog.repoLabel')}</label>
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
                    {status?.github.repo ? t('vault:githubDialog.update') : t('vault:githubDialog.create')}
                  </button>
                </div>
                {status?.github.repo && (
                  <p className="text-[10px] text-content-tertiary mt-1.5">
                    {t('vault:githubDialog.usingRepo', { repo: `${status.github.login}/${status.github.repo}` })}
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
                  {t('vault:githubDialog.pickExisting')}
                </button>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-content-secondary">
                    {t('vault:githubDialog.existingLabel')}
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={pickedRepo}
                      onChange={(e) => setPickedRepo(e.target.value)}
                      className="flex-1 text-xs bg-surface-input border border-subtle rounded-lg px-2 py-2 text-content focus:outline-none focus:border-blue-500/40"
                    >
                      {repoList.map((r) => (
                        <option key={r.fullName} value={r.fullName}>
                          {r.fullName}{r.private ? '' : t('vault:githubDialog.publicSuffix')}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={useExistingRepo}
                      disabled={busy || !pickedRepo}
                      className="px-3 py-2 rounded-lg bg-surface-raised border border-subtle text-xs text-content hover:bg-surface-overlay transition-colors disabled:opacity-50"
                    >
                      {t('vault:githubDialog.use')}
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={disconnect}
                className="self-start text-[11px] text-red-500 hover:text-red-400 transition-colors"
              >
                {t('vault:githubDialog.disconnectAccount')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Mounted once in the app; opened from the vault cargo via host.vault.openBackupSetup(). */
export function VaultBackupDialog() {
  const open = useFleetRepoStore((s) => s.backupSetupOpen);
  const setOpen = useFleetRepoStore((s) => s.setBackupSetupOpen);
  if (!open) return null;
  return <GithubDialog onClose={() => setOpen(false)} />;
}
