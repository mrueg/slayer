'use client';

import React, { useMemo } from 'react';
import { Plus, BarChart3 } from 'lucide-react';
import { formatDuration, MonteCarloResult, getHistogramData } from '@/lib/sla-calculator';
import { cn } from '@/lib/cn';

const MonteCarloHistogram: React.FC<{ result: MonteCarloResult, targetSla: number, onClose: () => void }> = ({ result, targetSla, onClose }) => {
  const bins = useMemo(() => getHistogramData(result.distribution, 50), [result.distribution]);
  const maxCount = Math.max(...bins.map(b => b.count));
  const targetDowntime = (365.25 * 24 * 60) * (1 - targetSla / 100);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">Downtime Distribution</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">10,000 simulations of yearly system performance</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400"
          >
            <Plus className="w-6 h-6 rotate-45" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="block text-[10px] font-black text-slate-400 uppercase mb-1">Breach Probability</span>
              <span className={cn("text-xl font-black font-mono", result.breachProbability > 5 ? "text-red-500" : "text-emerald-500")}>
                {result.breachProbability.toFixed(2)}%
              </span>
              {result.breachProbabilityCI && (
                <span className="block text-[10px] text-slate-400 font-mono mt-1">
                  95% CI: [{result.breachProbabilityCI[0].toFixed(2)}%, {result.breachProbabilityCI[1].toFixed(2)}%]
                </span>
              )}
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="block text-[10px] font-black text-slate-400 uppercase mb-1">Mean Year</span>
              <span className="text-xl font-black font-mono dark:text-white">{formatDuration(result.meanDowntime)}</span>
              {result.meanDowntimeCI && (
                <span className="block text-[10px] text-slate-400 font-mono mt-1">
                  95% CI: [{formatDuration(result.meanDowntimeCI[0])}, {formatDuration(result.meanDowntimeCI[1])}]
                </span>
              )}
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="block text-[10px] font-black text-red-400 uppercase mb-1">95th Percentile</span>
              <span className="text-xl font-black font-mono text-red-500">{formatDuration(result.p95Downtime)}</span>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="block text-[10px] font-black text-red-600 uppercase mb-1">99th Percentile</span>
              <span className="text-xl font-black font-mono text-red-600">{formatDuration(result.p99Downtime)}</span>
            </div>
          </div>

          {/* SVG Chart */}
          <div className="relative bg-slate-50 dark:bg-slate-950/50 rounded-3xl p-8 border border-slate-100 dark:border-slate-800/50 min-h-[400px]">
            <div className="absolute top-4 right-8 flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-sm shadow-sm" />
                <span className="text-[10px] font-bold text-slate-400 uppercase">SLA Breach Line</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-indigo-500 rounded-sm shadow-sm opacity-50" />
                <span className="text-[10px] font-bold text-slate-400 uppercase">Yearly Occurrence</span>
              </div>
            </div>

            <svg className="w-full h-full min-h-[300px]" viewBox="0 0 1000 300" preserveAspectRatio="none">
              {/* Target SLA Line */}
              {maxCount > 0 && result.distribution[result.distribution.length - 1] > 0 && (
                <line 
                  x1={(targetDowntime / result.distribution[result.distribution.length - 1]) * 1000} 
                  y1="0" 
                  x2={(targetDowntime / result.distribution[result.distribution.length - 1]) * 1000} 
                  y2="300" 
                  className="stroke-red-500 stroke-2" 
                  strokeDasharray="4 2"
                />
              )}

              {/* Bins */}
              {bins.map((b, i) => {
                const height = (b.count / maxCount) * 280;
                const x = (i / bins.length) * 1000;
                const width = (1 / bins.length) * 1000;
                
                return (
                  <rect
                    key={i}
                    x={x}
                    y={300 - height}
                    width={width - 2}
                    height={height}
                    className="fill-indigo-500/40 hover:fill-indigo-500 transition-colors"
                  >
                    <title>{b.label}: {b.count} years</title>
                  </rect>
                );
              })}
            </svg>
            <div className="flex justify-between mt-4 border-t border-slate-200 dark:border-slate-800 pt-2 text-[10px] font-mono text-slate-400">
              <span>{formatDuration(result.distribution[0])}</span>
              <span>Yearly Downtime (10k simulated years)</span>
              <span>{formatDuration(result.distribution[result.distribution.length - 1])}</span>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-bold text-sm shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
          >
            Close Analysis
          </button>
        </div>
      </div>
    </div>
  );
};

export default MonteCarloHistogram;
