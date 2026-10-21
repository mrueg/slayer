'use client';

import React, { useEffect, useRef } from 'react';
import { ChevronsDownUp, ChevronsUpDown, Eye, EyeOff, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ListToolbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  /** Number of matching items, or null when not searching */
  matchCount: number | null;
  showRecoveryFields: boolean;
  onShowRecoveryFieldsChange: (show: boolean) => void;
  /** Whether there are nested groups to collapse */
  canCollapse: boolean;
  allCollapsed: boolean;
  onToggleCollapseAll: () => void;
}

const actionClass = "flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:text-blue-400 dark:hover:bg-slate-800 transition-colors whitespace-nowrap";

export default function ListToolbar({
  query,
  onQueryChange,
  matchCount,
  showRecoveryFields,
  onShowRecoveryFieldsChange,
  canCollapse,
  allCollapsed,
  onToggleCollapseAll,
}: ListToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" jumps to search, unless the user is already typing somewhere
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-48 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onQueryChange('');
              e.currentTarget.blur();
            }
          }}
          placeholder="Search components and groups"
          aria-label="Search components and groups"
          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-16 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm dark:text-slate-200 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            onClick={() => {
              onQueryChange('');
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 rounded border border-slate-200 dark:border-slate-700 text-[10px] font-mono text-slate-400 pointer-events-none" aria-hidden>
            /
          </kbd>
        )}
      </div>
      {matchCount !== null && (
        <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap" role="status">
          {matchCount} {matchCount === 1 ? 'match' : 'matches'}
        </span>
      )}
      <div className="flex items-center gap-1 ml-auto">
        <button
          onClick={() => onShowRecoveryFieldsChange(!showRecoveryFields)}
          className={cn(actionClass, showRecoveryFields && "text-blue-600 dark:text-blue-400")}
          aria-pressed={showRecoveryFields}
          title={`${showRecoveryFields ? 'Hide' : 'Show'} the RTO and RPO fields on every component`}
        >
          {showRecoveryFields ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          RTO/RPO
        </button>
        {canCollapse && (
          <button onClick={onToggleCollapseAll} className={actionClass}>
            {allCollapsed ? <ChevronsUpDown className="w-3.5 h-3.5" /> : <ChevronsDownUp className="w-3.5 h-3.5" />}
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
      </div>
    </div>
  );
}
