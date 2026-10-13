'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, MapPinned } from 'lucide-react';
import type { FailureDomain } from '@/lib/sla-calculator';
import { cn } from '@/lib/cn';

interface DomainPickerProps {
  domains: FailureDomain[];
  selected: string[];
  onChange: (selected: string[]) => void;
  showChips?: boolean; // false when the caller renders DomainChips elsewhere
}

const assignedDomains = (domains: FailureDomain[], selected: string[]) => {
  const byId = new Map(domains.map(domain => [domain.id, domain]));
  return selected.flatMap(id => (byId.has(id) ? [byId.get(id)!] : []));
};

export const DomainChips: React.FC<{ domains: FailureDomain[]; selected: string[]; className?: string }> = ({ domains, selected, className }) => {
  const assigned = assignedDomains(domains, selected);
  if (assigned.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {assigned.map(domain => (
        <span
          key={domain.id}
          className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 whitespace-nowrap"
          title="Failure domain"
        >
          {domain.name || '(unnamed)'}
        </span>
      ))}
    </div>
  );
};

/** Tags an item with failure domains; shows the assigned ones as chips. */
const DomainPicker: React.FC<DomainPickerProps> = ({ domains, selected, onChange, showChips = true }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [isOpen]);

  if (domains.length === 0) return null;
  const assigned = assignedDomains(domains, selected).map(domain => domain.id);

  const toggle = (id: string) =>
    onChange(assigned.includes(id) ? assigned.filter(d => d !== id) : [...assigned, id]);

  return (
    <div className="relative flex items-center gap-1 shrink-0" ref={ref}>
      {showChips && <DomainChips domains={domains} selected={assigned} />}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "p-1.5 rounded-lg border transition-all shadow-sm",
          assigned.length > 0
            ? "border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 text-violet-500"
            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 hover:text-violet-500"
        )}
        title="Failure domains"
        aria-label="Failure domains"
        aria-expanded={isOpen}
      >
        <MapPinned className="w-3 h-3" />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 right-0 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[100] py-1 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Fails with</div>
          {domains.map(domain => (
            <button
              key={domain.id}
              role="menuitemcheckbox"
              aria-checked={assigned.includes(domain.id)}
              onClick={() => toggle(domain.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <span className={cn(
                "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                assigned.includes(domain.id) ? "bg-violet-500 border-violet-500 text-white" : "border-slate-300 dark:border-slate-600"
              )}>
                {assigned.includes(domain.id) && <Check className="w-3 h-3" />}
              </span>
              <span className="truncate">{domain.name || '(unnamed)'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default DomainPicker;
