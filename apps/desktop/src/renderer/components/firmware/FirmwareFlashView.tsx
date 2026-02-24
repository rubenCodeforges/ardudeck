import { useEffect, useMemo, useRef, useState } from 'react';
import { useFirmwareStore, type BoardInfo } from '../../stores/firmware-store';
import { useConnectionStore } from '../../stores/connection-store';
import type { FirmwareVehicleType, FirmwareSource } from '../../../shared/firmware-types';
import { FIRMWARE_SOURCE_NAMES, KNOWN_BOARDS } from '../../../shared/firmware-types';
import { BoardPicker } from './BoardPicker';
import { BootPadWizard } from './BootPadWizard';

/**
 * Get suggested boards based on detected MCU type
 */
function getSuggestedBoards(mcuType: string): BoardInfo[] {
  const suggested: BoardInfo[] = [];
  const mcuFamily = mcuType.replace('STM32', '').split('/')[0]!; // e.g., "F405" from "STM32F405/407"

  for (const [key, board] of Object.entries(KNOWN_BOARDS)) {
    if (board.mcuType?.includes(mcuFamily) && !board.inBootloader && board.boardId !== 'unknown') {
      suggested.push({
        id: board.boardId || key,
        name: board.name || 'Unknown',
        category: getCategoryFromBoard(board.name || ''),
        isPopular: isPopularBoard(board.name || ''),
      });
    }
  }

  return suggested;
}

/**
 * Determine category from board name
 */
function getCategoryFromBoard(name: string): string {
  if (name.includes('Cube')) return 'Cube';
  if (name.includes('Pixhawk')) return 'Pixhawk';
  if (name.includes('SpeedyBee')) return 'SpeedyBee';
  if (name.includes('Matek')) return 'Matek';
  if (name.includes('Kakute')) return 'Holybro';
  if (name.includes('APM')) return 'Legacy (AVR)';
  return 'Other';
}

/**
 * Check if board is a popular choice
 */
function isPopularBoard(name: string): boolean {
  const popular = ['CubeOrange', 'CubeBlack', 'Pixhawk 4', 'Pixhawk 6', 'Matek F405', 'Matek H743'];
  return popular.some((p) => name.includes(p));
}

/**
 * Suggested boards component - shows when MCU is detected via bootloader
 */
function SuggestedBoards({
  mcuType,
  onSelectBoard,
  disabled,
}: {
  mcuType: string;
  onSelectBoard: (board: BoardInfo) => void;
  disabled?: boolean;
}) {
  const suggested = useMemo(() => getSuggestedBoards(mcuType), [mcuType]);

  if (suggested.length === 0) {
    return (
      <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
        <div className="flex items-center gap-2 text-amber-400 text-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span>
            Detected {mcuType} but no known boards in database. Please select manually.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 bg-cyan-500/10 rounded-lg border border-cyan-500/30">
      <div className="text-cyan-400 text-sm mb-2 flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>
          Detected {mcuType} — select your board:
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggested.map((board) => (
          <button
            key={board.id}
            onClick={() => onSelectBoard(board)}
            disabled={disabled}
            className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-cyan-500/50 rounded text-sm text-zinc-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {board.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Serial port picker component - for manual port selection and STM32 probing
 */
function SerialPortPicker({
  ports,
  isLoading,
  isProbing,
  onRefresh,
  onProbe,
  disabled,
}: {
  ports: Array<{ path: string; manufacturer?: string; vendorId?: string; productId?: string }>;
  isLoading: boolean;
  isProbing: boolean;
  onRefresh: () => void;
  onProbe: (port: string) => void;
  disabled?: boolean;
}) {
  // Load ports on mount
  useEffect(() => {
    onRefresh();
  }, []);

  return (
    <div className="mb-4 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
      <div className="flex items-center justify-between mb-3">
        <span className="text-zinc-400 text-sm font-medium">Serial Ports</span>
        <button
          onClick={onRefresh}
          disabled={isLoading || disabled}
          className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-700 hover:bg-zinc-600 rounded transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Scanning...' : 'Refresh'}
        </button>
      </div>

      {ports.length === 0 ? (
        <div className="text-zinc-500 text-sm">
          {isLoading ? 'Scanning for ports...' : 'No serial ports found'}
        </div>
      ) : (
        <div className="space-y-2">
          {ports.map((port) => (
            <div
              key={port.path}
              className="flex items-center justify-between p-2 bg-zinc-900 rounded border border-zinc-700"
            >
              <div className="flex-1 min-w-0">
                <div className="text-zinc-200 text-sm font-medium">{port.path}</div>
                {port.manufacturer && (
                  <div className="text-zinc-500 text-xs truncate">{port.manufacturer}</div>
                )}
              </div>
              <button
                onClick={() => onProbe(port.path)}
                disabled={isProbing || disabled}
                className="ml-2 px-2.5 py-1.5 text-xs bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded transition-colors flex items-center gap-1.5"
              >
                {isProbing ? (
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                )}
                Probe STM32
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 text-zinc-600 text-xs">
        Probe will attempt to detect STM32 chip via bootloader
      </div>
    </div>
  );
}

/**
 * Pre-flash checklist for bootloader mode
 * Shows instructions and confirmation before flashing
 */
function BootloaderChecklist({
  canFlash,
  onReady,
}: {
  canFlash: boolean;
  onReady: () => void;
}) {
  const [jumperRemoved, setJumperRemoved] = useState(false);
  const [boardSelected, setBoardSelected] = useState(false);

  const allChecked = jumperRemoved && boardSelected;

  return (
    <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
      <div className="flex items-center gap-2 text-amber-400 font-medium mb-3">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Board in Bootloader Mode
      </div>

      <p className="text-zinc-400 text-sm mb-4">
        Your board is ready for flashing. Complete this checklist before proceeding:
      </p>

      <div className="space-y-3 mb-4">
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={boardSelected}
            onChange={(e) => setBoardSelected(e.target.checked)}
            className="mt-0.5 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
          />
          <div>
            <span className="text-zinc-300 group-hover:text-white transition-colors">
              I have selected the correct board from the dropdown
            </span>
            <p className="text-zinc-500 text-xs mt-0.5">
              In bootloader mode we can only detect the chip (e.g., STM32F303), not the board model
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={jumperRemoved}
            onChange={(e) => setJumperRemoved(e.target.checked)}
            className="mt-0.5 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
          />
          <div>
            <span className="text-zinc-300 group-hover:text-white transition-colors">
              I have removed the boot jumper / released the boot pads
            </span>
            <p className="text-zinc-500 text-xs mt-0.5">
              The board will reboot after flashing. Remove the jumper so it boots into new firmware.
            </p>
          </div>
        </label>
      </div>

      {/* Recovery reassurance */}
      <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <div className="flex items-start gap-2">
          <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <div>
            <p className="text-xs text-blue-200/80">
              <strong className="text-blue-300">Recovery is always possible!</strong> If the new firmware doesn't work,
              put the board back in bootloader mode (boot pads/button) and flash again. You can always return to any firmware.
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={onReady}
        disabled={!canFlash || !allChecked}
        className={`
          w-full px-4 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2
          ${canFlash && allChecked
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
            : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
          }
        `}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        {allChecked ? 'Start Flashing' : 'Complete checklist to continue'}
      </button>
    </div>
  );
}

// Vehicle icons (compact versions)
const VEHICLE_ICONS: Record<FirmwareVehicleType, React.ReactNode> = {
  copter: (
    <svg viewBox="0 0 32 32" className="w-full h-full" fill="currentColor">
      <path d="M7,12a5,5,0,1,1,5-5H10a3,3,0,1,0-3,3Z" />
      <path d="M25,12V10a3,3,0,1,0-3-3H20a5,5,0,1,1,5,5Z" />
      <path d="M7,30A5,5,0,0,1,7,20v2a3,3,0,1,0,3,3h2A5.0055,5.0055,0,0,1,7,30Z" />
      <path d="M25,30a5.0055,5.0055,0,0,1-5-5h2a3,3,0,1,0,3-3V20a5,5,0,0,1,0,10Z" />
      <path d="M20,18.5859V13.4141L25.707,7.707a1,1,0,1,0-1.414-1.414l-4.4995,4.5a3.9729,3.9729,0,0,0-7.587,0L7.707,6.293a.9994.9994,0,0,0-1.414,0h0a.9994.9994,0,0,0,0,1.414L12,13.4141v5.1718L6.293,24.293a.9994.9994,0,0,0,0,1.414h0a.9994.9994,0,0,0,1.414,0l4.5-4.5a3.9729,3.9729,0,0,0,7.587,0l4.4995,4.5a1,1,0,0,0,1.414-1.414ZM18,20a2,2,0,0,1-4,0V12a2,2,0,0,1,4,0Z" />
    </svg>
  ),
  plane: (
    <svg viewBox="0 0 16 16" className="w-full h-full">
      <g transform="rotate(-90 8 8)">
        <path d="M9.333333333333332 5.964913333333333 14.666666666666666 9.333333333333332v1.3333333333333333l-5.333333333333333 -1.6842v3.5730666666666666L11.333333333333332 13.666666666666666V14.666666666666666l-3 -0.6666666666666666L5.333333333333333 14.666666666666666v-1l2 -1.1111333333333333v-3.5730666666666666L2 10.666666666666666v-1.3333333333333333l5.333333333333333 -3.3684199999999995V2.333333333333333c0 -0.5522866666666666 0.4477333333333333 -1 1 -1s1 0.4477133333333333 1 1v3.63158Z" fill="currentColor" />
      </g>
    </svg>
  ),
  vtol: (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <ellipse cx="50" cy="50" rx="25" ry="6" fill="currentColor" opacity="0.9" />
      <rect x="25" y="45" width="50" height="10" rx="2" fill="currentColor" opacity="0.7" />
      <circle cx="25" cy="35" r="6" fill="currentColor" opacity="0.6" />
      <circle cx="75" cy="35" r="6" fill="currentColor" opacity="0.6" />
      <circle cx="25" cy="65" r="6" fill="currentColor" opacity="0.6" />
      <circle cx="75" cy="65" r="6" fill="currentColor" opacity="0.6" />
      <path d="M75 50 L90 45 L90 55 Z" fill="currentColor" opacity="0.7" />
    </svg>
  ),
  rover: (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect x="20" y="35" width="60" height="30" rx="5" fill="currentColor" opacity="0.9" />
      <circle cx="30" cy="70" r="10" fill="currentColor" opacity="0.7" />
      <circle cx="70" cy="70" r="10" fill="currentColor" opacity="0.7" />
      <line x1="70" y1="35" x2="75" y2="20" stroke="currentColor" strokeWidth="2" />
      <circle cx="75" cy="18" r="3" fill="currentColor" />
    </svg>
  ),
  boat: (
    <svg viewBox="0 100 475 270" className="w-full h-full" fill="currentColor">
      <path d="M474.057,253.807c-1.334-2.341-3.821-3.788-6.517-3.788H344.527l-31.122-61.4c-0.238-0.471-0.526-0.916-0.858-1.327c-4.803-5.935-12.059-14.904-24.214-14.904H169.711l-14.466-65.499c-0.759-3.436-3.805-5.882-7.323-5.882h-64c-2.219,0-4.324,0.982-5.749,2.684c-1.425,1.701-2.023,3.945-1.635,6.13l13.353,75.051l-60.441,65.147H7.5c-4.143,0-7.5,3.358-7.5,7.5v85.15c0,0.516,0.053,1.03,0.158,1.534c3.612,17.285,19.05,29.83,36.708,29.83H276.16c39.849,0,79.213-10.425,113.838-30.148c34.624-19.723,63.669-48.265,83.993-82.541C475.366,259.026,475.391,256.149,474.057,253.807z" />
    </svg>
  ),
  sub: (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <ellipse cx="50" cy="50" rx="35" ry="12" fill="currentColor" opacity="0.9" />
      <rect x="40" y="35" width="15" height="10" rx="2" fill="currentColor" opacity="0.8" />
      <line x1="47" y1="35" x2="47" y2="25" stroke="currentColor" strokeWidth="2" />
      <circle cx="88" cy="50" r="5" fill="currentColor" opacity="0.6" />
    </svg>
  ),
};

const VEHICLE_TYPE_NAMES: Record<FirmwareVehicleType, string> = {
  copter: 'Copter',
  plane: 'Plane',
  vtol: 'VTOL',
  rover: 'Rover',
  boat: 'Boat',
  sub: 'Sub',
};

// Supported vehicle types per firmware source
// This filters what vehicle types are available when selecting firmware
const FIRMWARE_SUPPORTED_VEHICLES: Record<FirmwareSource, FirmwareVehicleType[]> = {
  ardupilot: ['copter', 'plane', 'vtol', 'rover', 'boat', 'sub'],  // Full support
  px4: ['copter', 'plane', 'vtol', 'rover', 'boat', 'sub'],        // Full support
  betaflight: ['copter'],                                           // Racing/freestyle multirotors only
  inav: ['copter', 'plane', 'rover', 'boat'],                      // Navigation firmware, no VTOL/sub
  custom: ['copter', 'plane', 'vtol', 'rover', 'boat', 'sub'],     // User uploads, any type
};

// Get vehicle types available for a firmware source
function getAvailableVehicleTypes(source: FirmwareSource): FirmwareVehicleType[] {
  return FIRMWARE_SUPPORTED_VEHICLES[source] || ['copter'];
}

// Check if a vehicle type is supported by a firmware source
function isVehicleTypeSupported(type: FirmwareVehicleType, source: FirmwareSource): boolean {
  return FIRMWARE_SUPPORTED_VEHICLES[source]?.includes(type) ?? false;
}

export function FirmwareFlashView() {
  const store = useFirmwareStore();
  const {
    advancedMode,
    setAdvancedMode,
    detectedBoard,
    isDetecting,
    detectionError,
    selectedVehicleType,
    selectedSource,
    availableBoards,
    selectedBoard,
    isFetchingBoards,
    boardsError,
    boardSearchQuery,
    versionGroups,
    selectedVersionGroup,
    selectedVersion,
    isFetchingVersions,
    versionsError,
    includeBeta,
    includeDev,
    customFirmwarePath,
    flashState,
    flashProgress,
    flashError,
    detectBoard,
    setSelectedVehicleType,
    setSelectedSource,
    autoSetSource,
    setSelectedBoard,
    setSelectedVersionGroup,
    setSelectedVersion,
    setIncludeBeta,
    setIncludeDev,
    noRebootSequence,
    setNoRebootSequence,
    fullChipErase,
    setFullChipErase,
    fetchBoards,
    selectCustomFirmware,
    startFlash,
    abortFlash,
    setFlashProgress,
    setFlashError,
    reset,
    // Serial ports
    availablePorts,
    isLoadingPorts,
    isProbing,
    loadSerialPorts,
    probePort,
    // Boot pad wizard
    showBootPadWizard,
    wizardBoardName,
    wizardFirmwareVersion,
    wizardFirmwareSource,
    openBootPadWizard,
    closeBootPadWizard,
    // Detection cleanup
    clearDetection,
    // Explicit source flag
    sourceExplicitlySet,
    // Post-flash configuration
    postFlashState,
    postFlashMessage,
    postFlashError,
    startPostFlashConfig,
    resetPostFlashState,
    // Board matching warning
    unmatchedBoardWarning,
    clearUnmatchedBoardWarning,
  } = store;

  // Get connection state to auto-detect board when connected
  const { connectionState } = useConnectionStore();
  const isConnected = connectionState.isConnected;
  const connectedBoardId = connectionState.boardId;
  const connectedProtocol = connectionState.protocol;
  const connectedFcVariant = connectionState.fcVariant;

  // Auto-detect board from connection if already connected
  useEffect(() => {
    if (isConnected && connectedBoardId && !detectedBoard) {
      // Set detected board info from connection state
      const boardInfo: BoardInfo = {
        id: connectedBoardId,
        name: connectedBoardId,
        category: connectedProtocol === 'msp' ? 'Betaflight/iNav' : 'ArduPilot',
      };
      setSelectedBoard(boardInfo);

      // Auto-select firmware source based on protocol
      // But only if user hasn't explicitly selected a source
      if (!sourceExplicitlySet) {
        if (connectedProtocol === 'msp') {
          if (connectedFcVariant === 'BTFL') {
            autoSetSource('betaflight');
          } else if (connectedFcVariant === 'INAV') {
            autoSetSource('inav');
          }
        } else if (connectedProtocol === 'mavlink') {
          autoSetSource('ardupilot');
        }
      }
    }
  }, [isConnected, connectedBoardId, connectedProtocol, connectedFcVariant, detectedBoard, sourceExplicitlySet, setSelectedBoard, autoSetSource]);

  // Fetch boards on mount and when source/vehicle changes
  useEffect(() => {
    if (selectedSource !== 'custom') {
      fetchBoards();
    }
  }, [selectedSource, selectedVehicleType]);

  // Set up IPC event listeners
  useEffect(() => {
    const unsubProgress = window.electronAPI?.onFlashProgress?.(setFlashProgress);
    const unsubComplete = window.electronAPI?.onFlashComplete?.((result) => {
      if (result.success) {
        setFlashProgress({ state: 'complete', progress: 100, message: 'Flash complete!' });
        // Trigger post-flash configuration for iNav plane firmware
        // The startPostFlashConfig will check if it should run based on source/vehicleType
        startPostFlashConfig();
      } else {
        setFlashError(result.error || 'Flash failed');
      }
    });
    const unsubError = window.electronAPI?.onFlashError?.(setFlashError);

    return () => {
      unsubProgress?.();
      unsubComplete?.();
      unsubError?.();
    };
  }, [setFlashProgress, setFlashError, startPostFlashConfig]);

  // Auto-select a valid vehicle type when source changes and current type is not supported
  useEffect(() => {
    const availableTypes = getAvailableVehicleTypes(selectedSource);
    if (!availableTypes.includes(selectedVehicleType)) {
      // Current type not supported, select the first available type
      setSelectedVehicleType(availableTypes[0]!);
    }
  }, [selectedSource, selectedVehicleType, setSelectedVehicleType]);

  // Track previous port paths to detect changes (board plug/unplug)
  const prevPortPathsRef = useRef<string>('');

  // Compute isFlashing early (needed by port polling effect)
  const isFlashing =
    flashState !== 'idle' && flashState !== 'complete' && flashState !== 'error';

  // Poll serial ports and clear detection when ports change (board plugged/unplugged)
  useEffect(() => {
    // Don't poll while flashing
    if (isFlashing) return;

    // Load ports on mount
    loadSerialPorts();

    const pollInterval = setInterval(() => {
      loadSerialPorts();
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [loadSerialPorts]);

  // Clear detection state when ports change
  useEffect(() => {
    const currentPaths = availablePorts.map(p => p.path).sort().join(',');
    const prevPaths = prevPortPathsRef.current;

    // Only clear if we had ports before and they changed (not on initial load)
    if (prevPaths && currentPaths !== prevPaths) {
      console.log('[FirmwareFlash] Ports changed, clearing detection state');
      console.log('  Previous:', prevPaths);
      console.log('  Current:', currentPaths);
      clearDetection();
    }

    prevPortPathsRef.current = currentPaths;
  }, [availablePorts, clearDetection]);

  // Get available vehicle types for current source
  const availableVehicleTypes = useMemo(() =>
    getAvailableVehicleTypes(selectedSource),
    [selectedSource]
  );

  // Filter versions based on release type
  const filteredVersions = useMemo(() => {
    if (!selectedVersionGroup) return [];
    return selectedVersionGroup.versions.filter((v) => {
      if (v.releaseType === 'stable') return true;
      if (v.releaseType === 'beta' && includeBeta) return true;
      if (v.releaseType === 'dev' && includeDev) return true;
      return false;
    });
  }, [selectedVersionGroup, includeBeta, includeDev]);

  // Can only flash after clicking Connect (which sets detectedBoard with port info)
  const canFlash =
    (selectedSource === 'custom' ? !!customFirmwarePath : !!selectedVersion) &&
    !!detectedBoard &&
    !isFlashing &&
    !isConnected;  // Must disconnect from board before flashing

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg
              className="w-6 h-6 text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
              />
            </svg>
            <h1 className="text-xl font-semibold text-white">Firmware Flash</h1>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={advancedMode}
                onChange={(e) => setAdvancedMode(e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500"
              />
              Advanced
            </label>
            <button
              onClick={reset}
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Main Content - Single Column */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-6">
          {/* Warning banner when connected to a board */}
          {isConnected && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1">
                  <h4 className="text-amber-300 font-medium">Connected to {connectedBoardId || 'board'}</h4>
                  <p className="text-sm text-gray-400 mt-1">
                    Flashing requires disconnecting from the board first. The board will reboot into bootloader mode for flashing.
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    {connectedProtocol === 'msp' && connectedFcVariant ? (
                      <>Currently running: <span className="text-purple-400">{connectedFcVariant}</span> firmware</>
                    ) : connectedProtocol === 'mavlink' ? (
                      <>Currently running: <span className="text-blue-400">ArduPilot/MAVLink</span> firmware</>
                    ) : (
                      'Board info auto-detected from active connection'
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Board Detection Card */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
            <div className="flex items-center gap-2 mb-4">
              <svg
                className="w-5 h-5 text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <span className="text-zinc-300 font-medium">
                Connect your flight controller via USB
              </span>
            </div>

            {/* Connection Status - compact info line */}
            {detectedBoard && (
              <div className="flex items-center gap-2 p-2 bg-zinc-800/50 rounded-lg border border-zinc-700 mb-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-zinc-300">Connected:</span>
                <span className="text-zinc-400">{detectedBoard.port || 'USB'}</span>
                {/* Show detected board info with protocol badge */}
                {detectedBoard.name && detectedBoard.name !== 'unknown' && detectedBoard.name !== 'Unknown' && (
                  <>
                    <span className="text-zinc-600">•</span>
                    <span className="text-emerald-400 font-medium">{detectedBoard.name}</span>
                  </>
                )}
                {/* Show current firmware if detected */}
                {detectedBoard.currentFirmware && (
                  <span className="text-cyan-400 text-xs">({detectedBoard.currentFirmware})</span>
                )}
                {/* Protocol badge */}
                {detectedBoard.detectionMethod && detectedBoard.detectionMethod !== 'vid-pid' && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    detectedBoard.detectionMethod === 'mavlink' ? 'bg-blue-500/20 text-blue-400' :
                    detectedBoard.detectionMethod === 'msp' ? 'bg-purple-500/20 text-purple-400' :
                    detectedBoard.detectionMethod === 'dfu' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-zinc-700 text-zinc-400'
                  }`}>
                    {detectedBoard.detectionMethod.toUpperCase()}
                  </span>
                )}
                {/* MCU info for bootloader detection */}
                {detectedBoard.mcuType && detectedBoard.mcuType !== 'Unknown' && !detectedBoard.name?.includes(detectedBoard.mcuType) && (
                  <>
                    <span className="text-zinc-600">•</span>
                    <span className="text-zinc-400">{detectedBoard.mcuType}</span>
                  </>
                )}
                {detectedBoard.chipId && (
                  <span className="text-zinc-500 text-xs font-mono ml-auto">
                    0x{detectedBoard.chipId.toString(16).padStart(4, '0')}
                  </span>
                )}
              </div>
            )}

            {/* Board Selection - Primary control */}
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Select Board
            </label>
            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <BoardPicker
                  boards={availableBoards}
                  selectedBoard={selectedBoard}
                  onSelectBoard={setSelectedBoard}
                  isLoading={isFetchingBoards}
                  error={boardsError}
                  placeholder="Search or select your board..."
                  initialSearchQuery={boardSearchQuery}
                />
              </div>
              {/* Show button based on state:
                  - Nothing selected: Auto-detect
                  - Board manually selected but not connected: Connect
                  - Already connected: hide button */}
              {!detectedBoard && (
                <button
                  onClick={detectBoard}
                  disabled={isDetecting || isFlashing}
                  title={selectedBoard ? "Connect to board" : "Auto-detect board"}
                  className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                    selectedBoard
                      ? 'bg-blue-600 hover:bg-blue-500 text-white'
                      : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                  } disabled:bg-zinc-800 disabled:text-zinc-600`}
                >
                  {isDetecting ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
                        selectedBoard
                          ? "M13 10V3L4 14h7v7l9-11h-7z"
                          : "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      } />
                    </svg>
                  )}
                  {selectedBoard ? 'Connect' : 'Auto-detect'}
                </button>
              )}
            </div>

            {/* Suggested boards when MCU detected via bootloader */}
            {detectedBoard?.detectionMethod === 'bootloader' && detectedBoard.detectedMcu && (
              <SuggestedBoards
                mcuType={detectedBoard.detectedMcu}
                onSelectBoard={setSelectedBoard}
                disabled={isFlashing}
              />
            )}

            {/* Serial Port Selection (advanced mode only) */}
            {advancedMode && (
              <SerialPortPicker
                ports={availablePorts}
                isLoading={isLoadingPorts}
                isProbing={isProbing}
                onRefresh={loadSerialPorts}
                onProbe={probePort}
                disabled={isFlashing}
              />
            )}
          </div>

          {/* Divider line */}
          <div className="h-px bg-zinc-800" />

          {/* Vehicle Type */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-3">
              Vehicle Type
              {selectedSource === 'betaflight' && (
                <span className="ml-2 text-xs text-amber-400/80 font-normal">
                  (Betaflight only supports multirotors)
                </span>
              )}
              {selectedSource === 'inav' && (
                <span className="ml-2 text-xs text-cyan-400/80 font-normal">
                  (iNav supports copters, planes, rovers, boats)
                </span>
              )}
            </label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(VEHICLE_ICONS) as FirmwareVehicleType[]).map((type) => {
                const isAvailable = availableVehicleTypes.includes(type);
                const isSelected = selectedVehicleType === type;
                const isDisabled = isFlashing || !isAvailable;

                return (
                  <button
                    key={type}
                    onClick={() => isAvailable && setSelectedVehicleType(type)}
                    disabled={isDisabled}
                    title={!isAvailable ? `${VEHICLE_TYPE_NAMES[type]} not supported by ${FIRMWARE_SOURCE_NAMES[selectedSource]}` : undefined}
                    className={`
                      px-3 py-2 rounded-lg border transition-all flex items-center gap-2 relative
                      ${isSelected
                        ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                        : isAvailable
                          ? 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-600 cursor-not-allowed'
                      }
                      ${isFlashing ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                  >
                    <div className={`w-5 h-5 ${!isAvailable ? 'opacity-40' : ''}`}>{VEHICLE_ICONS[type]}</div>
                    <span className={`text-sm font-medium ${!isAvailable ? 'line-through decoration-zinc-600' : ''}`}>
                      {VEHICLE_TYPE_NAMES[type]}
                    </span>
                    {!isAvailable && (
                      <svg className="w-3.5 h-3.5 absolute -top-1 -right-1 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Firmware Source */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-3">
              Firmware Source
            </label>
            <div className="flex flex-wrap gap-2">
              {(['ardupilot', 'px4', 'betaflight', 'inav', 'custom'] as const).map(
                (source) => (
                  <button
                    key={source}
                    onClick={() => setSelectedSource(source)}
                    disabled={isFlashing}
                    className={`
                      px-3 py-2 rounded-lg border text-sm font-medium transition-colors
                      ${
                        selectedSource === source
                          ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                          : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600'
                      }
                    `}
                  >
                    {FIRMWARE_SOURCE_NAMES[source]}
                  </button>
                )
              )}
            </div>

            {/* Firmware change warning */}
            {(selectedSource === 'inav' || selectedSource === 'betaflight') && (
              <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="text-xs text-amber-200/80">
                      <strong className="text-amber-300">Settings will be reset!</strong> Switching firmware
                      (e.g., Betaflight → iNav) erases all configuration. You'll need to set up PIDs, modes,
                      and receivers again. Save your current settings first if needed.
                    </p>
                    <p className="text-xs text-amber-200/60 mt-1">
                      <strong>Recovery:</strong> If issues occur, put the board in bootloader mode and flash again.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Board pinout mismatch warning - only for iNav when no exact match found */}
            {selectedSource === 'inav' && unmatchedBoardWarning && (
              <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-xs text-red-200/90">
                      <strong className="text-red-300">No exact iNav target found for "{unmatchedBoardWarning}"</strong>
                    </p>
                    <p className="text-xs text-red-200/70 mt-1">
                      If you select a different board target, the <strong>pin assignments may not match</strong> your
                      hardware. Motors, servos, and sensors could be on different pins. Check the iNav wiki for
                      your specific board before flashing.
                    </p>
                    <p className="text-xs text-zinc-400 mt-2">
                      If your exact board is available with the same name, the pinout will be identical.
                    </p>
                    <button
                      onClick={clearUnmatchedBoardWarning}
                      className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 underline"
                    >
                      Dismiss warning
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Version Selection */}
          {selectedSource !== 'custom' && selectedBoard && (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-3">
                Version
              </label>

              {isFetchingVersions ? (
                <div className="flex items-center gap-2 text-zinc-500 py-2">
                  <div className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                  Loading versions...
                </div>
              ) : versionsError ? (
                <div className="text-red-400 text-sm py-2">{versionsError}</div>
              ) : versionGroups.length > 0 ? (
                <div className="space-y-3">
                  {/* Version group pills */}
                  <div className="flex flex-wrap gap-2">
                    {versionGroups.slice(0, 4).map((group) => (
                      <button
                        key={group.major}
                        onClick={() => setSelectedVersionGroup(group)}
                        disabled={isFlashing}
                        className={`
                          px-3 py-1.5 rounded-lg text-sm transition-colors
                          ${
                            selectedVersionGroup?.major === group.major
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                              : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600'
                          }
                          ${group.isLatest ? 'ring-1 ring-emerald-500/30' : ''}
                        `}
                      >
                        {group.label}
                        {group.isLatest && (
                          <span className="ml-1.5 text-emerald-400 text-xs">Latest</span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Specific version dropdown */}
                  {selectedVersionGroup && (
                    <div className="flex gap-3 items-center">
                      <select
                        value={selectedVersion?.version || ''}
                        onChange={(e) => {
                          const version = filteredVersions.find(
                            (v) => v.version === e.target.value
                          );
                          setSelectedVersion(version || null);
                        }}
                        disabled={isFlashing}
                        className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none focus:border-blue-500"
                      >
                        {filteredVersions.map((v) => (
                          <option key={v.version} value={v.version}>
                            {v.version}
                            {v.releaseType !== 'stable' ? ` (${v.releaseType})` : ''}
                            {v.fileSize ? ` - ${Math.round(v.fileSize / 1024)}KB` : ''}
                          </option>
                        ))}
                      </select>

                      {/* Beta/Dev toggles (advanced mode) */}
                      {advancedMode && (
                        <div className="flex gap-3">
                          <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={includeBeta}
                              onChange={(e) => setIncludeBeta(e.target.checked)}
                              disabled={isFlashing}
                              className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500"
                            />
                            Beta
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={includeDev}
                              onChange={(e) => setIncludeDev(e.target.checked)}
                              disabled={isFlashing}
                              className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500"
                            />
                            Dev
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-zinc-500 text-sm py-2">
                  Select a board to see available versions
                </div>
              )}
            </div>
          )}

          {/* Custom Firmware File */}
          {selectedSource === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-3">
                Firmware File
              </label>
              <button
                onClick={selectCustomFirmware}
                disabled={isFlashing}
                className="w-full px-4 py-4 bg-zinc-800 border border-zinc-700 border-dashed rounded-lg text-zinc-400 hover:border-zinc-600 hover:text-zinc-300 transition-colors"
              >
                {customFirmwarePath ? (
                  <span className="text-blue-400">
                    {customFirmwarePath.split(/[\\/]/).pop()}
                  </span>
                ) : (
                  <span>Click to select .apj, .bin, or .hex file</span>
                )}
              </button>
            </div>
          )}

          {/* Flash Progress & Button */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
            {/* Progress bar - hide percentage when error/idle */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1.5">
                <span className={flashState === 'error' ? 'text-red-400' : 'text-zinc-400'}>
                  {flashState === 'error'
                    ? 'Flash failed'
                    : flashState === 'complete'
                      ? 'Flash complete!'
                      : flashProgress?.message || 'Ready to flash'}
                </span>
                {flashState !== 'error' && flashState !== 'idle' && (
                  <span className="text-zinc-500">{flashProgress?.progress || 0}%</span>
                )}
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    flashState === 'error'
                      ? 'bg-red-500'
                      : flashState === 'complete'
                        ? 'bg-emerald-500'
                        : 'bg-blue-500'
                  }`}
                  style={{ width: `${flashState === 'error' ? 100 : flashState === 'complete' ? 100 : flashProgress?.progress || 0}%` }}
                />
              </div>
            </div>

            {/* Success message - show post-flash configuration status */}
            {flashState === 'complete' && (
              <div className="mb-4 space-y-3">
                {/* Flash complete */}
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-emerald-300 font-medium">Firmware flashed successfully!</p>
                    </div>
                  </div>
                </div>

                {/* Post-flash configuration status (for iNav plane) */}
                {postFlashState !== 'idle' && postFlashState !== 'skipped' && (
                  <div className={`p-4 rounded-lg border ${
                    postFlashState === 'error'
                      ? 'bg-red-500/10 border-red-500/30'
                      : postFlashState === 'complete'
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-blue-500/10 border-blue-500/30'
                  }`}>
                    <div className="flex items-start gap-3">
                      {/* Icon based on state */}
                      {postFlashState === 'error' ? (
                        <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      ) : postFlashState === 'complete' ? (
                        <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : (
                        <div className="w-5 h-5 flex-shrink-0 mt-0.5">
                          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                      <div>
                        <p className={`font-medium ${
                          postFlashState === 'error'
                            ? 'text-red-300'
                            : postFlashState === 'complete'
                              ? 'text-emerald-300'
                              : 'text-blue-300'
                        }`}>
                          {postFlashState === 'error'
                            ? 'Platform configuration failed'
                            : postFlashState === 'complete'
                              ? 'Platform configured as Airplane'
                              : 'Configuring for Airplane mode...'}
                        </p>
                        <p className="text-zinc-400 text-sm mt-1">
                          {postFlashError || postFlashMessage || 'Processing...'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Final message */}
                {(postFlashState === 'complete' || postFlashState === 'skipped' || postFlashState === 'idle') && (
                  <p className="text-zinc-400 text-sm">
                    Unplug and reconnect your board to start using the new firmware.
                  </p>
                )}
              </div>
            )}

            {/* Error display - different styles for boot pad vs other errors */}
            {flashError && (() => {
              const errorLower = flashError.toLowerCase();
              const isBootRelated = errorLower.includes('boot') || errorLower.includes('bootloader');
              // Only show "Boot Pads Required" for USB-serial boards (CP2102/FTDI/CH340),
              // not for native USB boards that support DFU reboot
              const isUsbSerialBoard = detectedBoard?.flasher === 'serial';
              const isBootPadError = isBootRelated && isUsbSerialBoard;

              // Boot pad required - show friendly guidance card, not scary error
              if (isBootPadError && selectedBoard) {
                return (
                  <div className="mb-4 p-5 bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/40 rounded-xl">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                        <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-amber-300 font-semibold">Boot Pads Required</h3>
                        <p className="text-zinc-400 text-sm">This board needs manual bootloader entry</p>
                      </div>
                    </div>
                    <p className="text-zinc-300 text-sm mb-4">
                      Your <span className="text-white font-medium">{selectedBoard.name}</span> uses a USB-serial chip
                      and can't enter bootloader via software. Don't worry - the wizard will guide you through it!
                    </p>
                    <button
                      onClick={openBootPadWizard}
                      className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Start Flash Wizard
                    </button>
                  </div>
                );
              }

              // Other errors - show standard error box
              return (
                <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <pre className="text-red-300 text-sm whitespace-pre-wrap font-sans leading-relaxed flex-1">
                      {flashError}
                    </pre>
                  </div>
                </div>
              );
            })()}

            {/* Bootloader mode pre-flash checklist */}
            {detectedBoard?.inBootloader && !isFlashing && flashState !== 'complete' && (
              <BootloaderChecklist
                canFlash={canFlash}
                onReady={startFlash}
              />
            )}

            {/* Flash Options (advanced mode) */}
            {advancedMode && (
              <div className="flex gap-4 py-2">
                <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={noRebootSequence}
                    onChange={(e) => setNoRebootSequence(e.target.checked)}
                    disabled={isFlashing}
                    className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500"
                  />
                  No reboot sequence
                  <span className="text-xs text-zinc-500">(board already in bootloader)</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fullChipErase}
                    onChange={(e) => setFullChipErase(e.target.checked)}
                    disabled={isFlashing}
                    className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500"
                  />
                  Full chip erase
                </label>
              </div>
            )}

            {/* Flash button - hidden when bootloader checklist or boot pad error wizard is shown */}
            {(() => {
              const btnErrorLower = flashError?.toLowerCase() ?? '';
              const btnBootRelated = btnErrorLower.includes('boot') || btnErrorLower.includes('bootloader');
              const btnIsUsbSerial = detectedBoard?.flasher === 'serial';
              const isBootPadError = flashError && btnBootRelated && btnIsUsbSerial;
              const showFlashButton = !detectedBoard?.inBootloader && !isBootPadError || isFlashing || flashState === 'complete';

              if (!showFlashButton) return null;

              return (
                <div className="flex gap-3">
                  <button
                    onClick={startFlash}
                    disabled={!canFlash}
                    className={`
                      flex-1 px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2
                      ${
                        canFlash
                          ? 'bg-blue-600 hover:bg-blue-500 text-white'
                          : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                      }
                    `}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                      />
                    </svg>
                    Flash Firmware
                  </button>

                  {isFlashing && (
                    <button
                      onClick={abortFlash}
                      className="px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Summary text */}
            {(selectedBoard || selectedVersion || customFirmwarePath) && (
              <div className="mt-4 pt-3 border-t border-zinc-800 text-sm text-zinc-500">
                {selectedSource === 'custom' ? (
                  <>
                    Custom firmware{' '}
                    {customFirmwarePath && (
                      <span className="text-zinc-300">
                        ({customFirmwarePath.split(/[\\/]/).pop()})
                      </span>
                    )}{' '}
                    to {detectedBoard?.name || selectedBoard?.name || 'board'}
                  </>
                ) : (
                  <>
                    {FIRMWARE_SOURCE_NAMES[selectedSource]}{' '}
                    <span className="text-zinc-300">{selectedVersion?.version}</span> for{' '}
                    <span className="text-zinc-300">
                      {selectedBoard?.name || detectedBoard?.name}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Boot Pad Flash Wizard Modal */}
      <BootPadWizard
        isOpen={showBootPadWizard}
        onClose={closeBootPadWizard}
        boardName={wizardBoardName || selectedBoard?.name || 'Unknown Board'}
        firmwareVersion={wizardFirmwareVersion || selectedVersion?.version || ''}
        firmwareSource={FIRMWARE_SOURCE_NAMES[wizardFirmwareSource as keyof typeof FIRMWARE_SOURCE_NAMES] || wizardFirmwareSource || ''}
      />
    </div>
  );
}
