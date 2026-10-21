'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Eraser, FolderOpen, RefreshCcw, Upload } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ExportFormat = 'json' | 'markdown' | 'pdf' | 'svg' | 'png';

interface FileMenuProps {
  onImport: () => void;
  onExport: (format: ExportFormat) => void;
  onReset: () => void;
  onClear: () => void;
}

const EXPORT_GROUPS = [
  ['Export model', [['json', 'Configuration (JSON)']]],
  ['Export report', [['markdown', 'Markdown (.md)'], ['pdf', 'PDF (print dialog)']]],
  ['Export diagram', [['svg', 'SVG image'], ['png', 'PNG image']]],
] as const;

const headingClass = "px-3 pt-2 pb-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest";
const itemClass = "w-full flex items-center gap-2 text-left px-4 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors";

export default function FileMenu({ onImport, onExport, onReset, onClear }: FileMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  // Close before running, so confirm dialogs don't appear over an open menu
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm"
        title="Import, export, reset or clear the model"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <FolderOpen className="w-4 h-4" />
        <span className="hidden sm:inline">File</span>
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className="absolute top-full mt-2 right-0 w-60 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 duration-200">
          <button role="menuitem" onClick={run(onImport)} className={itemClass}>
            <Upload className="w-4 h-4 text-slate-400" />
            Import JSON…
          </button>
          {EXPORT_GROUPS.map(([heading, options]) => (
            <div key={heading}>
              <div className={headingClass}>{heading}</div>
              {options.map(([format, label]) => (
                <button key={format} role="menuitem" onClick={run(() => onExport(format))} className={itemClass}>
                  {label}
                </button>
              ))}
            </div>
          ))}
          <div className="my-1 h-px bg-slate-100 dark:bg-slate-700" />
          <button role="menuitem" onClick={run(onReset)} className={itemClass}>
            <RefreshCcw className="w-4 h-4 text-slate-400" />
            Reset to default example
          </button>
          <button
            role="menuitem"
            onClick={run(onClear)}
            className="w-full flex items-center gap-2 text-left px-4 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Eraser className="w-4 h-4" />
            Clear all components
          </button>
        </div>
      )}
    </div>
  );
}
