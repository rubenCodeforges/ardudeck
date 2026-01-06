/**
 * CLI Terminal Store
 *
 * Manages state for the CLI terminal including command history,
 * autocomplete suggestions, and parsed parameters from dump.
 */

import { create } from 'zustand';

// =============================================================================
// Types
// =============================================================================

export interface CliParameter {
  name: string;
  value: string;
  section?: string; // 'master', 'profile', 'battery_profile', etc.
}

export interface CliStore {
  // CLI Mode State
  isCliMode: boolean;
  isEntering: boolean;
  isExiting: boolean;

  // Terminal Output
  output: string;
  outputLines: string[];

  // Command History
  commandHistory: string[];
  historyIndex: number;
  currentInput: string;

  // Autocomplete
  suggestions: string[];
  selectedSuggestion: number;
  showSuggestions: boolean;

  // Parsed Data (from dump/help)
  parameters: Map<string, CliParameter>;
  availableCommands: string[];
  hasDumpData: boolean;

  // Actions
  enterCliMode: () => Promise<boolean>;
  exitCliMode: () => Promise<boolean>;
  sendCommand: (command: string) => Promise<void>;
  appendOutput: (text: string) => void;
  clearOutput: () => void;

  // History Actions
  addToHistory: (command: string) => void;
  historyUp: () => string;
  historyDown: () => string;
  setCurrentInput: (input: string) => void;

  // Autocomplete Actions
  updateSuggestions: (input: string) => void;
  selectNextSuggestion: () => void;
  selectPrevSuggestion: () => void;
  applySuggestion: () => string;
  hideSuggestions: () => void;

  // Parse dump output
  parseDump: (dumpOutput: string) => void;
  parseHelp: (helpOutput: string) => void;
  fetchDump: () => Promise<void>;

  // Reset
  reset: () => void;
}

// =============================================================================
// Default Commands (from iNav/Betaflight help)
// =============================================================================

const DEFAULT_COMMANDS = [
  'adjrange',
  'aux',
  'beeper',
  'color',
  'defaults',
  'dfu',
  'diff',
  'dump',
  'exit',
  'feature',
  'flash_erase',
  'flash_info',
  'get',
  'gpspassthrough',
  'help',
  'led',
  'map',
  'memory',
  'mmix',
  'motor',
  'play_sound',
  'profile',
  'battery_profile',
  'resource',
  'rxrange',
  'save',
  'serial',
  'serialpassthrough',
  'servo',
  'set',
  'smix',
  'status',
  'tasks',
  'version',
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse dump output to extract parameters
 */
function parseDumpOutput(dumpOutput: string): Map<string, CliParameter> {
  const parameters = new Map<string, CliParameter>();
  let currentSection = 'master';

  const lines = dumpOutput.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Track section changes
    if (trimmed.startsWith('# profile')) {
      currentSection = 'profile';
    } else if (trimmed.startsWith('# battery_profile')) {
      currentSection = 'battery_profile';
    } else if (trimmed.startsWith('# master')) {
      currentSection = 'master';
    }

    // Parse set commands
    const setMatch = trimmed.match(/^set\s+(\S+)\s*=\s*(.*)$/);
    if (setMatch) {
      const [, name, value] = setMatch;
      parameters.set(name!, {
        name: name!,
        value: value!.trim(),
        section: currentSection,
      });
    }
  }

  return parameters;
}

/**
 * Parse help output to extract available commands
 */
function parseHelpOutput(helpOutput: string): string[] {
  const commands: string[] = [];
  const lines = helpOutput.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Commands are typically the first word on a line
    const match = trimmed.match(/^([a-z_]+)/);
    if (match && match[1] && !trimmed.startsWith('#')) {
      commands.push(match[1]);
    }
  }

  return [...new Set(commands)].sort();
}

/**
 * Get autocomplete suggestions for input
 */
function getSuggestions(
  input: string,
  commands: string[],
  parameters: Map<string, CliParameter>
): string[] {
  if (!input) return [];

  const lower = input.toLowerCase();
  const suggestions: string[] = [];

  // Check if input starts with 'set '
  if (lower.startsWith('set ')) {
    const paramPrefix = input.slice(4).toLowerCase();
    // Suggest parameter names
    for (const [name] of parameters) {
      if (name.toLowerCase().startsWith(paramPrefix)) {
        suggestions.push(`set ${name}`);
      }
    }
    // Limit suggestions
    return suggestions.slice(0, 20);
  }

  // Check if input starts with 'get '
  if (lower.startsWith('get ')) {
    const paramPrefix = input.slice(4).toLowerCase();
    for (const [name] of parameters) {
      if (name.toLowerCase().startsWith(paramPrefix)) {
        suggestions.push(`get ${name}`);
      }
    }
    return suggestions.slice(0, 20);
  }

  // Suggest commands
  for (const cmd of commands) {
    if (cmd.toLowerCase().startsWith(lower)) {
      suggestions.push(cmd);
    }
  }

  return suggestions.slice(0, 10);
}

// =============================================================================
// Store
// =============================================================================

export const useCliStore = create<CliStore>((set, get) => ({
  // Initial State
  isCliMode: false,
  isEntering: false,
  isExiting: false,

  output: '',
  outputLines: [],

  commandHistory: [],
  historyIndex: -1,
  currentInput: '',

  suggestions: [],
  selectedSuggestion: 0,
  showSuggestions: false,

  parameters: new Map(),
  availableCommands: DEFAULT_COMMANDS,
  hasDumpData: false,

  // CLI Mode Actions
  enterCliMode: async () => {
    set({ isEntering: true });
    try {
      const success = await window.electronAPI.cliEnterMode();
      if (success) {
        set({ isCliMode: true, isEntering: false });
      } else {
        set({ isEntering: false });
      }
      return success;
    } catch (err) {
      console.error('[CLI Store] Failed to enter CLI mode:', err);
      set({ isEntering: false });
      return false;
    }
  },

  exitCliMode: async () => {
    set({ isExiting: true });
    try {
      const success = await window.electronAPI.cliExitMode();
      set({ isCliMode: false, isExiting: false });
      return success;
    } catch (err) {
      console.error('[CLI Store] Failed to exit CLI mode:', err);
      set({ isExiting: false });
      return false;
    }
  },

  sendCommand: async (command: string) => {
    const { addToHistory, appendOutput } = get();

    // Add to history if non-empty
    if (command.trim()) {
      addToHistory(command);
    }

    // Echo command to output
    appendOutput(`# ${command}\n`);

    try {
      await window.electronAPI.cliSendCommand(command);
    } catch (err) {
      console.error('[CLI Store] Failed to send command:', err);
      appendOutput(`Error: ${err instanceof Error ? err.message : 'Unknown error'}\n`);
    }
  },

  appendOutput: (text: string) => {
    set((state) => {
      const newOutput = state.output + text;
      const newLines = newOutput.split('\n');
      // Keep last 5000 lines to prevent memory issues
      const trimmedLines = newLines.slice(-5000);
      return {
        output: trimmedLines.join('\n'),
        outputLines: trimmedLines,
      };
    });
  },

  clearOutput: () => {
    set({ output: '', outputLines: [] });
  },

  // History Actions
  addToHistory: (command: string) => {
    set((state) => {
      // Don't add duplicates of the last command
      if (state.commandHistory[0] === command) {
        return { historyIndex: -1, currentInput: '' };
      }
      return {
        commandHistory: [command, ...state.commandHistory].slice(0, 100),
        historyIndex: -1,
        currentInput: '',
      };
    });
  },

  historyUp: () => {
    const state = get();
    const newIndex = Math.min(state.historyIndex + 1, state.commandHistory.length - 1);
    if (newIndex >= 0 && newIndex < state.commandHistory.length) {
      const command = state.commandHistory[newIndex]!;
      set({ historyIndex: newIndex });
      return command;
    }
    return state.currentInput;
  },

  historyDown: () => {
    const state = get();
    const newIndex = state.historyIndex - 1;
    if (newIndex >= 0) {
      const command = state.commandHistory[newIndex]!;
      set({ historyIndex: newIndex });
      return command;
    }
    set({ historyIndex: -1 });
    return state.currentInput;
  },

  setCurrentInput: (input: string) => {
    set({ currentInput: input, historyIndex: -1 });
  },

  // Autocomplete Actions
  updateSuggestions: (input: string) => {
    const { availableCommands, parameters } = get();
    const suggestions = getSuggestions(input, availableCommands, parameters);
    set({
      suggestions,
      selectedSuggestion: 0,
      showSuggestions: suggestions.length > 0,
    });
  },

  selectNextSuggestion: () => {
    set((state) => ({
      selectedSuggestion: Math.min(state.selectedSuggestion + 1, state.suggestions.length - 1),
    }));
  },

  selectPrevSuggestion: () => {
    set((state) => ({
      selectedSuggestion: Math.max(state.selectedSuggestion - 1, 0),
    }));
  },

  applySuggestion: () => {
    const { suggestions, selectedSuggestion } = get();
    if (suggestions.length > 0 && selectedSuggestion < suggestions.length) {
      const suggestion = suggestions[selectedSuggestion]!;
      set({ showSuggestions: false });
      return suggestion;
    }
    return '';
  },

  hideSuggestions: () => {
    set({ showSuggestions: false });
  },

  // Parse Actions
  parseDump: (dumpOutput: string) => {
    const parameters = parseDumpOutput(dumpOutput);
    set({ parameters, hasDumpData: true });
    console.log(`[CLI Store] Parsed ${parameters.size} parameters from dump`);
  },

  parseHelp: (helpOutput: string) => {
    const commands = parseHelpOutput(helpOutput);
    if (commands.length > 0) {
      set({ availableCommands: commands });
      console.log(`[CLI Store] Parsed ${commands.length} commands from help`);
    }
  },

  fetchDump: async () => {
    try {
      const dumpOutput = await window.electronAPI.cliGetDump();
      get().parseDump(dumpOutput);
    } catch (err) {
      console.error('[CLI Store] Failed to fetch dump:', err);
    }
  },

  // Reset
  reset: () => {
    set({
      isCliMode: false,
      isEntering: false,
      isExiting: false,
      output: '',
      outputLines: [],
      historyIndex: -1,
      currentInput: '',
      suggestions: [],
      selectedSuggestion: 0,
      showSuggestions: false,
      // Keep parameters and commands across reset
    });
  },
}));

// =============================================================================
// Setup CLI data listener
// =============================================================================

let cleanupListener: (() => void) | null = null;

export function setupCliDataListener(): void {
  if (cleanupListener) {
    cleanupListener();
  }

  cleanupListener = window.electronAPI.onCliData((data) => {
    const store = useCliStore.getState();
    store.appendOutput(data);

    // Check if this looks like help output
    if (data.includes('adjrange') && data.includes('aux') && data.includes('beeper')) {
      store.parseHelp(data);
    }

    // Check if this looks like dump output
    if (data.includes('set ') && data.includes(' = ')) {
      store.parseDump(data);
    }
  });
}

export function cleanupCliDataListener(): void {
  if (cleanupListener) {
    cleanupListener();
    cleanupListener = null;
  }
}
