'use client';

import React from 'react';
import { ReliabilityResult, incidentFreeProbability } from '@/lib/sla-calculator';

const DAY = 24 * 60;
const WINDOWS: [string, number][] = [
  ['Week', 7 * DAY],
  ['Month', 30.44 * DAY],
  ['Quarter', 91.31 * DAY],
  ['Year', 365.25 * DAY],
];

/** "99.4%", "37%", "< 0.1%": enough precision to tell close values apart */
export const formatProbability = (p: number): string => {
  const percent = p * 100;
  if (percent >= 99.995) return '> 99.99%';
  if (percent < 0.1) return '< 0.1%';
  if (percent >= 99) return `${percent.toFixed(2)}%`;
  if (percent >= 10) return `${percent.toFixed(1)}%`;
  return `${percent.toFixed(2)}%`;
};

interface IncidentFreeOddsProps {
  reliability: ReliabilityResult;
  missionHours: number;
  onMissionHoursChange: (hours: number) => void;
}

/** Chance of getting through common periods (and a custom window) without an incident. */
const IncidentFreeOdds: React.FC<IncidentFreeOddsProps> = ({ reliability, missionHours, onMissionHoursChange }) => (
  <div className="mt-4 space-y-2">
    <div className="text-slate-400 text-sm" title="Probability of no incident, starting from a working system">Incident-free chance</div>
    <div className="grid grid-cols-4 gap-2">
      {WINDOWS.map(([label, minutes]) => (
        <div key={label} className="bg-slate-800/60 rounded-lg px-2 py-1.5 text-center">
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
          <div className="font-mono text-xs font-medium">{formatProbability(incidentFreeProbability(reliability, minutes))}</div>
        </div>
      ))}
    </div>
    <div className="flex items-center justify-between gap-2 pt-1">
      <label className="text-slate-400 text-xs flex items-center gap-2">
        Next
        <input
          type="number"
          min="0.1"
          step="0.5"
          value={missionHours}
          onChange={(e) => {
            const value = parseFloat(e.target.value);
            if (Number.isFinite(value) && value > 0) onMissionHoursChange(value);
          }}
          className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 font-mono text-xs text-white outline-none focus:border-blue-500"
          aria-label="Mission length in hours"
        />
        hours
      </label>
      <span className="font-mono text-sm font-medium">{formatProbability(incidentFreeProbability(reliability, missionHours * 60))}</span>
    </div>
  </div>
);

export default IncidentFreeOdds;
