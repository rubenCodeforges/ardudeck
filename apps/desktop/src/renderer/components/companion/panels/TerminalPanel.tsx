import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useCompanionStore } from '../../../stores/companion-store';
import { PanelContainer } from '../../panels/panel-utils';
import { useTranslation } from 'react-i18next';

export function TerminalPanel() {
  const { t } = useTranslation();
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
    term.writeln(`${C}${t('companion:terminal.bannerTitle')}${R}`);
    term.writeln(`${G}${t('companion:terminal.bannerConnected')}${R}`);
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
        <div className="text-center text-content-tertiary text-xs">
          <div className="text-content-secondary mb-1">{t('companion:terminal.unavailable')}</div>
          <div>{t('companion:terminal.unavailableHint')}</div>
        </div>
      </PanelContainer>
    );
  }

  return (
    <div className="relative h-full flex flex-col">
      <div
        ref={terminalRef}
        className="flex-1 bg-surface-input rounded-lg overflow-hidden"
        style={{ minHeight: '200px' }}
      />

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-surface border-t border-subtle text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-green-400">{t('companion:terminal.ptyConnected')}</span>
          {connectionState.host && (
            <span className="text-content-secondary ml-1">{connectionState.host}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-content-secondary">
          <span>{t('companion:terminal.ctrlC')}</span>
          <span>|</span>
          <span>{t('companion:terminal.ctrlV')}</span>
        </div>
      </div>
    </div>
  );
}
