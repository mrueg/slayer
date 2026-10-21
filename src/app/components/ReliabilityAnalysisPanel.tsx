'use client';

import React, { useId } from 'react';
import { Activity, BarChart3, Dices, Play, RotateCw, ShieldCheck } from 'lucide-react';
import { DowntimePeriod, MonteCarloResult, formatDuration } from '@/lib/sla-calculator';
import { cn } from '@/lib/cn';

interface ReliabilityAnalysisPanelProps {
  compositeSla: number;
  simulation: {
    result: MonteCarloResult | null;
    isRunning: boolean;
    autoRun: boolean;
    onAutoRunChange: (autoRun: boolean) => void;
    targetSlaOverride: number | null;
    onTargetSlaOverrideChange: (sla: number | null) => void;
    onRun: () => void;
    onShowDistribution: () => void;
  };
  dr: {
    rto?: number;
    rpo?: number;
    targetRto: number;
    targetRpo: number;
    onTargetRtoChange: (minutes: number) => void;
    onTargetRpoChange: (minutes: number) => void;
  };
  errorBudget: {
    consumedSeconds: number;
    onConsumedSecondsChange: (seconds: number) => void;
    period: DowntimePeriod;
    onPeriodChange: (period: DowntimePeriod) => void;
    remainingSeconds: number;
    totalBudgetSeconds: number;
    isBreached: boolean;
  };
}

const sectionHeadingClass = "text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500";
const labelClass = "block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1";
const inputClass = "w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm dark:text-slate-200";

function BreachBar({ label, probability, detail }: { label: string; probability: number; detail?: string }) {
  const breached = probability > 5;
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase">{label}</span>
        <span className={cn("text-sm font-black font-mono", breached ? "text-red-500" : "text-emerald-500")}>
          {probability.toFixed(2)}%
        </span>
      </div>
      <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
        <div
          className={cn("h-full transition-all duration-1000", breached ? "bg-red-500" : "bg-emerald-500")}
          style={{ width: `${Math.min(100, probability)}%` }}
        />
      </div>
      {detail && <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">{detail}</p>}
    </div>
  );
}

function Objective({ label, value, target, unsetTitle }: { label: string; value?: number; target: number; unsetTitle: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="font-bold text-slate-400 uppercase text-[10px]">{label}</span>
      {value === undefined ? (
        <span className="font-mono font-black text-slate-400" title={unsetTitle}>not set</span>
      ) : (
        <span className={cn("font-mono font-black", value <= target ? "text-emerald-600" : "text-red-600")}>
          {formatDuration(value)} {value <= target ? "✓" : "!!"}
        </span>
      )}
    </div>
  );
}

export default function ReliabilityAnalysisPanel({ compositeSla, simulation, dr, errorBudget }: ReliabilityAnalysisPanelProps) {
  const { result } = simulation;
  const id = useId();
  return (
    <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm space-y-8">
      <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-4">
        <Activity className="w-4 h-4 text-blue-500" />
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white italic">Reliability Analysis</h3>
      </div>

      {/* Monte Carlo Simulation */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dices className="w-4 h-4 text-indigo-500" />
            <h3 className={sectionHeadingClass}>Monte Carlo Simulation</h3>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer group">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-slate-500 transition-colors">Auto-run</span>
              <button
                onClick={() => simulation.onAutoRunChange(!simulation.autoRun)}
                role="switch"
                aria-checked={simulation.autoRun}
                className={cn(
                  "w-6 h-3 rounded-full relative transition-colors duration-200 outline-none",
                  simulation.autoRun ? "bg-indigo-500" : "bg-slate-200 dark:bg-slate-700"
                )}
              >
                <div className={cn(
                  "absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all duration-200 shadow-sm",
                  simulation.autoRun ? "left-3.5" : "left-0.5"
                )} />
              </button>
            </label>
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 transition-all",
              simulation.isRunning ? "animate-pulse opacity-100" : "opacity-50"
            )}>
              {simulation.isRunning ? (
                <>
                  <RotateCw className="w-2.5 h-2.5 animate-spin" />
                  Simulating
                </>
              ) : (
                <>
                  <div className="w-1 h-1 rounded-full bg-indigo-500" />
                  Ready
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor={`${id}-target-sla`} className={labelClass}>Target SLA for Simulation (%)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.001"
              min="0"
              max="100"
              id={`${id}-target-sla`}
              value={simulation.targetSlaOverride !== null ? simulation.targetSlaOverride : compositeSla}
              onChange={(e) => simulation.onTargetSlaOverrideChange(parseFloat(e.target.value))}
              className={cn(inputClass, "flex-1")}
              placeholder={compositeSla.toString()}
            />
            {simulation.targetSlaOverride !== null && (
              <button
                onClick={() => simulation.onTargetSlaOverrideChange(null)}
                className="text-[10px] font-bold text-indigo-500 hover:text-indigo-400 uppercase whitespace-nowrap"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {!simulation.autoRun && (
          <button
            onClick={simulation.onRun}
            disabled={simulation.isRunning}
            className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md hover:shadow-lg disabled:opacity-50 active:scale-[0.98]"
          >
            <Play className="w-4 h-4 fill-current" />
            Run Yearly Simulation
          </button>
        )}

        {!result ? (
          simulation.autoRun ? (
            <div className="py-2 text-center">
              <p className="text-[10px] text-slate-400 italic">
                Waiting for data changes...
              </p>
            </div>
          ) : null
        ) : (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700/50 space-y-3">
              <BreachBar label="Year over budget" probability={result.breachProbability} />
              <BreachBar
                label="Any month over budget"
                probability={result.monthlyBreachProbability}
                detail={`${result.breachedMonthsPerYear.toFixed(1)} of 12 months per year on average`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700/50">
                <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Median Year</span>
                <span className="text-xs font-mono font-bold dark:text-white">{formatDuration(result.medianDowntime)}</span>
              </div>
              <div className="p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700/50">
                <span className="block text-[10px] font-bold text-red-400 uppercase mb-1">P95 (Bad Year)</span>
                <span className="text-xs font-mono font-bold text-red-500">{formatDuration(result.p95Downtime)}</span>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">
              {result.iterations.toLocaleString('en-US')} simulated years
            </p>

            <button
              onClick={simulation.onShowDistribution}
              className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl text-[10px] font-black uppercase transition-all"
            >
              <BarChart3 className="w-3 h-3" />
              View Distribution
            </button>
          </div>
        )}
      </div>

      <div className="h-[1px] bg-slate-100 dark:bg-slate-700" />

      {/* Disaster Recovery Goals */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <h3 className={sectionHeadingClass}>DR Goals (RTO/RPO)</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${id}-target-rto`} className={labelClass}>Target RTO (min)</label>
            <input
              type="number"
              min="0"
              id={`${id}-target-rto`}
              value={dr.targetRto}
              onChange={(e) => dr.onTargetRtoChange(parseInt(e.target.value) || 0)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${id}-target-rpo`} className={labelClass}>Target RPO (min)</label>
            <input
              type="number"
              min="0"
              id={`${id}-target-rpo`}
              value={dr.targetRpo}
              onChange={(e) => dr.onTargetRpoChange(parseInt(e.target.value) || 0)}
              className={inputClass}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Objective label="System RTO:" value={dr.rto} target={dr.targetRto} unsetTitle="No component defines an RTO" />
          <Objective label="System RPO:" value={dr.rpo} target={dr.targetRpo} unsetTitle="No component defines an RPO" />
        </div>
      </div>

      <div className="h-[1px] bg-slate-100 dark:bg-slate-700" />

      {/* Error Budget Modeling */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-500" />
          <h3 className={sectionHeadingClass}>Error Budget Modeling</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${id}-consumed`} className={labelClass}>Consumed (sec)</label>
            <input
              type="number"
              min="0"
              id={`${id}-consumed`}
              value={errorBudget.consumedSeconds}
              onChange={(e) => errorBudget.onConsumedSecondsChange(parseFloat(e.target.value) || 0)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${id}-period`} className={labelClass}>Period</label>
            <select
              id={`${id}-period`}
              value={errorBudget.period}
              onChange={(e) => errorBudget.onPeriodChange(e.target.value as DowntimePeriod)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-xs h-[34px] dark:text-slate-200 font-bold uppercase"
            >
              <option value="day">Day</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
          </div>
        </div>
        <div>
          <div className="flex justify-between items-end mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Remaining Budget</span>
            <span className={cn(
              "font-mono font-bold text-xs",
              errorBudget.isBreached ? "text-red-500" : "text-emerald-500"
            )}>
              {errorBudget.isBreached ? "BREACHED" : formatDuration(errorBudget.remainingSeconds / 60)}
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-500",
                errorBudget.isBreached ? "bg-red-500" : "bg-emerald-500"
              )}
              style={{
                width: `${Math.min(100, Math.max(0, (errorBudget.remainingSeconds / errorBudget.totalBudgetSeconds) * 100))}%`
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
