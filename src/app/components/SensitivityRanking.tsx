'use client';

import React, { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import SidebarSection from '@/app/components/SidebarSection';
import { SensitivityEntry, formatDuration } from '@/lib/sla-calculator';

const COLLAPSED_COUNT = 5;

const SensitivityRanking: React.FC<{ ranking: SensitivityEntry[] }> = ({ ranking }) => {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? ranking : ranking.slice(0, COLLAPSED_COUNT);
  const max = ranking[0]?.downtimeSavedPerYear || 1;

  return (
    <SidebarSection
      id="levers"
      title="Improvement Levers"
      icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
    >
      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
        Yearly downtime saved if the item or failure domain never failed. Work on the top entries first.
      </p>

      {ranking.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">No single item or domain limits the system SLA.</p>
      ) : (
        <ol className="space-y-3">
          {visible.map((entry, index) => (
            <li key={entry.id} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-slate-700 dark:text-slate-200 font-medium" title={entry.name}>
                  <span className="text-slate-400 font-mono mr-1.5">{index + 1}.</span>
                  {entry.name}
                  {entry.type !== 'component' && <span className="ml-1.5 text-[9px] uppercase font-bold text-slate-400">{entry.type}</span>}
                </span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                  −{formatDuration(entry.downtimeSavedPerYear)}/yr
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${Math.max(2, (entry.downtimeSavedPerYear / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}

      {ranking.length > COLLAPSED_COUNT && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 hover:underline"
        >
          {expanded ? 'Show fewer' : `Show all ${ranking.length}`}
        </button>
      )}
    </SidebarSection>
  );
};

export default SensitivityRanking;
