/**
 * RubyFPV OSD destination bar - shown in the OSD Designer's RubyFPV mode.
 *
 * RubyFPV renders its OSD on the GROUND unit (a Raspberry Pi / Radxa running
 * RubyFPV), not in the flight controller. ArduDeck authors the layout here and
 * delivers it to that board over the ArduDeck Agent; RubyFPV then draws it over
 * your video. This bar makes that path unmistakable - Author -> Agent -> ground
 * board -> video overlay, with the flight controller shown as not involved -
 * and offers the layout export (the direct Agent push is the device-gated
 * follow-up).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Radio, PencilRuler, Cpu, MonitorPlay, ChevronRight, Download, type LucideIcon } from 'lucide-react';
import { serializeOsdBlock } from '../../utils/osd/ruby-osd';
import { useRubyOsdStore } from '../../stores/ruby-osd-store';

export function RubyOsdDestinationBar() {
  const { t } = useTranslation();
  const params = useRubyOsdStore((s) => s.params);
  const [saved, setSaved] = useState(false);

  const exportLayout = () => {
    // Emit a valid RubyFPV v12 OSD block (the exact text spliced into ctrl-N.mdl).
    const block = serializeOsdBlock(params);
    const blob = new Blob([block + '\n'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rubyfpv-osd-block.txt';
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-subtle bg-gradient-to-r from-rose-500/10 via-rose-500/[0.04] to-transparent shrink-0 flex-wrap">
      {/* Identity pill */}
      <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-400/30">
        <Radio className="h-3.5 w-3.5 text-rose-300" />
        <span className="text-xs font-medium text-content">{t('osd:rubyOsdDestinationBar.groundOsd')}</span>
      </div>

      {/* The delivery path, drawn out */}
      <div className="flex items-center gap-1.5">
        <FlowNode icon={PencilRuler} label={t('osd:rubyOsdDestinationBar.authorHere')} active />
        <ChevronRight className="h-3.5 w-3.5 text-content-tertiary" aria-hidden />
        {/* i18n-exempt */}
        <FlowNode icon={Radio} label="ArduDeck Agent" />
        <ChevronRight className="h-3.5 w-3.5 text-content-tertiary" aria-hidden />
        <FlowNode icon={Cpu} label={t('osd:rubyOsdDestinationBar.groundBoard')} />
        <ChevronRight className="h-3.5 w-3.5 text-content-tertiary" aria-hidden />
        <FlowNode icon={MonitorPlay} label={t('osd:rubyOsdDestinationBar.drawnOverVideo')} />
      </div>

      <div className="flex-1" />

      {/* Export today; direct push is the device-gated next step. */}
      <button
        onClick={exportLayout}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-600/80 hover:bg-rose-500/80 text-white"
        data-tip={t('osd:rubyOsdDestinationBar.exportTip')}
      >
        <Download className="h-3.5 w-3.5" />
        {saved ? t('common:saved') : t('osd:rubyOsdDestinationBar.exportBlock')}
      </button>

      <span className="text-[10px] text-content-tertiary">{t('osd:rubyOsdDestinationBar.fcNotInvolved')}</span>
    </div>
  );
}

function FlowNode({ icon: Icon, label, active }: { icon: LucideIcon; label: string; active?: boolean }) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${
        active ? 'bg-rose-500/15 text-content' : 'bg-surface-raised text-content-secondary'
      }`}
    >
      <Icon className={`h-3.5 w-3.5 ${active ? 'text-rose-300' : 'text-content-tertiary'}`} />
      <span className="text-[11px]">{label}</span>
    </div>
  );
}
