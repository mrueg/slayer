'use client';

import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import type { ModelWarning } from '@/lib/warnings';
import { cn } from '@/lib/cn';

const HIGHLIGHT = ['ring-2', 'ring-amber-400'];

const scrollToItem = (itemId: string) => {
  const el = document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(itemId)}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add(...HIGHLIGHT);
  setTimeout(() => el.classList.remove(...HIGHLIGHT), 1500);
};

interface ModelChecksProps {
  warnings: ModelWarning[];
  canNavigate: boolean;
  // Expands whatever hides the item, so it is rendered before we scroll to it
  onReveal: (itemId: string) => void;
}

const ModelChecks: React.FC<ModelChecksProps> = ({ warnings, canNavigate, onReveal }) => {
  if (warnings.length === 0) return null;

  return (
    <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-4">
        <AlertTriangle className="w-4 h-4 text-amber-500" />
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white italic">Model Checks</h3>
        <span className="ml-auto text-[10px] font-mono font-bold text-slate-400">{warnings.length}</span>
      </div>
      <ul className="space-y-3">
        {warnings.map((warning, index) => (
          <li key={`${warning.itemId}-${index}`}>
            <button
              onClick={() => {
                onReveal(warning.itemId);
                requestAnimationFrame(() => scrollToItem(warning.itemId));
              }}
              disabled={!canNavigate}
              className="w-full text-left flex gap-2 group disabled:cursor-default"
            >
              {warning.severity === 'warning'
                ? <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                : <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />}
              <span className="text-xs leading-relaxed">
                <span className={cn("font-bold text-slate-700 dark:text-slate-200", canNavigate && "group-hover:underline")}>{warning.itemName}</span>
                <span className="text-slate-500 dark:text-slate-400"> — {warning.message}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default ModelChecks;
