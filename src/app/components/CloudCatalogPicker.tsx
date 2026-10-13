'use client';

import React, { useState } from 'react';
import { Cloud, Search } from 'lucide-react';
import { ICON_MAP } from '@/app/icons';
import { CLOUD_CATALOG } from '@/app/catalog';

const CloudCatalogPicker: React.FC<{ onSelect: (service: typeof CLOUD_CATALOG[0]) => void }> = ({ onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  const filtered = CLOUD_CATALOG.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.provider.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-all shadow-sm flex items-center gap-2"
        title="Lookup Cloud SLA Catalog"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold uppercase hidden sm:inline">Lookup</span>
      </button>
      
      {isOpen && (
        <div className="absolute top-full mt-2 right-0 w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-[150] overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col max-h-[400px]">
          <div className="p-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search AWS, Azure, GCP..."
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all dark:text-white"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto py-2">
            {filtered.map((service, idx) => (
              <button
                key={`${service.provider}-${service.name}-${idx}`}
                onClick={() => {
                  onSelect(service);
                  setIsOpen(false);
                  setSearch('');
                }}
                className="w-full px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 group-hover:bg-white dark:group-hover:bg-slate-600 transition-colors">
                    {ICON_MAP[service.icon as keyof typeof ICON_MAP] ? 
                      React.createElement(ICON_MAP[service.icon as keyof typeof ICON_MAP], { className: "w-4 h-4" }) : 
                      <Cloud className="w-4 h-4" />
                    }
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-black text-slate-900 dark:text-white">{service.name}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{service.provider}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono font-black text-indigo-600 dark:text-indigo-400">{service.sla}%</div>
                  <div className="text-[9px] font-medium text-slate-400">{service.mttr}m MTTR</div>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-xs italic">
                No matching cloud services found.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CloudCatalogPicker;
