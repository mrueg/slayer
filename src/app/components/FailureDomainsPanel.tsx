'use client';

import React from 'react';
import { MapPinned, Plus, Trash2 } from 'lucide-react';
import { DomainImpact, FailureDomain, formatDuration, formatSLAPercentage, getDomainMttr } from '@/lib/sla-calculator';

interface FailureDomainsPanelProps {
  domains: FailureDomain[];
  impact: DomainImpact[];
  onAdd: () => void;
  onUpdate: (id: string, updates: Partial<FailureDomain>) => void;
  onRemove: (id: string) => void;
}

const inputClass = "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono text-xs dark:text-slate-200";

const FailureDomainsPanel: React.FC<FailureDomainsPanelProps> = ({ domains, impact, onAdd, onUpdate, onRemove }) => {
  const impactById = new Map(impact.map(entry => [entry.id, entry]));

  return (
    <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-4">
        <MapPinned className="w-4 h-4 text-violet-500" />
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white italic">Failure Domains</h3>
      </div>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
        Shared infrastructure such as a zone, region or provider. Tag items with a domain and they fail together when it fails.
      </p>

      <ul className="space-y-4">
        {domains.map(domain => {
          const entry = impactById.get(domain.id);
          return (
            <li key={domain.id} className="space-y-2" data-domain-id={domain.id}>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={domain.name}
                  onChange={(e) => onUpdate(domain.id, { name: e.target.value })}
                  className="flex-1 min-w-0 bg-transparent border-b border-slate-200 dark:border-slate-700 py-0.5 outline-none focus:border-blue-500 text-sm font-semibold text-slate-700 dark:text-slate-200"
                  aria-label="Domain name"
                />
                <button
                  onClick={() => onRemove(domain.id)}
                  className="p-1 text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors"
                  title="Remove domain (untags all items)"
                  aria-label={`Remove ${domain.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  SLA (%)
                  <input
                    type="number" min="0" max="100" step="0.001"
                    value={domain.sla}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (Number.isFinite(value)) onUpdate(domain.id, { sla: Math.min(100, Math.max(0, value)) });
                    }}
                    className={inputClass}
                  />
                </label>
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  MTTR (min)
                  <input
                    type="number" min="1"
                    value={getDomainMttr(domain)}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      if (Number.isFinite(value)) onUpdate(domain.id, { mttr: Math.max(1, value) });
                    }}
                    className={inputClass}
                  />
                </label>
              </div>
              {entry && (
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {entry.itemCount === 0 ? (
                    'No critical items tagged.'
                  ) : (
                    <>
                      {entry.itemCount} item{entry.itemCount === 1 ? '' : 's'} ·{' '}
                      <span className="font-mono font-bold text-red-500">−{formatDuration(entry.downtimePerYear)}/yr</span> ·{' '}
                      while down: <span className="font-mono">{formatSLAPercentage(entry.slaWhileDown)}%</span>
                    </>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <button
        onClick={onAdd}
        className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:border-violet-400 hover:text-violet-500 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add failure domain
      </button>
    </section>
  );
};

export default FailureDomainsPanel;
