/**
 * OSD Context Panel
 *
 * Right-side panel wrapper that renders mode-dependent content:
 * - Demo: grouped value sliders
 * - Live: mode switches + collapsed RC
 * - Edit: position editor + alignment
 */

import type { OsdMode, OsdElementId } from '../../stores/osd-store';
import { OsdDemoPanel } from './OsdDemoPanel';
import { OsdLivePanel } from './OsdLivePanel';
import { OsdEditPanel } from './OsdEditPanel';

interface Props {
  mode: OsdMode;
  selectedElement: OsdElementId | null;
}

export function OsdContextPanel({ mode, selectedElement }: Props) {
  switch (mode) {
    case 'demo':
      return <OsdDemoPanel />;
    case 'live':
      return <OsdLivePanel />;
    case 'edit':
      return <OsdEditPanel selectedElement={selectedElement} />;
  }
}
