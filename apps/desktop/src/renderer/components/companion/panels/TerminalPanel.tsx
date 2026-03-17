import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useCompanionStore } from '../../../stores/companion-store';
import { PanelContainer } from '../../panels/panel-utils';

export function TerminalPanel() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const connectionState = useCompanionStore((s) => s.connectionState);
  const isConnected = connectionState.state === 'connected';

  // Initialize xterm.js terminal
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
      theme: {
        background: '#18181b',
        foreground: '#fafafa',
        cursor: '#3b82f6',
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
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Send user input to companion agent PTY
    term.onData((data) => {
      window.electronAPI.companionSendTerminalData(data);
    });

    // Handle copy/paste
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;

      // Ctrl+C — copy if selection, else pass through for interrupt
      if (event.ctrlKey && !event.shiftKey && event.key === 'c') {
        const selection = term.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
          term.clearSelection();
          return false;
        }
        return true;
      }

      // Ctrl+Shift+C — always copy
      if (event.ctrlKey && event.shiftKey && event.key === 'C') {
        const selection = term.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
          term.clearSelection();
        }
        return false;
      }

      // Ctrl+V — paste
      if (event.ctrlKey && !event.shiftKey && event.key === 'v') {
        navigator.clipboard.readText().then((text) => {
          window.electronAPI.companionSendTerminalData(text);
        });
        return false;
      }

      // Ctrl+Shift+V — also paste
      if (event.ctrlKey && event.shiftKey && event.key === 'V') {
        navigator.clipboard.readText().then((text) => {
          window.electronAPI.companionSendTerminalData(text);
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

    // Send terminal resize to agent after fit
    term.onResize(({ cols, rows }) => {
      window.electronAPI.companionResizeTerminal(cols, rows);
    });

    // Welcome message
    const C = '\x1b[1;36m';
    const G = '\x1b[1;32m';
    const R = '\x1b[0m';
    term.writeln(`${C}ArduDeck Companion Terminal${R}`);
    term.writeln(`${G}Connected to remote PTY on companion computer${R}`);
    term.writeln('');

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Receive PTY output from companion agent
  useEffect(() => {
    const unsubscribe = window.electronAPI.onCompanionTerminalData((data: string) => {
      if (xtermRef.current) {
        xtermRef.current.write(data);
      }
    });

    return () => { unsubscribe(); };
  }, []);

  // Re-fit terminal when connection state changes (panel may have been hidden)
  useEffect(() => {
    if (isConnected && fitAddonRef.current) {
      setTimeout(() => fitAddonRef.current?.fit(), 100);
    }
  }, [isConnected]);

  if (!isConnected) {
    return (
      <PanelContainer className="flex items-center justify-center">
        <div className="text-center text-gray-600 text-xs">
          <div className="text-gray-500 mb-1">Terminal unavailable</div>
          <div>Connect to companion agent to open a terminal session.</div>
        </div>
      </PanelContainer>
    );
  }

  return (
    <div className="relative h-full flex flex-col">
      <div
        ref={terminalRef}
        className="flex-1 bg-zinc-900 rounded-lg overflow-hidden"
        style={{ minHeight: '200px' }}
      />

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-zinc-800/50 border-t border-zinc-700/50 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-green-400">PTY Connected</span>
          {connectionState.host && (
            <span className="text-zinc-500 ml-1">{connectionState.host}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-zinc-500">
          <span>Ctrl+C: Copy/Interrupt</span>
          <span>|</span>
          <span>Ctrl+V: Paste</span>
        </div>
      </div>
    </div>
  );
}
