'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ICON_MAP } from '@/app/icons';

const IconPicker: React.FC<{ current: string | undefined, onSelect: (name: string) => void }> = ({ current, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 transition-all shadow-sm"
        title="Select Icon"
      >
        <ChevronDown className={cn("w-3 h-3 transition-transform", isOpen && "rotate-180")} />
      </button>
      
      {isOpen && (
        <div className="absolute top-full mt-2 left-0 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[100] p-2 grid grid-cols-4 gap-1 animate-in fade-in zoom-in-95 duration-100">
          {Object.entries(ICON_MAP).map(([name, Icon]) => (
            <button
              key={name}
              onClick={() => {
                onSelect(name);
                setIsOpen(false);
              }}
              className={cn(
                "p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center transition-colors",
                current === name ? "text-blue-500 bg-blue-50 dark:bg-blue-900/30" : "text-slate-400 dark:text-slate-500"
              )}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
          <button
            onClick={() => {
              onSelect('');
              setIsOpen(false);
            }}
            className="col-span-4 mt-1 py-1 text-[10px] font-bold uppercase text-slate-400 hover:text-red-500 transition-colors"
          >
            Reset to Auto
          </button>
        </div>
      )}
    </div>
  );
};

export default IconPicker;
