'use client';

import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useBooleanPreference } from '@/lib/preferences';

interface SidebarSectionProps {
  /** Stable key for remembering whether the section is open */
  id: string;
  title: string;
  icon: React.ReactNode;
  /** Shown in the header, so a collapsed section still says what's in it (e.g. a count) */
  summary?: React.ReactNode;
  /** Spacing between the body's blocks */
  bodyClassName?: string;
  children: React.ReactNode;
}

export default function SidebarSection({ id, title, icon, summary, bodyClassName = 'space-y-4', children }: SidebarSectionProps) {
  const [open, setOpen] = useBooleanPreference(`slayer-sidebar-${id}-open`, true);
  const bodyId = useId();

  return (
    <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
      <h3>
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center gap-2 text-left group"
          aria-expanded={open}
          aria-controls={bodyId}
        >
          {icon}
          <span className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white italic">{title}</span>
          {summary !== undefined && (
            <span className="ml-auto text-[10px] font-mono font-bold text-slate-400">{summary}</span>
          )}
          <ChevronDown
            className={cn(
              "w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-transform",
              summary === undefined && "ml-auto",
              !open && "-rotate-90"
            )}
          />
        </button>
      </h3>
      {open && (
        <div id={bodyId} className={cn("mt-4 pt-4 border-t border-slate-100 dark:border-slate-700", bodyClassName)}>
          {children}
        </div>
      )}
    </section>
  );
}
