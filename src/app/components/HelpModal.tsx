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
          { label: "Series Availability", text: "The product of the children's availabilities. The group fails if any child fails." },
          { label: "Parallel & Failover", text: "With Nodes UP = 1 the first child is the primary: Failover % only matters when the primary fails, and the group fails if the switch fails or every standby is down too. With Nodes UP > 1 the group is a k-of-n pool behind the switch." },
          { label: "K-out-of-N", text: "Replicas with Min UP (and parallel groups with Nodes UP) use dynamic programming for the exact probability that enough of them are up, even with different availabilities." },
          { label: "Failure Frequency & MTTR", text: "Each component fails (1 − SLA) × year / MTTR times a year. Frequencies are combined with the Birnbaum importance formula, so frequency × MTTR always matches the SLA and the simulation agrees with the headline number." },
          { label: "Shared Failure Domains", text: "Zones, regions or providers with their own SLA and MTTR. Items tagged with a domain fail together when it fails; availability is computed by conditioning on which domains are up." },
          { label: "Shared Replica Failures", text: "Shared % (beta factor) is the share of a replica's failures that hit all replicas at once, such as the same bug or bad deploy. It caps what extra replicas can achieve." },
          { label: "Optional Items", text: "Optional items are left out of the calculation entirely, so they never count as a perfect redundant path." },
          { label: "RTO & RPO", text: "Recovery Time Objectives add up in series and take the minimum in parallel; Recovery Point Objectives take the maximum in series and the minimum in parallel. Unset values are ignored." }
        ]
      }
    ],
    simulation: [
      {
        title: "Probabilistic Analysis",
        icon: <BarChart3 className="w-4 h-4 text-indigo-500" />,
        content: [
          { label: "Monte Carlo Engine", text: "Simulates 10,000 years in a background worker: incidents arrive as a Poisson process and recoveries are exponential. Each run shows its seed, so it can be reproduced." },
          { label: "Incident-free Chance", text: "The probability of getting through a week, month, quarter, year or a custom window without any incident, from R(t) = exp(−λt)." },
          { label: "Improvement Levers", text: "Ranks every item by the yearly downtime saved if it never failed. The top item gets the System Bottleneck badge." },
          { label: "Failure Domain Impact", text: "Per domain: how many items it holds, the downtime it causes per year and the system SLA while it is down." },
          { label: "Blast Radius Heatmap", text: "Colors nodes by the share of system SLA lost if they fail." },
          { label: "Model Checks", text: "Flags valid but likely unintended setups: replicas that must all be up, parallel groups that behave like series, empty groups, a weak primary, redundancy defeated by a shared domain and 100% components." },
          { label: "Error Budgeting", text: "Tracks consumed downtime against the allowed downtime for a day, month or year at the system SLA." }
        ]
      }
    ],
    controls: [
      {
        title: "Interface Guide",
        icon: <Settings className="w-4 h-4 text-slate-500" />,
        content: [
          { label: "Undo & Autosave", text: "Every change can be undone (Ctrl/Cmd+Z, redo with Ctrl/Cmd+Shift+Z). The model is saved in your browser and restored on the next visit." },
          { label: "Sharing", text: "Share copies a compressed link containing the whole model; no server involved. Opening a link loads the model and then removes it from the address bar, so later edits survive a reload." },
          { label: "Export", text: "Download the configuration as JSON, a report as Markdown or PDF (via the print dialog), or the topology as an SVG or PNG diagram." },
          { label: "Chaos Mode", text: "Inject failures by hand; for replicated items choose how many replicas to kill. Leaving chaos mode restores everything." },
          { label: "Templates", text: "Ready-made architectures to start from, including a non-IT example: a metal concert that tries to make it through the night." },
          { label: "Cloud SLA Catalog", text: "Searchable published SLAs from AWS, Azure, GCP and Cloudflare to pre-fill a component." },
          { label: "Notes & Theme", text: "Notes on any item show in the list, topology and exports. Dark mode follows your system until you pick one." }
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
