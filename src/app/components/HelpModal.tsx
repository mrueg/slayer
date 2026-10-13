'use client';

import React, { useState } from 'react';
import { Plus, Calculator, Settings, BarChart3, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

const HelpModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'engine' | 'simulation' | 'controls'>('engine');

  const sections = {
    engine: [
      {
        title: "Mathematical Foundations",
        icon: <Calculator className="w-4 h-4" />,
        content: [
          { label: "Series Availability", text: "Calculates the product of individual component availabilities. The system fails if any single component in the chain fails." },
          { label: "Parallel Redundancy", text: "Calculates system availability using the redundancy formula, adjusted by the switch reliability (Failover %) of the primary path." },
          { label: "K-out-of-N Modeling", text: "Uses dynamic programming to determine the exact success probability for nodes requiring a specific minimum capacity (Min UP) to function." },
          { label: "MTTR Derivation", text: "Derives system-wide Mean Time To Recovery using frequency-weighted averages of component restoration times." },
          { label: "RTO & RPO", text: "Aggregates Recovery Time Objectives (sum for series, min for parallel) and Recovery Point Objectives (max for series, min for parallel)." }
        ]
      }
    ],
    simulation: [
      {
        title: "Probabilistic Analysis",
        icon: <BarChart3 className="w-4 h-4 text-indigo-500" />,
        content: [
          { label: "Monte Carlo Engine", text: "Executes 10,000 yearly iterations using Poisson arrival rates for incidents and Exponential distributions for recovery durations." },
          { label: "Sensitivity Analysis", text: "Identifies System Bottlenecks by calculating the delta between current SLA and a theoretical 100% available state for each node." },
          { label: "Blast Radius Heatmap", text: "Calculates the health impact of individual failures. Nodes are color-coded based on the percentage of total system SLA lost if they fail." },
          { label: "Error Budgeting", text: "Tracks consumed downtime against allowed duration for a specified period (Day/Month/Year) based on the target SLA." }
        ]
      }
    ],
    controls: [
      {
        title: "Interface Guide",
        icon: <Settings className="w-4 h-4 text-slate-500" />,
        content: [
          { label: "Chaos Mode", text: "Enables manual failure injection. For redundant components, users can specify the exact magnitude of replica failure." },
          { label: "Cloud SLA Catalog", text: "Searchable database of published SLAs from AWS, Azure, GCP, and Cloudflare to pre-populate component metrics." },
          { label: "Technical Annotations", text: "Support for multi-line technical notes and assumptions, persistent in both List and Topology views." },
          { label: "State Persistence", text: "Configurations are handled via Base64-encoded URL hashes for zero-backend sharing and local JSON export/import." }
        ]
      }
    ]
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[32px] shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex flex-col gap-6 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-500/20">
                <HelpCircle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white uppercase italic">Slayer Documentation</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-bold tracking-tight uppercase opacity-70">Reliability Modeling Reference</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <Plus className="w-8 h-8 rotate-45" />
            </button>
          </div>

          <div className="flex p-1 bg-slate-200 dark:bg-slate-800 rounded-xl self-start">
            <button
              onClick={() => setActiveTab('engine')}
              className={cn(
                "px-4 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all",
                activeTab === 'engine' ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              Reliability Modeling
            </button>
            <button
              onClick={() => setActiveTab('simulation')}
              className={cn(
                "px-4 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all",
                activeTab === 'simulation' ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              Risk Analysis
            </button>
            <button
              onClick={() => setActiveTab('controls')}
              className={cn(
                "px-4 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all",
                activeTab === 'controls' ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              Operational Controls
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-1 gap-8 scrollbar-hide">
          {sections[activeTab].map((section, idx) => (
            <div key={idx} className="space-y-6">
              <div className="flex items-center gap-2 pb-2 border-b-2 border-slate-100 dark:border-slate-800">
                <div className="text-blue-600 dark:text-blue-400">{section.icon}</div>
                <h3 className="font-black uppercase tracking-widest text-xs text-slate-900 dark:text-white">{section.title}</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                {section.content.map((item, i) => (
                  <div key={i} className="group">
                    <div className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-1 group-hover:translate-x-1 transition-transform inline-block">
                      {item.label}
                    </div>
                    <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400 font-medium">
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-col md:flex-row md:items-center justify-end gap-4">
          <button 
            onClick={onClose}
            className="px-8 py-3 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl hover:shadow-2xl hover:scale-105 transition-all active:scale-95"
          >
            Got it, Let&apos;s Rock
          </button>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
