import { create } from 'zustand';
import type {
  DetectedBoard,
  FirmwareSource,
  FirmwareVehicleType,
  FirmwareVersion,
  FlashState,
  FlashProgress,
  ReleaseType,
} from '../../shared/firmware-types';
import { findMatchingInavBoard } from '../../shared/board-mappings';

/**
 * Board info from manifest
 */
export interface BoardInfo {
  id: string;
  name: string;
  category: string;
  isPopular?: boolean;
}

/**
 * Version group (e.g., "4.5.x")
 */
export interface VersionGroup {
  major: string;
  label: string;
  versions: FirmwareVersion[];
  isLatest: boolean;
}

// Serial port info
export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  vendorId?: string;
  productId?: string;
}

interface FirmwareStore {
  // Mode
  advancedMode: boolean;

  // Board detection (from USB)
  detectedBoard: DetectedBoard | null;
  isDetecting: boolean;
  detectionError: string | null;

  // Serial ports (for manual selection)
  availablePorts: SerialPortInfo[];
  isLoadingPorts: boolean;
  selectedPort: string | null;
  isProbing: boolean;

  // Vehicle selection
  selectedVehicleType: FirmwareVehicleType;

  // Firmware source
  selectedSource: FirmwareSource;
  sourceExplicitlySet: boolean; // User explicitly selected source, don't auto-override

  // Board selection (from manifest)
  availableBoards: BoardInfo[];
  selectedBoard: BoardInfo | null;
  isFetchingBoards: boolean;
  boardsError: string | null;
  boardSearchQuery: string;
  pendingBoardMatch: string | null; // Betaflight board ID to match after fetching iNav boards
  unmatchedBoardWarning: string | null; // Shows warning when no exact iNav match found for Betaflight board

  // Version selection
  versionGroups: VersionGroup[];
  selectedVersionGroup: VersionGroup | null;
  selectedVersion: FirmwareVersion | null;
  isFetchingVersions: boolean;
  versionsError: string | null;

  // Release type filters (advanced mode)
  includeBeta: boolean;
  includeDev: boolean;

  // Custom firmware
  customFirmwarePath: string | null;

  // Flash options
  noRebootSequence: boolean;
  fullChipErase: boolean;

  // Flash operation
  flashState: FlashState;
  flashProgress: FlashProgress | null;
  flashError: string | null;

  // Boot pad wizard
  showBootPadWizard: boolean;
  wizardBoardName: string | null;
  wizardFirmwareVersion: string | null;
  wizardFirmwareSource: string | null;

  // Post-flash configuration (for iNav plane firmware)
  postFlashState: 'idle' | 'waiting' | 'connecting' | 'configuring' | 'saving' | 'complete' | 'error' | 'skipped';
  postFlashMessage: string | null;
  postFlashError: string | null;

  // Actions - Mode
  setAdvancedMode: (advanced: boolean) => void;

  // Actions - Board Detection
  detectBoard: () => Promise<void>;
  setDetectedBoard: (board: DetectedBoard | null) => void;
  setDetectionError: (error: string | null) => void;
  clearDetection: () => void;

  // Actions - Serial Ports
  loadSerialPorts: () => Promise<void>;
  setSelectedPort: (port: string | null) => void;
  probePort: (port: string) => Promise<void>;
  queryMavlinkBoard: (port: string) => Promise<void>;

  // Actions - Selection
  setSelectedVehicleType: (type: FirmwareVehicleType) => void;
  setSelectedSource: (source: FirmwareSource) => void;
  autoSetSource: (source: FirmwareSource) => void; // Auto-detect sets source without marking explicit
  setBoardSearchQuery: (query: string) => void;
  setPendingBoardMatch: (boardId: string | null) => void;
  clearUnmatchedBoardWarning: () => void;
  setSelectedBoard: (board: BoardInfo | null) => void;
  setSelectedVersionGroup: (group: VersionGroup | null) => void;
  setSelectedVersion: (version: FirmwareVersion | null) => void;
  setIncludeBeta: (include: boolean) => void;
  setIncludeDev: (include: boolean) => void;
  setNoRebootSequence: (value: boolean) => void;
  setFullChipErase: (value: boolean) => void;

  // Actions - Fetching
  fetchBoards: () => Promise<void>;
  fetchVersions: () => Promise<void>;

  // Actions - Custom firmware
  selectCustomFirmware: () => Promise<void>;
  setCustomFirmwarePath: (path: string | null) => void;

  // Actions - Flash
  startFlash: () => Promise<void>;
  abortFlash: () => void;
  enterBootloader: () => Promise<void>;

  // IPC event handlers
  setFlashProgress: (progress: FlashProgress) => void;
  setFlashState: (state: FlashState) => void;
  setFlashError: (error: string | null) => void;

  // Post-flash configuration actions
  startPostFlashConfig: () => Promise<void>;
  skipPostFlashConfig: () => void;
  resetPostFlashState: () => void;

  // Boot pad wizard actions
  openBootPadWizard: () => void;
  closeBootPadWizard: () => void;

  // Computed
  filteredBoards: () => BoardInfo[];
  filteredVersions: () => FirmwareVersion[];

  // Reset
  reset: () => void;
}

const initialState = {
  // Mode
  advancedMode: false,

  // Board detection
  detectedBoard: null,
  isDetecting: false,
  detectionError: null,

  // Serial ports
  availablePorts: [] as SerialPortInfo[],
  isLoadingPorts: false,
  selectedPort: null as string | null,
  isProbing: false,

  // Vehicle selection
  selectedVehicleType: 'copter' as FirmwareVehicleType,

  // Firmware source
  selectedSource: 'ardupilot' as FirmwareSource,
  sourceExplicitlySet: false,

  // Board selection
  availableBoards: [],
  selectedBoard: null,
  isFetchingBoards: false,
  boardsError: null,
  boardSearchQuery: '',
  pendingBoardMatch: null,
  unmatchedBoardWarning: null,

  // Version selection
  versionGroups: [],
  selectedVersionGroup: null,
  selectedVersion: null,
  isFetchingVersions: false,
  versionsError: null,

  // Release type filters
  includeBeta: false,
  includeDev: false,

  // Custom firmware
  customFirmwarePath: null,

  // Flash options
  noRebootSequence: false,
  fullChipErase: false,

  // Flash operation
  flashState: 'idle' as FlashState,
  flashProgress: null,
  flashError: null,

  // Boot pad wizard
  showBootPadWizard: false,
  wizardBoardName: null as string | null,
  wizardFirmwareVersion: null as string | null,
  wizardFirmwareSource: null as string | null,

  // Post-flash configuration
  postFlashState: 'idle' as const,
  postFlashMessage: null as string | null,
  postFlashError: null as string | null,
};

export const useFirmwareStore = create<FirmwareStore>((set, get) => ({
  ...initialState,

  // Mode
  setAdvancedMode: (advanced) => set({ advancedMode: advanced }),

  // Board detection - tries all protocols (MAVLink, MSP, STM32 bootloader)
  detectBoard: async () => {
    set({ isDetecting: true, detectionError: null, detectedBoard: null });

    try {
      // First, get USB-detected boards
      const usbResult = await window.electronAPI?.detectBoard?.();
      if (!usbResult?.success || !usbResult.boards || usbResult.boards.length === 0) {
        set({
          detectionError: 'No USB device detected. Make sure your flight controller is connected.',
          isDetecting: false,
        });
        return;
      }

      let board = usbResult.boards[0];
      const port = board.port;

      // If we have a COM port, try comprehensive auto-detection (MAVLink → MSP → STM32)
      if (port) {
        try {
          const autoResult = await window.electronAPI?.autoDetectBoard?.(port);

          if (autoResult?.success) {
            // Update board with detected info
            // Keep original flasher type - 'serial' for USB-serial adapters, 'dfu' for native USB
            board = {
              ...board,
              name: autoResult.boardName || board.name,
              boardId: autoResult.boardId || autoResult.boardName?.toLowerCase() || board.boardId,
              detectionMethod: autoResult.protocol as any,
              mcuType: autoResult.mcuType || board.mcuType,
              detectedMcu: autoResult.mcuType || board.detectedMcu,  // For SuggestedBoards component
              inBootloader: autoResult.inBootloader || board.inBootloader,
              currentFirmware: autoResult.firmware ? `${autoResult.firmware} v${autoResult.firmwareVersion || ''}` : board.currentFirmware,
            };
          }
        } catch {
          // Auto-detect failed - continue with USB-only detection
        }
      }

      set({ detectedBoard: board, isDetecting: false });

      // Auto-select firmware source based on detection protocol
      // But only if user hasn't explicitly set a source
      const detectionMethod = board.detectionMethod;
      let targetSource = get().selectedSource;
      const { sourceExplicitlySet } = get();

      if (sourceExplicitlySet) {
        console.log('[FirmwareStore] Source explicitly set by user, skipping auto-select');
      } else if (detectionMethod === 'msp') {
        // MSP = Betaflight/iNav/Cleanflight boards - switch to Betaflight
        console.log('[FirmwareStore] MSP detected - switching to Betaflight source');
        targetSource = 'betaflight';
        set({ selectedSource: targetSource });
        await get().fetchBoards();
      } else if (detectionMethod === 'mavlink') {
        // MAVLink = ArduPilot/PX4 boards - keep ArduPilot
        console.log('[FirmwareStore] MAVLink detected - keeping ArduPilot source');
        targetSource = 'ardupilot';
        if (get().selectedSource !== 'ardupilot') {
          set({ selectedSource: targetSource });
          await get().fetchBoards();
        }
      }

      // If we have a detected board, try to find matching board in list
      const { availableBoards } = get();
      console.log('[FirmwareStore] Detected board:', board.boardId, board.name);
      console.log('[FirmwareStore] Available boards:', availableBoards.length, 'Source:', targetSource);

      if (board.boardId && availableBoards.length > 0) {
        const boardIdLower = board.boardId.toLowerCase();
        const boardNameLower = (board.name || '').toLowerCase();

        const matchingBoard = availableBoards.find(b => {
          const idMatch = b.id.toLowerCase() === boardIdLower;
          const nameIncludes = boardNameLower && b.name.toLowerCase().includes(boardNameLower);
          const nameIncludedIn = boardNameLower && boardNameLower.includes(b.name.toLowerCase());
          return idMatch || nameIncludes || nameIncludedIn;
        });

        if (matchingBoard) {
          console.log('[FirmwareStore] Auto-selected board:', matchingBoard.name);
          set({ selectedBoard: matchingBoard });
          get().fetchVersions();
        } else {
          console.log('[FirmwareStore] No matching board found for:', board.boardId);
        }
      }
    } catch (error) {
      set({
        detectionError: error instanceof Error ? error.message : 'Detection failed',
        isDetecting: false,
      });
    }
  },

  setDetectedBoard: (board) => set({ detectedBoard: board }),
  setDetectionError: (error) => set({ detectionError: error }),

  // Clear all detection-related state (call when ports change)
  // Note: Don't reset sourceExplicitlySet here - that should only reset on full reset
  // This allows user to navigate to firmware flash with a pre-selected source
  clearDetection: () => set({
    detectedBoard: null,
    isDetecting: false,
    detectionError: null,
    isProbing: false,
    // Also clear selections that depend on detection
    selectedBoard: null,
    selectedVersionGroup: null,
    selectedVersion: null,
    versionGroups: [],
    // Clear flash state when board is disconnected
    flashState: 'idle',
    flashProgress: null,
    flashError: null,
  }),

  // Serial port actions
  loadSerialPorts: async () => {
    set({ isLoadingPorts: true });
    try {
      const result = await window.electronAPI?.listSerialPorts?.();
      if (result?.success && result.ports) {
        set({ availablePorts: result.ports, isLoadingPorts: false });
      } else {
        set({ availablePorts: [], isLoadingPorts: false });
      }
    } catch {
      set({ availablePorts: [], isLoadingPorts: false });
    }
  },

  setSelectedPort: (port) => set({ selectedPort: port }),

  probePort: async (port: string) => {
    set({ isProbing: true });
    try {
      const result = await window.electronAPI?.probeSTM32?.(port);
      if (result?.success && result.mcu) {
        // Create a DetectedBoard from the probe result
        const board: DetectedBoard = {
          name: `${result.mcu} on ${port}`,
          boardId: 'unknown',
          mcuType: result.mcu,
          flasher: 'dfu',
          port,
          inBootloader: true,
          chipId: result.chipId,
          detectedMcu: result.mcu,
          detectionMethod: 'bootloader',
        };
        set({ detectedBoard: board, isProbing: false, detectionError: null });
      } else {
        set({
          isProbing: false,
          detectionError: `No STM32 bootloader found on ${port}. Make sure the board is in bootloader mode.`,
        });
      }
    } catch (error) {
      set({
        isProbing: false,
        detectionError: error instanceof Error ? error.message : 'Probe failed',
      });
    }
  },

  queryMavlinkBoard: async (port: string) => {
    set({ isProbing: true, detectionError: null });
    try {
      const result = await window.electronAPI?.queryMavlinkBoard?.(port);
      if (result?.success && result.boardName) {
        // Create a DetectedBoard from the MAVLink result
        const board: DetectedBoard = {
          name: result.boardName,
          boardId: result.boardName.toLowerCase(),
          mcuType: 'Unknown',
          flasher: 'dfu',
          port,
          inBootloader: false,
          detectionMethod: 'mavlink',
        };
        set({ detectedBoard: board, isProbing: false, detectionError: null });

        // Try to find and select matching board in the dropdown
        const { availableBoards } = get();
        const matchingBoard = availableBoards.find(b =>
          b.id.toLowerCase() === result.boardName!.toLowerCase() ||
          b.name.toLowerCase().includes(result.boardName!.toLowerCase()) ||
          result.boardName!.toLowerCase().includes(b.name.toLowerCase())
        );
        if (matchingBoard) {
          set({ selectedBoard: matchingBoard });
          get().fetchVersions();
        }
      } else {
        set({
          isProbing: false,
          detectionError: result?.error || `Could not identify board on ${port}. Select your board manually.`,
        });
      }
    } catch (error) {
      set({
        isProbing: false,
        detectionError: error instanceof Error ? error.message : 'MAVLink query failed',
      });
    }
  },

  // Selection actions
  setSelectedVehicleType: (type) => {
    set({
      selectedVehicleType: type,
      selectedBoard: null,
      selectedVersionGroup: null,
      selectedVersion: null,
      availableBoards: [],
      versionGroups: [],
    });
    // Fetch boards for the new vehicle type
    get().fetchBoards();
  },

  setSelectedSource: (source) => {
    set({
      selectedSource: source,
      sourceExplicitlySet: true, // Mark as explicitly set to prevent auto-override
      selectedBoard: null,
      selectedVersionGroup: null,
      selectedVersion: null,
      availableBoards: [],
      versionGroups: [],
      customFirmwarePath: null,
    });
    // Fetch boards for new source (unless custom)
    if (source !== 'custom') {
      get().fetchBoards();
    }
  },

  // Auto-detect sets source without marking it as explicitly set
  autoSetSource: (source) => {
    set({
      selectedSource: source,
      // Don't set sourceExplicitlySet - this is auto-detection
      selectedBoard: null,
      selectedVersionGroup: null,
      selectedVersion: null,
      availableBoards: [],
      versionGroups: [],
      customFirmwarePath: null,
    });
    // Fetch boards for new source (unless custom)
    if (source !== 'custom') {
      get().fetchBoards();
    }
  },

  setBoardSearchQuery: (query) => set({ boardSearchQuery: query }),
  setPendingBoardMatch: (boardId) => set({ pendingBoardMatch: boardId }),
  clearUnmatchedBoardWarning: () => set({ unmatchedBoardWarning: null }),

  setSelectedBoard: (board) => {
    set({
      selectedBoard: board,
      selectedVersionGroup: null,
      selectedVersion: null,
      versionGroups: [],
      unmatchedBoardWarning: null, // Clear warning when user explicitly selects a board
    });
    // Fetch versions for the selected board
    if (board) {
      get().fetchVersions();
    }
  },

  setSelectedVersionGroup: (group) => {
    set({ selectedVersionGroup: group });
    // Auto-select latest stable version in group
    if (group) {
      const stableVersion = group.versions.find(v => v.releaseType === 'stable');
      set({ selectedVersion: stableVersion || group.versions[0] || null });
    } else {
      set({ selectedVersion: null });
    }
  },

  setSelectedVersion: (version) => set({ selectedVersion: version }),
  setIncludeBeta: (include) => set({ includeBeta: include }),
  setIncludeDev: (include) => set({ includeDev: include }),
  setNoRebootSequence: (value) => set({ noRebootSequence: value }),
  setFullChipErase: (value) => set({ fullChipErase: value }),

  // Fetching
  fetchBoards: async () => {
    const { selectedSource, selectedVehicleType } = get();

    if (selectedSource === 'custom') return;

    set({ isFetchingBoards: true, boardsError: null });

    try {
      // Explicit check instead of optional chaining to surface errors
      if (!window.electronAPI?.fetchFirmwareBoards) {
        throw new Error('Firmware API not available - check preload.ts');
      }

      const result = await window.electronAPI.fetchFirmwareBoards(selectedSource, selectedVehicleType);
      console.log('[FirmwareStore] fetchBoards result:', result);

      if (result?.success && result.boards) {
        set({
          availableBoards: result.boards,
          isFetchingBoards: false,
          boardsError: null,
        });

        // Check if there's a pending board match (e.g., from Betaflight -> iNav transition)
        const { pendingBoardMatch, selectedSource: currentSource } = get();
        if (pendingBoardMatch && currentSource === 'inav') {
          const matchingBoard = findMatchingInavBoard(pendingBoardMatch, result.boards);
          if (matchingBoard) {
            console.log(`[FirmwareStore] Auto-selected iNav board "${matchingBoard.name}" for Betaflight "${pendingBoardMatch}"`);
            set({ selectedBoard: matchingBoard, pendingBoardMatch: null, unmatchedBoardWarning: null });
            // Fetch versions for the matched board
            get().fetchVersions();
          } else {
            console.log(`[FirmwareStore] No iNav board found for Betaflight "${pendingBoardMatch}"`);
            // Clear pending match, set search query so user can find manually, and show warning
            set({
              pendingBoardMatch: null,
              boardSearchQuery: pendingBoardMatch,
              unmatchedBoardWarning: pendingBoardMatch,
            });
          }
        }
      } else {
        const errorMsg = result?.error || 'Failed to fetch boards (no error message)';
        console.error('[FirmwareStore] fetchBoards failed:', errorMsg);
        set({
          boardsError: errorMsg,
          isFetchingBoards: false,
        });
      }
    } catch (error) {
      console.error('[FirmwareStore] fetchBoards exception:', error);
      set({
        boardsError: error instanceof Error ? error.message : 'Failed to fetch boards',
        isFetchingBoards: false,
      });
    }
  },

  fetchVersions: async () => {
    const { selectedSource, selectedVehicleType, selectedBoard } = get();

    if (selectedSource === 'custom' || !selectedBoard) return;

    set({ isFetchingVersions: true, versionsError: null });

    try {
      // Explicit check instead of optional chaining to surface errors
      if (!window.electronAPI?.fetchFirmwareVersions) {
        throw new Error('Firmware versions API not available - check preload.ts');
      }

      const result = await window.electronAPI.fetchFirmwareVersions(
        selectedSource,
        selectedVehicleType,
        selectedBoard.id
      );
      console.log('[FirmwareStore] fetchVersions result:', result);

      if (result?.success && result.groups) {
        set({
          versionGroups: result.groups,
          isFetchingVersions: false,
          versionsError: null,
        });
        // Auto-select latest version group
        const latestGroup = result.groups.find(g => g.isLatest) || result.groups[0];
        if (latestGroup) {
          set({ selectedVersionGroup: latestGroup });
          const stableVersion = latestGroup.versions.find(v => v.releaseType === 'stable');
          set({ selectedVersion: stableVersion || latestGroup.versions[0] || null });
        }
      } else {
        const errorMsg = result?.error || 'Failed to fetch versions (no error message)';
        console.error('[FirmwareStore] fetchVersions failed:', errorMsg);
        set({
          versionsError: errorMsg,
          isFetchingVersions: false,
        });
      }
    } catch (error) {
      console.error('[FirmwareStore] fetchVersions exception:', error);
      set({
        versionsError: error instanceof Error ? error.message : 'Failed to fetch versions',
        isFetchingVersions: false,
      });
    }
  },

  // Custom firmware
  selectCustomFirmware: async () => {
    try {
      const result = await window.electronAPI?.selectFirmwareFile?.();
      if (result?.success && result.filePath) {
        set({ customFirmwarePath: result.filePath });
      }
    } catch (error) {
      console.error('Failed to select firmware file:', error);
    }
  },

  setCustomFirmwarePath: (path) => set({ customFirmwarePath: path }),

  // Flash operations
  startFlash: async () => {
    const { selectedSource, selectedVersion, customFirmwarePath, detectedBoard, selectedPort } = get();

    if (!detectedBoard) {
      set({ flashError: 'No board connected. Click Connect first.' });
      return;
    }

    // For AVR boards (avrdude), ensure port is set from selectedPort if not auto-detected
    // This is needed on macOS where USB detection doesn't capture serial ports
    const boardWithPort: DetectedBoard = {
      ...detectedBoard,
      port: detectedBoard.port || selectedPort || undefined,
    };

    let firmwarePath: string | undefined;

    if (selectedSource === 'custom') {
      firmwarePath = customFirmwarePath || undefined;
      if (!firmwarePath) {
        set({ flashError: 'No firmware file selected' });
        return;
      }
    } else {
      if (!selectedVersion) {
        set({ flashError: 'No firmware version selected' });
        return;
      }

      set({
        flashState: 'downloading',
        flashError: null,
        flashProgress: { state: 'downloading', progress: 0, message: 'Downloading firmware...' },
      });

      try {
        const downloadResult = await window.electronAPI?.downloadFirmware?.(selectedVersion);
        if (!downloadResult?.success || !downloadResult.filePath) {
          set({
            flashState: 'error',
            flashError: downloadResult?.error || 'Download failed',
          });
          return;
        }
        firmwarePath = downloadResult.filePath;
      } catch (error) {
        set({
          flashState: 'error',
          flashError: error instanceof Error ? error.message : 'Download failed',
        });
        return;
      }
    }

    set({
      flashState: 'flashing',
      flashProgress: { state: 'flashing', progress: 0, message: 'Starting flash...' },
    });

    try {
      const { noRebootSequence, fullChipErase } = get();
      const options = { noRebootSequence, fullChipErase };
      const result = await window.electronAPI?.flashFirmware?.(firmwarePath, boardWithPort, options);
      if (!result?.success) {
        set({
          flashState: 'error',
          flashError: result?.error || 'Flash failed',
        });
      }
    } catch (error) {
      set({
        flashState: 'error',
        flashError: error instanceof Error ? error.message : 'Flash failed',
      });
    }
  },

  abortFlash: async () => {
    try {
      await window.electronAPI?.abortFlash?.();
      set({ flashState: 'idle', flashProgress: null });
    } catch (error) {
      console.error('Failed to abort flash:', error);
    }
  },

  enterBootloader: async () => {
    set({ flashState: 'entering-bootloader' });
    try {
      const result = await window.electronAPI?.enterBootloader?.();
      if (!result?.success) {
        set({
          flashState: 'error',
          flashError: result?.error || 'Failed to enter bootloader',
        });
      }
    } catch (error) {
      set({
        flashState: 'error',
        flashError: error instanceof Error ? error.message : 'Failed to enter bootloader',
      });
    }
  },

  // IPC event handlers
  setFlashProgress: (progress) => set({ flashProgress: progress, flashState: progress.state }),
  setFlashState: (state) => set({ flashState: state }),
  setFlashError: (error) => set({
    flashError: error,
    flashState: 'error',
    // Reset progress on error so UI shows clean state
    flashProgress: { state: 'error', progress: 0, message: 'Flash failed' },
  }),

  // Post-flash configuration actions
  startPostFlashConfig: async () => {
    const { selectedSource, selectedVehicleType, detectedBoard } = get();

    // Only for iNav plane firmware
    if (selectedSource !== 'inav' || selectedVehicleType !== 'plane') {
      set({ postFlashState: 'skipped' });
      return;
    }

    const port = detectedBoard?.port;
    if (!port) {
      set({
        postFlashState: 'error',
        postFlashError: 'No port found for reconnection',
      });
      return;
    }

    // Helper to attempt connection with MSP detection
    const tryConnect = async (): Promise<boolean> => {
      try {
        const result = await window.electronAPI?.connect?.({
          type: 'serial',
          port,
          baudRate: 115200,
          protocol: 'msp',
        });
        if (!result) return false;

        // Wait for connection to stabilize
        await new Promise(resolve => setTimeout(resolve, 500));

        // Try to read mixer config as a connection test
        const mixerConfig = await window.electronAPI?.mspGetInavMixerConfig?.();
        return mixerConfig !== null && mixerConfig !== undefined;
      } catch {
        // Disconnect on failure before retry
        try { await window.electronAPI?.disconnect?.(); } catch {}
        return false;
      }
    };

    try {
      // Step 1: Wait for board to reboot
      // USB-serial chips (CH340, CP210x) need significant time after board reboot
      set({
        postFlashState: 'waiting',
        postFlashMessage: 'Waiting for board to reboot (6s)...',
        postFlashError: null,
      });
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Step 2: Try to connect with retries
      // USB-serial chips often need multiple attempts after a flash
      const MAX_RETRIES = 3;
      const RETRY_DELAY = 3000;
      let connected = false;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        set({
          postFlashState: 'connecting',
          postFlashMessage: `Connecting to board (attempt ${attempt}/${MAX_RETRIES})...`,
        });

        connected = await tryConnect();
        if (connected) {
          console.log(`[PostFlash] Connected on attempt ${attempt}`);
          break;
        }

        if (attempt < MAX_RETRIES) {
          set({
            postFlashMessage: `Connection failed, retrying in ${RETRY_DELAY / 1000}s...`,
          });
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
      }

      if (!connected) {
        throw new Error(
          'Could not connect after flash. The USB-serial chip may need a physical unplug/replug. ' +
          'Disconnect the board, reconnect it, then use Servo Wizard to configure as airplane.'
        );
      }

      // Step 3: Check platform type
      set({
        postFlashState: 'configuring',
        postFlashMessage: 'Checking platform configuration...',
      });

      const mixerConfig = await window.electronAPI?.mspGetInavMixerConfig?.();
      if (!mixerConfig) {
        throw new Error('Failed to read iNav mixer config');
      }

      console.log('[PostFlash] Current platformType:', mixerConfig.platformType);

      // platformType: 0=MULTIROTOR, 1=AIRPLANE
      if (mixerConfig.platformType === 1) {
        // Already airplane, we're done
        set({
          postFlashState: 'complete',
          postFlashMessage: 'Board already configured as airplane',
        });
        await window.electronAPI?.disconnect?.();
        return;
      }

      // Step 4: Set platform to AIRPLANE
      set({
        postFlashMessage: 'Configuring board as airplane...',
      });

      const setResult = await window.electronAPI?.mspSetInavPlatformType?.(1); // 1 = AIRPLANE
      if (!setResult) {
        throw new Error('Failed to set platform type to airplane');
      }

      // BSOD Prevention: Delay after platform type change
      await new Promise(resolve => setTimeout(resolve, 500));

      // Step 5: Save to EEPROM
      set({
        postFlashState: 'saving',
        postFlashMessage: 'Saving to EEPROM...',
      });

      await window.electronAPI?.mspSaveEeprom?.();

      // BSOD Prevention: Delay after EEPROM save before reboot
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 6: Reboot
      set({
        postFlashMessage: 'Rebooting board...',
      });

      await window.electronAPI?.mspReboot?.();

      // BSOD Prevention: Wait before disconnect to let reboot command complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // Disconnect (board is rebooting)
      await window.electronAPI?.disconnect?.();

      set({
        postFlashState: 'complete',
        postFlashMessage: 'Board configured as airplane! Reconnect when ready.',
      });

    } catch (error) {
      console.error('[PostFlash] Configuration failed:', error);
      set({
        postFlashState: 'error',
        postFlashError: error instanceof Error ? error.message : 'Configuration failed',
      });

      // Try to disconnect cleanly
      try {
        await window.electronAPI?.disconnect?.();
      } catch {
        // Ignore disconnect errors
      }
    }
  },

  skipPostFlashConfig: () => set({
    postFlashState: 'skipped',
    postFlashMessage: null,
    postFlashError: null,
  }),

  resetPostFlashState: () => set({
    postFlashState: 'idle',
    postFlashMessage: null,
    postFlashError: null,
  }),

  // Boot pad wizard actions
  openBootPadWizard: () => {
    const { selectedBoard, selectedVersion, selectedSource } = get();
    set({
      showBootPadWizard: true,
      wizardBoardName: selectedBoard?.name || 'Unknown Board',
      wizardFirmwareVersion: selectedVersion?.version || '',
      wizardFirmwareSource: selectedSource,
      flashError: null,
      flashState: 'idle',
    });
  },
  closeBootPadWizard: () => set({
    showBootPadWizard: false,
    wizardBoardName: null,
    wizardFirmwareVersion: null,
    wizardFirmwareSource: null,
  }),

  // Computed
  filteredBoards: () => {
    const { availableBoards, boardSearchQuery } = get();
    if (!boardSearchQuery.trim()) return availableBoards;

    const query = boardSearchQuery.toLowerCase();
    return availableBoards.filter(b =>
      b.name.toLowerCase().includes(query) ||
      b.id.toLowerCase().includes(query) ||
      b.category.toLowerCase().includes(query)
    );
  },

  filteredVersions: () => {
    const { selectedVersionGroup, includeBeta, includeDev } = get();
    if (!selectedVersionGroup) return [];

    return selectedVersionGroup.versions.filter(v => {
      if (v.releaseType === 'stable') return true;
      if (v.releaseType === 'beta' && includeBeta) return true;
      if (v.releaseType === 'dev' && includeDev) return true;
      return false;
    });
  },

  // Reset
  reset: () => set(initialState),
}));
