import { useState, useEffect } from 'react';
import { useSigningStore, initSigningListener } from '../../stores/signing-store';
import { useConnectionStore } from '../../stores/connection-store';

export function SigningSection() {
  const { connectionState } = useConnectionStore();
  const {
    enabled,
    hasKey,
    sentToFc,
    keyFingerprint,
    keyBase64,
    loading,
    error,
    setKey,
    enable,
    disable,
    sendToFc,
    removeKey,
  } = useSigningStore();

  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  useEffect(() => {
    const unsub = initSigningListener();
    return unsub;
  }, []);

  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(null), 3000);
      return () => clearTimeout(t);
    }
  }, [successMsg]);

  useEffect(() => {
    if (localError) {
      const t = setTimeout(() => setLocalError(null), 5000);
      return () => clearTimeout(t);
    }
  }, [localError]);

  if (!connectionState.isConnected) return null;

  const isV1Only = connectionState.mavlinkVersion === 1;

  const handleSetKey = async () => {
    if (!passphrase.trim()) {
      setLocalError('Enter a passphrase');
      return;
    }
    setLocalError(null);
    const ok = await setKey(passphrase.trim());
    if (ok) {
      setPassphrase('');
      setSuccessMsg('Signing key saved');
    }
  };

  const handleSendToFc = async () => {
    setLocalError(null);
    const ok = await sendToFc();
    if (ok) setSuccessMsg('Key sent to FC and signing enabled');
  };

  const handleToggleSigning = async () => {
    setLocalError(null);
    if (enabled) {
      await disable();
      setSuccessMsg('Signing paused');
    } else {
      const ok = await enable();
      if (ok) setSuccessMsg('Signing resumed');
    }
  };

  const handleDisableSigning = async () => {
    setLocalError(null);
    setConfirmDisable(false);
    const result = await removeKey();
    setPassphrase('');
    setSuccessMsg('Signing disabled on FC and key removed');
  };

  const fullyConfigured = hasKey && sentToFc;

  return (
    <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
          <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-medium text-white">MAVLink Signing</h3>
          <p className="text-xs text-zinc-500">
            Prevent unauthorized access to your vehicle
          </p>
        </div>
        <div className="ml-auto">
          {isV1Only ? (
            <span className="text-[10px] font-medium text-zinc-500 bg-zinc-500/10 px-2 py-1 rounded-full">
              Unavailable
            </span>
          ) : fullyConfigured && enabled ? (
            <span className="text-[10px] font-medium text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full">
              Active
            </span>
          ) : fullyConfigured ? (
            <span className="text-[10px] font-medium text-amber-400 bg-amber-400/10 px-2 py-1 rounded-full">
              Paused
            </span>
          ) : hasKey ? (
            <span className="text-[10px] font-medium text-amber-400 bg-amber-400/10 px-2 py-1 rounded-full">
              Key Set
            </span>
          ) : (
            <span className="text-[10px] font-medium text-zinc-500 bg-zinc-500/10 px-2 py-1 rounded-full">
              Not Configured
            </span>
          )}
        </div>
      </div>

      {isV1Only && (
        <div className="rounded-lg border border-zinc-700/30 bg-zinc-800/30 px-3 py-2.5">
          <p className="text-xs text-zinc-400">
            This board communicates using MAVLink v1 which does not support packet signing.
            Signing requires a MAVLink v2 capable flight controller.
          </p>
        </div>
      )}

      {/* Setup steps */}
      {!isV1Only && (<>
      <div className="space-y-3">
        {/* Step 1: Set passphrase */}
        <div className={`rounded-lg border p-3 ${hasKey ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-zinc-700/50 bg-zinc-800/30'}`}>
          <div className="flex items-center gap-2.5 mb-2">
            <StepIndicator step={1} done={hasKey} active={!hasKey} />
            <span className="text-xs font-medium text-zinc-300">Set signing passphrase</span>
          </div>
          <div className="ml-7">
            {hasKey && keyBase64 && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-zinc-500">Key:</span>
                <code className="text-[10px] font-mono text-zinc-400 bg-zinc-800/80 px-1.5 py-0.5 rounded max-w-[220px] truncate" title={keyBase64}>
                  {keyBase64}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(keyBase64);
                    setKeyCopied(true);
                    setTimeout(() => setKeyCopied(false), 2000);
                  }}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                  title="Copy key (Base64 - same format as Mission Planner)"
                >
                  {keyCopied ? (
                    <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
            )}
            <p className="text-xs text-zinc-500 mb-2">
              {hasKey
                ? 'Enter a new passphrase to change it.'
                : 'Choose a passphrase shared between this GCS and your flight controller. Use the same passphrase in Mission Planner or any other GCS.'}
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPassphrase ? 'text' : 'password'}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSetKey(); }}
                  placeholder={hasKey ? 'New passphrase...' : 'Enter passphrase...'}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                  disabled={loading}
                />
                <button
                  onClick={() => setShowPassphrase(!showPassphrase)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  type="button"
                >
                  {showPassphrase ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              <button
                onClick={handleSetKey}
                disabled={loading || !passphrase.trim()}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs rounded-lg transition-colors"
              >
                {hasKey ? 'Update' : 'Set Key'}
              </button>
            </div>
          </div>
        </div>

        {/* Step 2: Send to FC (auto-enables signing) */}
        <div className={`rounded-lg border p-3 ${sentToFc ? 'border-emerald-500/20 bg-emerald-500/5' : !hasKey ? 'border-zinc-800/30 bg-zinc-800/10 opacity-40' : 'border-zinc-700/50 bg-zinc-800/30'}`}>
          <div className="flex items-center gap-2.5">
            <StepIndicator step={2} done={sentToFc} active={hasKey && !sentToFc} />
            <span className="text-xs font-medium text-zinc-300">Activate on flight controller</span>
            {hasKey && (
              <button
                onClick={handleSendToFc}
                disabled={loading || !hasKey}
                className="ml-auto px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-[11px] rounded-lg transition-colors"
              >
                {sentToFc ? 'Re-send' : 'Send to FC'}
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-500 ml-7 mt-1">
            {sentToFc
              ? 'Both GCS and flight controller share the signing key. Signing is active.'
              : 'Sends the key to the FC and enables signing. Both sides must share the same key.'}
          </p>
        </div>
      </div>

      {/* Controls (only shown when fully configured) */}
      {fullyConfigured && (
        <div className="space-y-2">
          {/* Pause/resume toggle */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-700/30 bg-zinc-800/30 px-3 py-2.5">
            <div>
              <span className="text-xs font-medium text-zinc-300">Packet signing</span>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                {enabled ? 'All outgoing packets are signed with SHA-256' : 'Signing is paused. Outgoing packets are unsigned.'}
              </p>
            </div>
            <button
              onClick={handleToggleSigning}
              disabled={loading}
              className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${enabled ? 'bg-emerald-500' : 'bg-zinc-700'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* FC signing verification */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/20">
            <div className={`w-2 h-2 rounded-full ${connectionState.fcSigning ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            <span className="text-[10px] text-zinc-500">
              {connectionState.fcSigning
                ? 'Vehicle is sending signed packets'
                : 'Waiting for signed packets from vehicle...'}
            </span>
          </div>

          {/* Disable signing completely */}
          {confirmDisable ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
              <p className="text-xs text-zinc-300 mb-2">
                This will disable signing on the flight controller and remove your local key.
                Any GCS will be able to connect without a key.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDisableSigning}
                  disabled={loading}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
                >
                  Confirm Disable
                </button>
                <button
                  onClick={() => setConfirmDisable(false)}
                  className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDisable(true)}
              disabled={loading}
              className="w-full px-3 py-2 rounded-lg border border-zinc-700/30 bg-zinc-800/30 text-xs text-zinc-500 hover:text-red-400 hover:border-red-500/30 transition-colors disabled:opacity-50"
            >
              Disable signing and remove key
            </button>
          )}
        </div>
      )}

      </>)}

      {/* Messages */}
      {(error || localError) && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <p className="text-xs text-red-400">{error || localError}</p>
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          <p className="text-xs text-emerald-400">{successMsg}</p>
        </div>
      )}
    </div>
  );
}

function StepIndicator({ step, done, active }: { step: number; done: boolean; active: boolean }) {
  if (done) {
    return (
      <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
        <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  return (
    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${active ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-700/50 text-zinc-600'}`}>
      {step}
    </div>
  );
}
