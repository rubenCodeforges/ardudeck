/**
 * Px4ConfigNotice
 *
 * Neutral placeholder shown in ArduPilot-parameter-specific config tabs when a
 * PX4 vehicle is connected. These tabs read/write ArduPilot-only parameter
 * names (BATT_*, RCx_, SERVOx_, FENCE_*, etc.) that do not exist on PX4, so the
 * normal content would be empty or misleading. We point the user at the raw
 * Parameters tab, which works for any MAVLink firmware.
 */

import React from 'react';
import { Info } from 'lucide-react';

const Px4ConfigNotice: React.FC<{ message: string }> = ({ message }) => (
  <div className="p-6">
    <div className="max-w-md mx-auto mt-10 bg-surface rounded-xl border border-subtle p-6 text-center">
      <div className="w-10 h-10 rounded-lg bg-surface-raised flex items-center justify-center mx-auto mb-4">
        <Info className="w-5 h-5 text-content-secondary" />
      </div>
      <p className="text-sm text-content-secondary leading-relaxed">{message}</p>
    </div>
  </div>
);

export default Px4ConfigNotice;
