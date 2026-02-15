'use client';

import React, { useState } from 'react';
import { Skull, AlertTriangle } from 'lucide-react';
import { SLAItem } from '@/lib/sla-calculator';

interface KillModalProps {
  item: SLAItem;
  onConfirm: (count: number) => void;
  onClose: () => void;
}

const KillModal: React.FC<KillModalProps> = ({ item, onConfirm, onClose }) => {
  const [count, setCount] = useState(1);
  const replicas = item.replicas || 1;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center gap-4">
          <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-2xl text-red-600 dark:text-red-400">
            <Skull className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white uppercase italic">Chaos Injection</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Select failure magnitude for {item.name}</p>
          </div>
        </div>
        
        <div className="p-8 space-y-6">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">How many replicas to kill?</label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="1"
                max={replicas}
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value))}
                className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-red-600"
              />
              <span className="text-2xl font-black font-mono text-red-600 w-12 text-center">{count}</span>
            </div>
            <div className="flex justify-between mt-2 text-[10px] font-bold text-slate-400 uppercase">
              <span>1 Unit</span>
              <span>{replicas} Units (Total Down)</span>
            </div>
          </div>

          <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-2xl border border-red-100 dark:border-red-900/30">
            <p className="text-xs leading-relaxed text-red-700 dark:text-red-400 font-medium">
              <AlertTriangle className="w-3 h-3 inline mr-1 mb-0.5" />
              Simulating failure of <strong>{count}</strong> out of <strong>{replicas}</strong> replicas. 
              {count === replicas ? " This will cause a total outage for this node." : " This will put the node in a DEGRADED state."}
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={() => onConfirm(count)}
            className="flex-1 py-3 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-red-500/20 hover:bg-red-500 transition-all"
          >
            Inject Failure
          </button>
        </div>
      </div>
    </div>
  );
};

export default KillModal;
