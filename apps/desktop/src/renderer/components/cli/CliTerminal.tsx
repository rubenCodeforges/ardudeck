/**
 * CLI Terminal Component
 *
 * Full terminal emulation using xterm.js for iNav/Betaflight CLI access.
 * Features:
 * - ANSI color support
 * - Command history (up/down arrows)
 * - Tab completion for commands and parameters
 * - Autocomplete popup with suggestions
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useCliStore } from '../../stores/cli-store';
import { useConnectionStore } from '../../stores/connection-store';

interface CliTerminalProps {
  onReady?: () => void;
}

export default function CliTerminal({ onReady }: CliTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const inputBufferRef = useRef<string>('');
  const [isReady, setIsReady] = useState(false);

  const {
    isCliMode,
    isEntering,
    enterCliMode,
    exitCliMode,
    sendCommand,
    suggestions,
    selectedSuggestion,
    showSuggestions,
    updateSuggestions,
    selectNextSuggestion,
    selectPrevSuggestion,
    hideSuggestions,
    historyUp,
    historyDown,
  } = useCliStore();

  const { connectionState } = useConnectionStore();

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
      theme: {
        background: '#18181b', // zinc-900
        foreground: '#fafafa', // zinc-50
        cursor: '#3b82f6', // blue-500
        cursorAccent: '#18181b',
        selectionBackground: '#3b82f666',
        black: '#27272a',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#fafafa',
        brightBlack: '#52525b',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
      scrollback: 5000,
      convertEol: true,
      rightClickSelectsWord: true,
      allowProposedApi: true, // For clipboard addon
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle input
    term.onData((data) => {
      handleInput(data);
    });

    // Handle copy/paste - make Ctrl+C/V work intuitively
    // IMPORTANT: Only handle keydown, not keyup (event fires for both!)
    term.attachCustomKeyEventHandler((event) => {
      // Only process keydown events to prevent double-firing
      if (event.type !== 'keydown') return true;

      // Ctrl+C - Smart: copy if selection, interrupt if not
      if (event.ctrlKey && !event.shiftKey && event.key === 'c') {
        const selection = term.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
          term.clearSelection();
          return false; // Handled - don't send ^C
        }
        // No selection - let it pass through to send ^C interrupt
        return true;
      }
      // Ctrl+Shift+C - Always copy
      if (event.ctrlKey && event.shiftKey && event.key === 'C') {
        const selection = term.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
          term.clearSelection();
        }
        return false;
      }
      // Ctrl+V - Paste
      if (event.ctrlKey && !event.shiftKey && event.key === 'v') {
        navigator.clipboard.readText().then((text) => {
          const cleanText = text.replace(/[\r\n]/g, ' ');
          inputBufferRef.current += cleanText;
          term.write(cleanText);
        });
        return false;
      }
      // Ctrl+Shift+V - Also paste
      if (event.ctrlKey && event.shiftKey && event.key === 'V') {
        navigator.clipboard.readText().then((text) => {
          const cleanText = text.replace(/[\r\n]/g, ' ');
          inputBufferRef.current += cleanText;
          term.write(cleanText);
        });
        return false;
      }
      return true;
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    });
    resizeObserver.observe(terminalRef.current);

    // Note: CLI data listener is set up globally in App.tsx

    // Write welcome message - helper to pad lines to exact width
    const C = '\x1b[1;36m'; // cyan
    const Y = '\x1b[1;33m'; // yellow
    const G = '\x1b[1;32m'; // green
    const M = '\x1b[1;35m'; // magenta
    const R = '\x1b[0m';    // reset

    // Build each line with exact character counts, then pad
    const W = 46; // content width between borders
    const line = (text: string, visibleLen: number) => {
      const padding = ' '.repeat(Math.max(0, W - visibleLen));
      return `${C}║${R}${text}${padding}${C}║${R}`;
    };

    term.writeln(`${C}╔${'═'.repeat(W)}╗${R}`);
    term.writeln(line(`  ${Y}ArduDeck CLI Terminal${R}`, 23));
    term.writeln(`${C}╠${'═'.repeat(W)}╣${R}`);
    term.writeln(line(`  Type ${G}help${R} for available commands`, 34));
    term.writeln(line(`  Type ${G}dump${R} for full config (autocomplete)`, 42));
    term.writeln(line(`  Press ${M}Tab${R} for command completion`, 34));
    term.writeln(line(`  Press ${M}Up/Down${R} for command history`, 35));
    term.writeln(`${C}╚${'═'.repeat(W)}╝${R}`);
    term.writeln('');

    // Restore previous session output (persists across view switches)
    const storedOutput = useCliStore.getState().output;
    if (storedOutput) {
      term.writeln('\x1b[90m--- Previous session output ---\x1b[0m');
      term.write(storedOutput);
    }

    setIsReady(true);
    onReady?.();

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Write incoming CLI data to terminal
  useEffect(() => {
    const unsubscribe = window.electronAPI.onCliData((data) => {
      if (xtermRef.current) {
        xtermRef.current.write(data);
      }
    });

    return () => { unsubscribe(); };
  }, []);

  // Clear xterm when store output is cleared
  useEffect(() => {
    const unsubscribe = useCliStore.subscribe(
      (state, prevState) => {
        // If output was cleared (went from non-empty to empty)
        if (prevState.output && !state.output && xtermRef.current) {
          xtermRef.current.clear();
          xtermRef.current.writeln('\x1b[90m--- Terminal cleared ---\x1b[0m');
        }
      }
    );

    return () => unsubscribe();
  }, []);

  // Auto-enter CLI mode when connected to MSP board
  // NOTE: Cleanup/exit is handled by CliView parent component - NOT here!
  // Having both try to exit causes a race condition that breaks the connection.
  useEffect(() => {
    if (connectionState.isConnected && connectionState.protocol === 'msp' && !isCliMode && !isEntering) {
      enterCliMode();
    }
  }, [connectionState.isConnected, connectionState.protocol, isCliMode, isEntering, enterCliMode]);

  // Clear current input line
  const clearCurrentLine = useCallback(() => {
    const term = xtermRef.current;
    if (!term) return;

    // Move cursor to start and clear line
    const len = inputBufferRef.current.length;
    if (len > 0) {
      term.write('\x1b[' + len + 'D'); // Move cursor left
      term.write('\x1b[K'); // Clear to end of line
    }
  }, []);

  // Write prompt
  const writePrompt = useCallback(() => {
    const term = xtermRef.current;
    if (!term) return;
    term.write('\x1b[1;32m# \x1b[0m');
  }, []);

  // Handle terminal input
  const handleInput = useCallback((data: string) => {
    const term = xtermRef.current;
    if (!term) return;

    for (const char of data) {
      const code = char.charCodeAt(0);

      // Enter key
      if (code === 13) {
        const command = inputBufferRef.current.trim();
        term.writeln(''); // New line

        if (command) {
          sendCommand(command);
        } else {
          writePrompt();
        }

        inputBufferRef.current = '';
        hideSuggestions();
        continue;
      }

      // Backspace
      if (code === 127 || code === 8) {
        if (inputBufferRef.current.length > 0) {
          inputBufferRef.current = inputBufferRef.current.slice(0, -1);
          term.write('\b \b');
          updateSuggestions(inputBufferRef.current);
        }
        continue;
      }

      // Escape key - hide suggestions
      if (code === 27) {
        // Check for escape sequences (arrow keys, etc.)
        const nextChars = data.slice(data.indexOf(char) + 1, data.indexOf(char) + 3);

        // Up arrow: \x1b[A
        if (nextChars === '[A') {
          const prevCommand = historyUp();
          if (prevCommand) {
            clearCurrentLine();
            inputBufferRef.current = prevCommand;
            term.write(prevCommand);
          }
          continue;
        }

        // Down arrow: \x1b[B
        if (nextChars === '[B') {
          const nextCommand = historyDown();
          clearCurrentLine();
          inputBufferRef.current = nextCommand;
          term.write(nextCommand);
          continue;
        }

        // Just escape - hide suggestions
        hideSuggestions();
        continue;
      }

      // Tab key - autocomplete
      if (code === 9) {
        // Use getState() to get current values, not stale closure values
        const currentState = useCliStore.getState();
        if (currentState.showSuggestions && currentState.suggestions.length > 0) {
          const suggestion = currentState.applySuggestion();
          if (suggestion) {
            clearCurrentLine();
            inputBufferRef.current = suggestion + ' ';
            term.write(suggestion + ' ');
          }
        } else {
          updateSuggestions(inputBufferRef.current);
        }
        continue;
      }

      // Ctrl+C - abort
      if (code === 3) {
        term.writeln('^C');
        inputBufferRef.current = '';
        hideSuggestions();
        writePrompt();
        continue;
      }

      // Ctrl+L - clear screen
      if (code === 12) {
        term.clear();
        writePrompt();
        term.write(inputBufferRef.current);
        continue;
      }

      // Regular character
      if (code >= 32 && code < 127) {
        inputBufferRef.current += char;
        term.write(char);
        updateSuggestions(inputBufferRef.current);
      }
    }
  }, [sendCommand, hideSuggestions, updateSuggestions, historyUp, historyDown, clearCurrentLine, writePrompt]);

  // Handle suggestion selection with keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showSuggestions) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectNextSuggestion();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectPrevSuggestion();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSuggestions, selectNextSuggestion, selectPrevSuggestion]);

  return (
    <div className="relative h-full flex flex-col">
      {/* Terminal */}
      <div
        ref={terminalRef}
        className="flex-1 bg-zinc-900 rounded-lg overflow-hidden"
        style={{ minHeight: '300px' }}
      />

      {/* Autocomplete Popup */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute bottom-16 left-4 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-48 overflow-y-auto z-10">
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion}
              className={`px-3 py-1.5 text-sm cursor-pointer ${
                index === selectedSuggestion
                  ? 'bg-blue-500/30 text-blue-300'
                  : 'text-zinc-300 hover:bg-zinc-700'
              }`}
              onClick={() => {
                const term = xtermRef.current;
                if (term) {
                  clearCurrentLine();
                  inputBufferRef.current = suggestion + ' ';
                  term.write(suggestion + ' ');
                  hideSuggestions();
                  term.focus();
                }
              }}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}

      {/* Status Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-t border-zinc-700/50 text-xs">
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-1 ${isCliMode ? 'text-green-400' : 'text-zinc-500'}`}>
            <span className={`w-2 h-2 rounded-full ${isCliMode ? 'bg-green-400' : 'bg-zinc-500'}`} />
            {isCliMode ? 'CLI Mode' : 'MSP Mode'}
          </span>
          {connectionState.fcVariant && (
            <span className="text-zinc-400">
              {connectionState.fcVariant} {connectionState.fcVersion}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-zinc-500">
          <span>Tab: Complete</span>
          <span>|</span>
          <span>Up/Down: History</span>
          <span>|</span>
          <span>Ctrl+C: Copy/Abort</span>
          <span>|</span>
          <span>Ctrl+V: Paste</span>
        </div>
      </div>
    </div>
  );
}
