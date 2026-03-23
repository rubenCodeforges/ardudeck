/**
 * Companion Board Store — full-page tab for browsing templates, flashing ESP32, and installing agent.
 * Reuses the same board/template selection flow as the old dialog, but as tab content.
 */
import { useState, useCallback, useEffect } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Wifi,
  Radio,
  Video,
  Cpu,
  ExternalLink,
  Copy,
  Check,
  Usb,
  HardDrive,
  Terminal,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import {
  COMPANION_TEMPLATES,
  BOARD_FAMILIES,
  CATEGORY_STYLE,
  FALLBACK_STYLE,
  type CompanionTemplate,
  type BoardFamily,
} from './companion-templates';

// ── Per-template icons ──────────────────────────────────────────

const TEMPLATE_ICON: Record<string, LucideIcon> = {
  'dronebridge-wifi': Wifi,
  'dronebridge-espnow': Radio,
  'esp32-mavlink-bridge': Wifi,
  'pi-telemetry-bridge': Wifi,
  'pi-video-telemetry': Video,
  'rpanion-server': Cpu,
  'blueos': HardDrive,
  'pi-mavsdk-autonomy': Terminal,
  'openhd-air': Video,
  'jetson-cv-companion': Cpu,
};

const FLASH_METHOD_LABEL: Record<string, { label: string; icon: LucideIcon; description: string }> = {
  serial: { label: 'USB Flash', icon: Usb, description: 'Connect board via USB and flash directly' },
  image: { label: 'SD Card Image', icon: HardDrive, description: 'Download image and write to SD card' },
  script: { label: 'Install Script', icon: Terminal, description: 'Run install script on the board' },
};

// ── Board Selection View ────────────────────────────────────────

function BoardSelectionView({ onSelectBoard }: { onSelectBoard: (board: BoardFamily) => void }) {
  const boardEntries = Object.entries(BOARD_FAMILIES) as [BoardFamily, typeof BOARD_FAMILIES[BoardFamily]][];
  const templateCounts = Object.fromEntries(
    boardEntries.map(([key]) => [key, COMPANION_TEMPLATES.filter((t) => t.board === key).length]),
  );

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-lg font-semibold text-gray-100">Companion Board Store</h2>
        <p className="text-xs text-gray-500">
          Select your board to browse pre-configured firmware and software templates.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {boardEntries.map(([key, board]) => (
          <button
            key={key}
            onClick={() => onSelectBoard(key)}
            disabled={templateCounts[key] === 0}
            className="group text-left rounded-xl border border-gray-700/30 bg-gray-800/50 hover:bg-gray-800 transition-all duration-200 hover:border-gray-600/50 hover:shadow-lg hover:shadow-black/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <div className="p-6">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={board.icon} />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">{board.name}</div>
                  <div className="text-[11px] text-gray-500 leading-relaxed mt-1">{board.description}</div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-700/20">
                <span className="text-[10px] text-gray-600">
                  {templateCounts[key]} template{templateCounts[key] !== 1 ? 's' : ''}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-gray-700 group-hover:text-gray-400 transition-colors" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Template List View ──────────────────────────────────────────

function TemplateListView({
  board,
  onBack,
  onSelectTemplate,
}: {
  board: BoardFamily;
  onBack: () => void;
  onSelectTemplate: (template: CompanionTemplate) => void;
}) {
  const boardInfo = BOARD_FAMILIES[board];
  const templates = COMPANION_TEMPLATES.filter((t) => t.board === board);
  const categories = [...new Set(templates.map((t) => t.category))];

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-5">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All boards
      </button>

      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
          <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={boardInfo.icon} />
          </svg>
        </div>
        <div>
          <div className="text-sm font-medium text-gray-200">{boardInfo.name}</div>
          <div className="text-[10px] text-gray-500">{templates.length} available templates</div>
        </div>
      </div>

      {categories.map((cat) => {
        const style = CATEGORY_STYLE[cat] ?? FALLBACK_STYLE;
        return (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded border ${style.badge}`}>
                {cat}
              </span>
              <div className="flex-1 h-px bg-gray-800" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {templates.filter((t) => t.category === cat).map((template) => {
                const Icon = TEMPLATE_ICON[template.id] ?? Cpu;
                const flash = FLASH_METHOD_LABEL[template.flashMethod];

                return (
                  <button
                    key={template.id}
                    onClick={() => onSelectTemplate(template)}
                    className={`group text-left rounded-xl border-t-2 border border-gray-700/30 bg-gray-800/50 hover:bg-gray-800 transition-all duration-200 hover:border-gray-600/50 hover:shadow-lg hover:shadow-black/20 ${style.accent}`}
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-3 mb-2.5">
                        <div className={`w-9 h-9 rounded-lg ${style.bg} flex items-center justify-center shrink-0`}>
                          <Icon className={`w-4.5 h-4.5 ${style.text}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-gray-200 group-hover:text-white transition-colors leading-tight">
                            {template.name}
                          </div>
                          <div className="text-[11px] text-gray-500 leading-relaxed mt-1 line-clamp-2">
                            {template.description}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-700/20">
                        {flash && (
                          <div className="flex items-center gap-1 text-[10px] text-gray-600">
                            <flash.icon className="w-3 h-3" />
                            <span>{flash.label}</span>
                          </div>
                        )}
                        <div className="text-[10px] text-gray-600">
                          {template.boardVariants.length} board{template.boardVariants.length !== 1 ? 's' : ''}
                        </div>
                        <div className="flex-1" />
                        <ArrowRight className="w-3.5 h-3.5 text-gray-700 group-hover:text-gray-400 transition-colors" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Template Detail View ────────────────────────────────────────

function TemplateDetailView({ template, onBack, onFlashComplete }: { template: CompanionTemplate; onBack: () => void; onFlashComplete?: (templateId: string, apIp?: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [selectedPort, setSelectedPort] = useState('');
  const [selectedChip, setSelectedChip] = useState(template.boardVariants[0] ?? '');
  const [ports, setPorts] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [flashProgress, setFlashProgress] = useState<{ state: string; progress: number; message: string } | null>(null);
  const [flashResult, setFlashResult] = useState<{ success: boolean; message: string } | null>(null);
  const style = CATEGORY_STYLE[template.category] ?? FALLBACK_STYLE;
  const Icon = TEMPLATE_ICON[template.id] ?? Cpu;
  const flash = FLASH_METHOD_LABEL[template.flashMethod];

  // Load ports on mount
  useState(() => {
    if (template.flashMethod === 'serial') {
      window.electronAPI?.listSerialPorts().then((result) => {
        if (result?.ports) setPorts(result.ports.map((port) => port.path));
      });
    }
  });

  // Listen for flash progress updates
  useEffect(() => {
    if (!flashing) return;
    const unsub = window.electronAPI?.onFlashProgress((progress) => {
      setFlashProgress({ state: progress.state, progress: progress.progress, message: progress.message });
    });
    return () => { unsub?.(); };
  }, [flashing]);

  const handleRefreshPorts = useCallback(async () => {
    setRefreshing(true);
    const result = await window.electronAPI?.listSerialPorts();
    if (result?.ports) setPorts(result.ports.map((port) => port.path));
    setRefreshing(false);
  }, []);

  const handleFlash = useCallback(async () => {
    if (!selectedPort || !selectedChip) return;
    setFlashing(true);
    setFlashResult(null);
    setFlashProgress({ state: 'preparing', progress: 0, message: 'Releasing serial port...' });

    // Release the port if ArduDeck is holding it open (e.g. connection panel)
    try { await window.electronAPI?.disconnect(); } catch { /* not connected, fine */ }
    // Small delay for OS to release the port
    await new Promise((r) => setTimeout(r, 500));

    const result = await window.electronAPI?.esp32FlashTemplate({
      templateId: template.id,
      port: selectedPort,
      detectedChip: selectedChip,
      eraseAll: true,
    });
    setFlashing(false);
    setFlashProgress(null);
    if (result) {
      const serialInfo = result.serialInfo;
      const ssidMsg = serialInfo?.ssid ? ` WiFi: "${serialInfo.ssid}"` : '';
      const ipMsg = serialInfo?.apIp ? ` IP: ${serialInfo.apIp}` : '';

      setFlashResult({
        success: result.success,
        message: result.success
          ? `Flash complete!${ssidMsg}${ipMsg}`
          : (result.error ?? 'Flash failed'),
      });
      if (result.success) {
        onFlashComplete?.(template.id, serialInfo?.apIp ?? undefined);
      }
    }
  }, [selectedPort, selectedChip, template.id, onFlashComplete]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-5">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to templates
      </button>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl ${style.bg} flex items-center justify-center shrink-0`}>
          <Icon className={`w-6 h-6 ${style.text}`} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">{template.name}</h3>
          <p className="text-xs text-gray-400 mt-1">{template.description}</p>
          {template.projectName && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px] text-gray-600">Powered by</span>
              {template.projectUrl ? (
                <a
                  href={template.projectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
                  onClick={(e) => { e.preventDefault(); window.open(template.projectUrl, '_blank'); }}
                >
                  {template.projectName}
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              ) : (
                <span className="text-[10px] text-gray-500">{template.projectName}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Supported boards */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-4">
        <h4 className="text-xs font-medium text-gray-300 mb-2">Supported Boards</h4>
        <div className="flex flex-wrap gap-1.5">
          {template.boardVariants.map((variant) => (
            <span key={variant} className="px-2 py-0.5 bg-gray-700/40 rounded text-[11px] text-gray-400">{variant}</span>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-4">
        <h4 className="text-xs font-medium text-gray-300 mb-2">Features</h4>
        <ul className="space-y-1.5">
          {template.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-[11px] text-gray-400">
              <Check className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
              {feature}
            </li>
          ))}
        </ul>
      </div>

      {/* Requirements */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-4">
        <h4 className="text-xs font-medium text-gray-300 mb-2">Requirements</h4>
        <ul className="space-y-1.5">
          {template.requirements.map((req) => (
            <li key={req} className="flex items-start gap-2 text-[11px] text-gray-400">
              <span className="text-gray-600 mt-0.5 shrink-0">-</span>
              {req}
            </li>
          ))}
        </ul>
      </div>

      {/* Setup / Flash */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          {flash && <flash.icon className="w-4 h-4 text-gray-400" />}
          <h4 className="text-xs font-medium text-gray-300">{flash?.label ?? 'Setup'}: {flash?.description ?? ''}</h4>
        </div>

        {template.flashMethod === 'serial' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[11px] text-gray-500">Serial Port</label>
                <div className="flex gap-1.5">
                  <select
                    value={selectedPort}
                    onChange={(e) => setSelectedPort(e.target.value)}
                    disabled={flashing}
                    className="flex-1 bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50"
                  >
                    <option value="">Select port...</option>
                    {ports.map((port) => (
                      <option key={port} value={port}>{port}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleRefreshPorts}
                    disabled={refreshing || flashing}
                    className="px-2 py-2 bg-gray-700/50 hover:bg-gray-600/50 disabled:opacity-40 text-gray-300 rounded-lg transition-colors"
                    title="Refresh port list"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[11px] text-gray-500">Board</label>
                <select
                  value={selectedChip}
                  onChange={(e) => setSelectedChip(e.target.value)}
                  disabled={flashing}
                  className="w-full bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50"
                >
                  {template.boardVariants.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Progress indicator during flash */}
            {flashing && flashProgress && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-400">{flashProgress.message}</span>
                  <span className="text-gray-500">{flashProgress.progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${flashProgress.progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Flash result */}
            {!flashing && flashResult && (
              <div className={`rounded-lg p-2.5 ${
                flashResult.success
                  ? 'bg-emerald-500/10 border border-emerald-500/20'
                  : 'bg-red-500/10 border border-red-500/20'
              }`}>
                <span className={`text-xs ${flashResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                  {flashResult.message}
                </span>
                {flashResult.success && template.id.startsWith('dronebridge') && (
                  <p className="text-[10px] text-emerald-400/60 mt-1">
                    Connect to the DroneBridge WiFi network, then check the DroneBridge tab.
                  </p>
                )}
              </div>
            )}

            <button
              onClick={handleFlash}
              disabled={!selectedPort || flashing}
              className="w-full py-2.5 bg-blue-600/80 hover:bg-blue-500/80 disabled:bg-gray-700/50 disabled:text-gray-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Usb className="w-4 h-4" />
              {flashing ? 'Flashing...' : 'Flash Firmware'}
            </button>
            <p className="text-[10px] text-gray-600 text-center">
              Downloads esptool and firmware automatically. Just plug in and flash.
            </p>
          </div>
        )}

        {template.flashMethod === 'image' && (
          <div className="space-y-4">
            {/* Download image button */}
            {template.imageUrl && (
              <a
                href={template.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { e.preventDefault(); window.open(template.imageUrl, '_blank'); }}
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-blue-600/80 hover:bg-blue-500/80 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <HardDrive className="w-4 h-4" />
                Download Image
                <ExternalLink className="w-3 h-3 opacity-60" />
              </a>
            )}

            {/* Steps */}
            <div className="space-y-2">
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center text-[10px] font-medium shrink-0 mt-0.5">1</div>
                <p className="text-[11px] text-gray-400">Download the SD card image from the link above</p>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center text-[10px] font-medium shrink-0 mt-0.5">2</div>
                <div className="text-[11px] text-gray-400">
                  Flash to MicroSD using{' '}
                  <a href="https://www.raspberrypi.com/software/" target="_blank" rel="noopener noreferrer"
                    onClick={(e) => { e.preventDefault(); window.open('https://www.raspberrypi.com/software/', '_blank'); }}
                    className="text-blue-400 hover:text-blue-300">Raspberry Pi Imager</a>
                  {' '}or{' '}
                  <a href="https://etcher.balena.io/" target="_blank" rel="noopener noreferrer"
                    onClick={(e) => { e.preventDefault(); window.open('https://etcher.balena.io/', '_blank'); }}
                    className="text-blue-400 hover:text-blue-300">Balena Etcher</a>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center text-[10px] font-medium shrink-0 mt-0.5">3</div>
                <p className="text-[11px] text-gray-400">Insert SD card, power on, and connect to the board's WiFi</p>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center text-[10px] font-medium shrink-0 mt-0.5">4</div>
                <p className="text-[11px] text-gray-400">Open the Dashboard tab to monitor your companion</p>
              </div>
            </div>

            {/* Alternative: install on existing OS */}
            {template.installCommand && (
              <div className="pt-2 border-t border-gray-700/20">
                <p className="text-[10px] text-gray-500 mb-2">Alternative: install on an existing Raspberry Pi OS setup</p>
                <div className="relative">
                  <div className="bg-gray-900/60 rounded-lg px-3 py-2 font-mono text-xs text-gray-400 pr-10 select-all overflow-x-auto">
                    {template.installCommand}
                  </div>
                  <button
                    onClick={() => handleCopy(template.installCommand!)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-700/50 text-gray-600 hover:text-gray-400 transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {template.flashMethod === 'script' && template.installCommand && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-[11px] text-gray-400">1. SSH into your {BOARD_FAMILIES[template.board].name}</p>
              <p className="text-[11px] text-gray-400">2. Run the install command below</p>
              <p className="text-[11px] text-gray-400">3. Follow the on-screen prompts</p>
            </div>
            <div className="relative">
              <div className="bg-gray-900/60 rounded-lg px-3 py-2 font-mono text-xs text-gray-400 pr-10 select-all overflow-x-auto">
                {template.installCommand}
              </div>
              <button
                onClick={() => handleCopy(template.installCommand!)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-700/50 text-gray-600 hover:text-gray-400 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Project link */}
      {template.projectUrl && (
        <a
          href={template.projectUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          onClick={(e) => { e.preventDefault(); window.open(template.projectUrl, '_blank'); }}
        >
          View project on GitHub
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

// ── Main Store Tab ──────────────────────────────────────────────

export function CompanionStoreTab({ onFlashComplete }: { onFlashComplete?: (templateId: string, apIp?: string) => void }) {
  const [selectedBoard, setSelectedBoard] = useState<BoardFamily | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<CompanionTemplate | null>(null);

  return (
    <div className="h-full overflow-y-auto">
      {selectedTemplate ? (
        <TemplateDetailView template={selectedTemplate} onBack={() => setSelectedTemplate(null)} onFlashComplete={onFlashComplete} />
      ) : selectedBoard ? (
        <TemplateListView board={selectedBoard} onBack={() => setSelectedBoard(null)} onSelectTemplate={setSelectedTemplate} />
      ) : (
        <BoardSelectionView onSelectBoard={setSelectedBoard} />
      )}
    </div>
  );
}
