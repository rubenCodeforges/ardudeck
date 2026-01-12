/**
 * Report Bug View
 *
 * UI for creating encrypted bug reports that can be shared with the dev team.
 * Collects app logs, system info, and optionally board configuration.
 */

import { useState, useEffect } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import { useParameterStore } from '../../stores/parameter-store';

interface ProgressState {
  stage: string;
  message: string;
}

export default function ReportBugView() {
  const { connectionState } = useConnectionStore();
  const { parameters } = useParameterStore();

  const [description, setDescription] = useState('');
  const [includeLogs, setIncludeLogs] = useState(true);
  const [includeBoardDump, setIncludeBoardDump] = useState(false);
  const [logHours, setLogHours] = useState(24);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [encryptionInfo, setEncryptionInfo] = useState<{
    isPlaceholderKey: boolean;
    keyVersion: number;
    formatVersion: number;
  } | null>(null);
  const [showWhatWeCollect, setShowWhatWeCollect] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);

  // Check if board is connected and what type
  const isConnected = connectionState.isConnected;
  const isMspBoard = connectionState.protocol === 'msp';
  const isMavlinkBoard = connectionState.protocol === 'mavlink';
  const boardInfo = isMspBoard
    ? `${connectionState.fcVariant} ${connectionState.fcVersion}`
    : isMavlinkBoard
      ? `${connectionState.autopilot} ${connectionState.vehicleType}`
      : 'Not connected';

  // Fetch encryption info on mount
  useEffect(() => {
    window.electronAPI.reportGetEncryptionInfo().then(setEncryptionInfo);
  }, []);

  // Listen for progress updates
  useEffect(() => {
    const cleanup = window.electronAPI.onReportProgress((p) => {
      setProgress(p);
    });
    return cleanup;
  }, []);

  const handleGenerateReport = async () => {
    if (!hasConsented) {
      setError('Please acknowledge the data collection consent');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setSuccess(null);
    setProgress(null);

    try {
      let boardDump: unknown | null = null;

      // Collect board dump if requested and connected
      if (includeBoardDump && isConnected) {
        if (isMspBoard) {
          setProgress({ stage: 'board_dump', message: 'Collecting board configuration (CLI mode)...' });
          const result = await window.electronAPI.reportCollectMspDump();
          if (!result.success) {
            throw new Error(result.error || 'Failed to collect board dump');
          }
          boardDump = result.dump;
        } else if (isMavlinkBoard) {
          setProgress({ stage: 'board_dump', message: 'Collecting board configuration (MAVLink)...' });
          const result = await window.electronAPI.reportCollectMavlinkDump();
          if (result.success && result.dump) {
            // Fill in parameters from the parameter store
            const mavlinkDump = result.dump as {
              type: 'mavlink';
              parameters: Record<string, number>;
              [key: string]: unknown;
            };
            mavlinkDump.parameters = Object.fromEntries(
              Array.from(parameters.entries()).map(([k, v]) => [k, v.value])
            );
            boardDump = mavlinkDump;
          }
        }
      }

      // Save the report
      setProgress({ stage: 'saving', message: 'Creating encrypted report...' });
      const result = await window.electronAPI.reportSave(
        description || 'No description provided',
        boardDump,
        includeLogs ? logHours : 0
      );

      if (result.success) {
        setSuccess(`Report saved to: ${result.filePath}`);
        setDescription('');
        setHasConsented(false);
      } else {
        throw new Error(result.error || 'Failed to save report');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          {/* Bug icon */}
          <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Report a Bug</h1>
            <p className="text-xs text-zinc-500">Create an encrypted report to share with developers</p>
          </div>
        </div>

        {/* Connection status */}
        <div className="text-sm text-zinc-400">
          {isConnected ? (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              {boardInfo}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-zinc-600" />
              Not connected
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 space-y-6 max-w-2xl">
        {/* Placeholder key warning */}
        {encryptionInfo?.isPlaceholderKey && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-400 text-sm">
            <span className="font-semibold">Development Mode:</span> Using placeholder encryption key.
            Reports created now cannot be decrypted by the production team.
          </div>
        )}

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            Describe the issue
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What happened? What were you trying to do? Include any error messages you saw..."
            className="w-full h-32 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 resize-none"
          />
        </div>

        {/* Options */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-zinc-300">What to include</h3>

          {/* Include logs */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeLogs}
              onChange={(e) => setIncludeLogs(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500/50"
            />
            <div>
              <span className="text-zinc-200">App logs</span>
              <p className="text-xs text-zinc-500">
                Includes error messages and diagnostic information from the last{' '}
                <select
                  value={logHours}
                  onChange={(e) => setLogHours(Number(e.target.value))}
                  className="bg-zinc-800 border border-zinc-700 rounded px-1 text-zinc-300"
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value={1}>1 hour</option>
                  <option value={6}>6 hours</option>
                  <option value={24}>24 hours</option>
                  <option value={72}>3 days</option>
                  <option value={168}>7 days</option>
                </select>
              </p>
            </div>
          </label>

          {/* Include board dump */}
          <label className={`flex items-start gap-3 ${!isConnected ? 'opacity-50' : 'cursor-pointer'}`}>
            <input
              type="checkbox"
              checked={includeBoardDump}
              onChange={(e) => setIncludeBoardDump(e.target.checked)}
              disabled={!isConnected}
              className="mt-1 w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500/50 disabled:opacity-50"
            />
            <div>
              <span className="text-zinc-200">Board configuration</span>
              <p className="text-xs text-zinc-500">
                {!isConnected ? (
                  'Connect to a board to include configuration'
                ) : isMspBoard ? (
                  <span className="text-yellow-400">
                    Will enter CLI mode and reboot the board after collection
                  </span>
                ) : (
                  'Includes all parameters and system status'
                )}
              </p>
            </div>
          </label>
        </div>

        {/* What we collect (expandable) */}
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowWhatWeCollect(!showWhatWeCollect)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800/50 transition-colors"
          >
            <span>What data will be collected?</span>
            <svg
              className={`w-4 h-4 transition-transform ${showWhatWeCollect ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showWhatWeCollect && (
            <div className="px-4 pb-4 text-xs text-zinc-500 space-y-2 border-t border-zinc-800 pt-3">
              <p><strong className="text-zinc-400">Included:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Error messages and stack traces</li>
                <li>App version and session info</li>
                <li>Operating system and architecture</li>
                <li>Electron/Node.js versions</li>
                <li>MAVLink/MSP protocol messages (no personal info)</li>
                <li>Board configuration (if selected)</li>
                <li>Your description of the issue</li>
              </ul>
              <p className="mt-3"><strong className="text-zinc-400">Privacy protected:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Home directory paths are sanitized</li>
                <li>GPS coordinates are redacted</li>
                <li>Email addresses are redacted</li>
                <li>IP addresses are redacted</li>
                <li>Passwords and credentials are redacted</li>
              </ul>
              <p className="mt-3"><strong className="text-zinc-400">Encryption:</strong></p>
              <p className="ml-2">
                The report is securely encrypted and can only be decrypted by the ArduDeck development team.
              </p>
            </div>
          )}
        </div>

        {/* Consent */}
        <label className="flex items-start gap-3 cursor-pointer p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
          <input
            type="checkbox"
            checked={hasConsented}
            onChange={(e) => setHasConsented(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500/50"
          />
          <div className="text-sm text-zinc-300">
            I understand that the collected data will be encrypted and shared with the ArduDeck development team
            for debugging purposes. No personal information beyond what is listed above will be included.
          </div>
        </label>

        {/* Progress */}
        {progress && (
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400 text-sm flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {progress.message}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
            {success}
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerateReport}
          disabled={isGenerating || !hasConsented}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isGenerating ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Generating Report...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Generate & Save Report
            </>
          )}
        </button>

        {/* Info about the file */}
        <p className="text-xs text-zinc-500 text-center">
          The report will be saved as a <code className="bg-zinc-800 px-1 rounded">.deckreport</code> file
          that you can share with the development team.
        </p>
      </div>
    </div>
  );
}
