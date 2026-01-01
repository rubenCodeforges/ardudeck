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

  // Board selection (from manifest)
  availableBoards: BoardInfo[];
  selectedBoard: BoardInfo | null;
  isFetchingBoards: boolean;
  boardsError: string | null;
  boardSearchQuery: string;

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

  // Actions - Mode
  setAdvancedMode: (advanced: boolean) => void;

  // Actions - Board Detection
  detectBoard: () => Promise<void>;
  setDetectedBoard: (board: DetectedBoard | null) => void;
  setDetectionError: (error: string | null) => void;

  // Actions - Serial Ports
  loadSerialPorts: () => Promise<void>;
  setSelectedPort: (port: string | null) => void;
  probePort: (port: string) => Promise<void>;
  queryMavlinkBoard: (port: string) => Promise<void>;

  // Actions - Selection
  setSelectedVehicleType: (type: FirmwareVehicleType) => void;
  setSelectedSource: (source: FirmwareSource) => void;
  setBoardSearchQuery: (query: string) => void;
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

  // Board selection
  availableBoards: [],
  selectedBoard: null,
  isFetchingBoards: false,
  boardsError: null,
  boardSearchQuery: '',

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
      const detectionMethod = board.detectionMethod;
      let targetSource = get().selectedSource;

      if (detectionMethod === 'msp') {
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

  setSelectedBoard: (board) => {
    set({
      selectedBoard: board,
      selectedVersionGroup: null,
      selectedVersion: null,
      versionGroups: [],
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
    const { selectedSource, selectedVersion, customFirmwarePath, detectedBoard } = get();

    if (!detectedBoard) {
      set({ flashError: 'No board detected' });
      return;
    }

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
      const result = await window.electronAPI?.flashFirmware?.(firmwarePath, detectedBoard, options);
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
