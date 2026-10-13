'use client';

import React, { useState } from 'react';
import { Plus, Calculator } from 'lucide-react';
import { formatDuration, formatSLAPercentage, CalculationStep } from '@/lib/sla-calculator';
import { cn } from '@/lib/cn';

const formatOptionalDuration = (minutes: number | undefined): string =>
  minutes === undefined ? '—' : formatDuration(minutes);

const CalculationBreakdown: React.FC<{ steps: CalculationStep[], onClose: () => void }> = ({ steps, onClose }) => {
  const [activeTab, setActiveTab] = useState<'sla' | 'mttr' | 'dr'>('sla');

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col gap-6 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">Calculation Breakdown</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Step-by-step mathematical derivation</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400"
            >
              <Plus className="w-6 h-6 rotate-45" />
            </button>
          </div>

          <div className="flex p-1 bg-slate-200 dark:bg-slate-800 rounded-xl self-start">
            <button
              onClick={() => setActiveTab('sla')}
              className={cn(
                "px-4 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all",
                activeTab === 'sla' ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              Reliability Modeling
            </button>
            <button
              onClick={() => setActiveTab('mttr')}
              className={cn(
                "px-4 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all",
                activeTab === 'mttr' ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              MTTR & Frequency
            </button>
            <button
              onClick={() => setActiveTab('dr')}
              className={cn(
                "px-4 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all",
                activeTab === 'dr' ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              Disaster Recovery
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-4 font-sans">
          {steps.map((step, index) => (
            <div key={`${step.id}-${index}`} className="relative pl-8 pb-4 border-l-2 border-slate-100 dark:border-slate-800 last:border-l-transparent">
              <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-500 border-4 border-white dark:border-slate-900 shadow-sm" />
              
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">{step.name}</span>
                  <span className="text-[10px] font-mono bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded">
                    {step.type.toUpperCase()}
                  </span>
                </div>
                
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-3">{step.explanation}</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {activeTab === 'sla' ? (
                    <>
                      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1 tracking-tighter">Formula</span>
                        <code className="text-xs font-mono text-indigo-600 dark:text-indigo-400 break-all">{step.formula}</code>
                      </div>
                      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1 tracking-tighter">Result SLA</span>
                        <span className="text-sm font-mono font-black text-slate-900 dark:text-white">
                          {formatSLAPercentage(step.result)}%
                        </span>
                      </div>
                    </>
                  ) : activeTab === 'mttr' ? (
                    <>
                      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1 tracking-tighter">System MTTR</span>
                        <span className="text-sm font-mono font-black text-slate-900 dark:text-white">
                          {formatDuration(step.mttrResult || 0)}
                        </span>
                      </div>
                      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1 tracking-tighter">Est. Frequency</span>
                        <span className="text-sm font-mono font-black text-slate-900 dark:text-white">
                          {(step.frequencyResult || 0).toFixed(2)}/yr
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1 tracking-tighter">Step RTO</span>
                        <span className="text-sm font-mono font-black text-slate-900 dark:text-white">
                          {formatOptionalDuration(step.rtoResult)}
                        </span>
                      </div>
                      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1 tracking-tighter">Step RPO</span>
                        <span className="text-sm font-mono font-black text-slate-900 dark:text-white">
                          {formatOptionalDuration(step.rpoResult)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-bold text-sm shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
          >
            Close Breakdown
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalculationBreakdown;
