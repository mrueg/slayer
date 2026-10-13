'use client';

import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  FolderPlus,
  RefreshCcw,
  Clock,
  Percent,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  StickyNote,
  Skull
} from 'lucide-react';
import { SLAItem, calculateSLA, slaFromDowntime, formatSLAPercentage, DowntimePeriod, InputMode } from '@/lib/sla-calculator';
import { cn } from '@/lib/cn';
import { getIcon } from '@/app/icons';
import CloudCatalogPicker from '@/app/components/CloudCatalogPicker';
import IconPicker from '@/app/components/IconPicker';
import AutoExpandingTextarea from '@/app/components/AutoExpandingTextarea';
import KillModal from '@/app/components/KillModal';
import type { ModelWarning } from '@/lib/warnings';

/**
 * Parses a number input. Returns undefined for an empty or invalid field so
 * callers can skip the update instead of silently writing 0.
 */
const parseNumberInput = (raw: string, parse: (value: string) => number = parseFloat): number | undefined => {
  if (raw.trim() === '') return undefined;
  const value = parse(raw);
  return Number.isFinite(value) ? value : undefined;
};

interface ItemNodeProps {
  item: SLAItem;
  onUpdate: (id: string, updates: Partial<SLAItem>) => void;
  onRemove: (id: string) => void;
  onAddChild: (groupId: string, type: 'component' | 'group') => void;
  depth: number;
  bottleneckIds: string[];
  chaosMode: boolean;
  warnings?: Record<string, ModelWarning[]>;
}

const WarningBadge: React.FC<{ warnings?: ModelWarning[] }> = ({ warnings }) => {
  if (!warnings?.length) return null;
  const isWarning = warnings.some(w => w.severity === 'warning');
  return (
    <span
      className={cn(
        "shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 cursor-help",
        isWarning ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
      )}
      title={warnings.map(w => w.message).join('\n')}
      aria-label={`${warnings.length} model check${warnings.length === 1 ? '' : 's'}: ${warnings.map(w => w.message).join(' ')}`}
    >
      <AlertTriangle className="w-2.5 h-2.5" />
      {warnings.length}
    </span>
  );
};

const ItemNode: React.FC<ItemNodeProps> = ({ item, onUpdate, onRemove, onAddChild, depth, bottleneckIds, chaosMode, warnings }) => {
  const isGroup = item.type === 'group';
  const mode = item.inputMode || 'percentage';
  const isBottleneck = bottleneckIds.includes(item.id);
  const [showNotes, setShowNotes] = useState(!!item.notes);
  const [showKillModal, setShowKillModal] = useState(false);
  
  const failed = item.failedReplicas || 0;
  const replicas = item.replicas || 1;
  const isDown = failed >= replicas;
  const isDegraded = failed > 0 && failed < replicas;

  const handleModeToggle = (newMode: InputMode) => {
    onUpdate(item.id, { inputMode: newMode });
  };

  const handleDowntimeChange = (value: number, period: DowntimePeriod) => {
    const newSla = slaFromDowntime(value, period);
    onUpdate(item.id, { 
      sla: newSla, 
      downtimeValue: value, 
      downtimePeriod: period 
    });
  };

  return (
    <div data-item-id={item.id} className={cn(
      "relative rounded-xl transition-all border",
      isGroup 
        ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm mb-4" 
        : "bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800 p-4 flex flex-col lg:flex-row gap-4 items-end group",
      depth > 0 && isGroup && "ml-4 md:ml-8",
      isBottleneck && !isDown && "ring-2 ring-red-500 dark:ring-red-600 shadow-lg shadow-red-500/10",
      isDown && "ring-2 ring-red-600 bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-900 shadow-xl shadow-red-500/20",
      isDegraded && "ring-2 ring-orange-500 bg-orange-50/50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900 shadow-xl shadow-orange-500/20"
    )}>
      {isDown && (
        <div className="absolute -top-2 -left-2 bg-red-600 text-white px-2 py-0.5 rounded text-[8px] font-black flex items-center gap-1 z-20 shadow-md">
          <Skull className="w-2 h-2" />
          DOWN
        </div>
      )}
      {isDegraded && (
        <div className="absolute -top-2 -left-2 bg-orange-600 text-white px-2 py-0.5 rounded text-[8px] font-black flex items-center gap-1 z-20 shadow-md">
          <AlertTriangle className="w-2 h-2" />
          DEGRADED ({failed}/{replicas})
        </div>
      )}
      {isBottleneck && !isDown && !isDegraded && (
        <div className="absolute -top-2 -right-2 bg-red-600 text-white px-2 py-0.5 rounded text-[8px] font-black flex items-center gap-1 z-20 animate-pulse shadow-md">
          <AlertTriangle className="w-2 h-2" />
          SYSTEM BOTTLENECK
        </div>
      )}
      {isGroup ? (
        <>
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between bg-slate-50/50 dark:bg-slate-900/20 gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="text-slate-400 dark:text-slate-500">
                  {getIcon(item)}
                </div>
                <IconPicker 
                  current={item.icon} 
                  onSelect={(icon) => onUpdate(item.id, { icon })} 
                />
              </div>
              <input
                type="text"
                value={item.name}
                onChange={(e) => onUpdate(item.id, { name: e.target.value })}
                className={cn(
                  "bg-transparent font-semibold outline-none border-b border-transparent transition-all",
                  item.isOptional ? "text-slate-400 dark:text-slate-600 italic line-through border-transparent" : "text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600"
                )}
              />
              <span className={cn(
                "text-xs font-mono px-2 py-0.5 rounded-full transition-colors",
                item.isOptional ? "bg-slate-200 dark:bg-slate-800 text-slate-500" : "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
              )}>
                {formatSLAPercentage(calculateSLA(item))}%
              </span>
              <WarningBadge warnings={warnings?.[item.id]} />
              {item.isOptional && (
                <span className="text-[8px] font-black uppercase tracking-tighter bg-slate-200 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <ShieldCheck className="w-2 h-2" />
                  Optional
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onUpdate(item.id, { isOptional: !item.isOptional })}
                className={cn(
                  "p-1.5 rounded-lg border transition-all flex items-center gap-2",
                  item.isOptional 
                    ? "bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700" 
                    : "bg-emerald-50 border-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:border-emerald-900/30"
                )}
                title={item.isOptional ? "Make Critical" : "Make Optional"}
              >
                {item.isOptional ? <ShieldAlert className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                <span className="text-[10px] font-bold uppercase">{item.isOptional ? 'Optional' : 'Critical'}</span>
              </button>
              
              <div className="flex bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                <button
                  onClick={() => onUpdate(item.id, { config: 'series' })}
                  className={cn(
                    "px-3 py-1 text-xs rounded-md transition-all",
                    item.config === 'series' ? "bg-blue-600 text-white" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  Series
                </button>
                <button
                  onClick={() => onUpdate(item.id, { config: 'parallel' })}
                  className={cn(
                    "px-3 py-1 text-xs rounded-md transition-all",
                    item.config === 'parallel' ? "bg-blue-600 text-white" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  Parallel
                </button>
              </div>

              {item.config === 'parallel' && (item.children?.length || 0) > 1 && (
                <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm" title="Minimum children required to be UP for the group to be healthy">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">Nodes UP</span>
                  <input
                    type="number"
                    min="1"
                    max={item.children?.length || 1}
                    value={item.minChildrenRequired || 1}
                    onChange={(e) => {
                      const value = parseNumberInput(e.target.value, parseInt);
                      if (value !== undefined) onUpdate(item.id, { minChildrenRequired: value });
                    }}
                    className="w-8 bg-transparent outline-none font-mono text-xs text-center dark:text-slate-200"
                  />
                </div>
              )}

              {item.config === 'parallel' && (item.children?.length || 0) > 1 && (
                <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm" title="Probability of successful failover to secondary components">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">Failover %</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={item.failoverSla ?? 100}
                    onChange={(e) => {
                      const value = parseNumberInput(e.target.value);
                      if (value !== undefined) onUpdate(item.id, { failoverSla: value });
                    }}
                    className="w-12 bg-transparent outline-none font-mono text-xs text-center dark:text-slate-200"
                  />
                </div>
              )}

              <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Replicas</span>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={item.replicas || 1}
                  onChange={(e) => {
                  const value = parseNumberInput(e.target.value, parseInt);
                  if (value !== undefined) onUpdate(item.id, { replicas: value });
                }}
                  className="w-8 bg-transparent outline-none font-mono text-xs text-center dark:text-slate-200"
                />
              </div>

              {(item.replicas || 1) > 1 && (
                <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm" title="Minimum group replicas required to be healthy">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">Min UP</span>
                  <input
                    type="number"
                    min="1"
                    max={item.replicas || 1}
                    value={item.minReplicasRequired || 1}
                    onChange={(e) => {
                    const value = parseNumberInput(e.target.value, parseInt);
                    if (value !== undefined) onUpdate(item.id, { minReplicasRequired: value });
                  }}
                    className="w-8 bg-transparent outline-none font-mono text-xs text-center dark:text-slate-200"
                  />
                </div>
              )}

              {chaosMode && (
                <button
                  onClick={() => {
                    if (isDown || isDegraded) {
                      onUpdate(item.id, { failedReplicas: 0 });
                    } else if (replicas > 1) {
                      setShowKillModal(true);
                    } else {
                      onUpdate(item.id, { failedReplicas: 1 });
                    }
                  }}
                  className={cn(
                    "p-1.5 rounded-lg border transition-all flex items-center gap-2",
                    (isDown || isDegraded)
                      ? "bg-red-600 border-red-700 text-white" 
                      : "bg-orange-50 border-orange-100 text-orange-600 dark:bg-orange-900/20 dark:border-orange-900/30"
                  )}
                  title={isDown || isDegraded ? "Restore Group" : "Kill Group"}
                >
                  {isDown || isDegraded ? <RefreshCcw className="w-3.5 h-3.5" /> : <Skull className="w-3.5 h-3.5" />}
                  <span className="text-[10px] font-bold uppercase">{isDown || isDegraded ? 'Restore' : 'Kill'}</span>
                </button>
              )}

              <button
                onClick={() => setShowNotes(!showNotes)}
                className={cn(
                  "p-2 transition-colors",
                  showNotes ? "text-blue-500" : "text-slate-400 hover:text-blue-400"
                )}
                title="Toggle Notes"
              >
                <StickyNote className="w-4 h-4" />
              </button>
              <button
                onClick={() => onRemove(item.id)}
                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          {showNotes && (
            <div className="px-4 py-3 bg-blue-50/30 dark:bg-blue-900/10 border-b border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-1 duration-200">
              <AutoExpandingTextarea
                value={item.notes || ''}
                onChange={(notes) => onUpdate(item.id, { notes })}
                placeholder="Add technical notes, assumptions, or documentation link..."
                className="text-xs text-slate-600 dark:text-slate-400 placeholder:text-slate-400 dark:placeholder:text-slate-600"
              />
            </div>
          )}
          <div className="p-4 space-y-4">
            {item.children?.map(child => (
              <ItemNode 
                key={child.id} 
                item={child} 
                onUpdate={onUpdate} 
                onRemove={onRemove} 
                onAddChild={onAddChild}
                depth={depth + 1}
                bottleneckIds={bottleneckIds}
                chaosMode={chaosMode}
                warnings={warnings}
              />
            ))}
            <div className="flex gap-2">
              <button
                onClick={() => onAddChild(item.id, 'component')}
                className="flex-1 py-2 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-500 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-all flex items-center justify-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Component
              </button>
              <button
                onClick={() => onAddChild(item.id, 'group')}
                className="flex-1 py-2 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-500 dark:hover:border-indigo-500 dark:hover:text-indigo-400 transition-all flex items-center justify-center gap-2 text-sm"
              >
                <FolderPlus className="w-4 h-4" />
                Add Group
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 w-full">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Component Name</label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="text-slate-300 dark:text-slate-600">
                  {getIcon(item)}
                </div>
                <IconPicker 
                  current={item.icon} 
                  onSelect={(icon) => onUpdate(item.id, { icon })} 
                />
              </div>
              <input
                type="text"
                value={item.name}
                onChange={(e) => onUpdate(item.id, { name: e.target.value })}
                className={cn(
                  "w-full bg-transparent border-b py-1 outline-none transition-all text-sm",
                  item.isOptional ? "text-slate-400 dark:text-slate-600 italic line-through border-transparent" : "text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 focus:border-blue-500"
                )}
              />
              <WarningBadge warnings={warnings?.[item.id]} />
              <CloudCatalogPicker 
                onSelect={(service) => onUpdate(item.id, { 
                  name: service.name, 
                  sla: service.sla, 
                  mttr: service.mttr, 
                  icon: service.icon 
                })} 
              />
            </div>
          </div>

          <div className="flex flex-col gap-1 w-full lg:w-auto">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Criticality</label>
            <button
              onClick={() => onUpdate(item.id, { isOptional: !item.isOptional })}
              className={cn(
                "p-1.5 rounded-lg border transition-all h-[38px] px-3 flex items-center gap-2",
                item.isOptional 
                  ? "bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700" 
                  : "bg-emerald-50 border-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:border-emerald-900/30"
              )}
              title={item.isOptional ? "Make Critical" : "Make Optional"}
            >
              {item.isOptional ? <ShieldAlert className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              <span className="text-[10px] font-bold uppercase whitespace-nowrap">{item.isOptional ? 'Optional' : 'Critical'}</span>
            </button>
          </div>

          <div className="flex flex-col gap-1 w-full lg:w-auto">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Input Mode</label>
            <div className="flex bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm h-[38px]">
              <button
                onClick={() => handleModeToggle('percentage')}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  mode === 'percentage' ? "bg-blue-600 text-white" : "text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
                title="Input SLA Percentage"
              >
                <Percent className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleModeToggle('downtime')}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  mode === 'downtime' ? "bg-blue-600 text-white" : "text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
                title="Input Acceptable Downtime"
              >
                <Clock className="w-4 h-4" />
              </button>
            </div>
          </div>

          {mode === 'percentage' ? (
            <div className="w-full lg:w-32">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">SLA (%)</label>
              <input
                type="number"
                step="0.00000001"
                min="0"
                max="100"
                value={item.sla}
                onChange={(e) => {
                  const value = parseNumberInput(e.target.value);
                  if (value !== undefined) onUpdate(item.id, { sla: value });
                }}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm dark:text-slate-200"
              />
            </div>
          ) : (
            <div className="w-full lg:w-48 flex gap-2">
              <div className="flex-1">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Downtime (sec)</label>
                <input
                  type="number"
                  min="0"
                  value={item.downtimeValue || 0}
                  onChange={(e) => {
                    const value = parseNumberInput(e.target.value);
                    if (value !== undefined) handleDowntimeChange(value, item.downtimePeriod || 'month');
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm dark:text-slate-200"
                />
              </div>
              <div className="w-20">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Per</label>
                <select
                  value={item.downtimePeriod || 'month'}
                  onChange={(e) => handleDowntimeChange(item.downtimeValue || 0, e.target.value as DowntimePeriod)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-xs h-[38px] dark:text-slate-200"
                >
                  <option value="day">Day</option>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                </select>
              </div>
            </div>
          )}

          <div className="w-full lg:w-24">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">MTTR (min)</label>
            <input
              type="number"
              min="1"
              value={item.mttr || 60}
              onChange={(e) => {
                const value = parseNumberInput(e.target.value, parseInt);
                if (value !== undefined) onUpdate(item.id, { mttr: value });
              }}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm dark:text-slate-200"
              title="Mean Time To Recovery (average time to fix)"
            />
          </div>

          <div className="w-full lg:w-20">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">RTO (min)</label>
            <input
              type="number"
              min="0"
              value={item.rto ?? ''}
              placeholder="—"
              onChange={(e) => onUpdate(item.id, { rto: parseNumberInput(e.target.value, parseInt) })}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm dark:text-slate-200"
              title="Recovery Time Objective (Target time to restore service)"
            />
          </div>

          <div className="w-full lg:w-20">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">RPO (min)</label>
            <input
              type="number"
              min="0"
              value={item.rpo ?? ''}
              placeholder="—"
              onChange={(e) => onUpdate(item.id, { rpo: parseNumberInput(e.target.value, parseInt) })}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm dark:text-slate-200"
              title="Recovery Point Objective (Acceptable data loss in minutes)"
            />
          </div>

          <div className="w-full lg:w-20">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Replicas</label>
            <input
              type="number"
              min="1"
              max="99"
              value={item.replicas || 1}
              onChange={(e) => {
                  const value = parseNumberInput(e.target.value, parseInt);
                  if (value !== undefined) onUpdate(item.id, { replicas: value });
                }}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm dark:text-slate-200"
            />
          </div>
          {(item.replicas || 1) > 1 && (
            <div className="w-full lg:w-20">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Min UP</label>
              <input
                type="number"
                min="1"
                max={item.replicas || 1}
                value={item.minReplicasRequired || 1}
                onChange={(e) => {
                    const value = parseNumberInput(e.target.value, parseInt);
                    if (value !== undefined) onUpdate(item.id, { minReplicasRequired: value });
                  }}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm dark:text-slate-200"
                title="Minimum replicas required to be healthy"
              />
            </div>
          )}
          {chaosMode && (
            <button
              onClick={() => {
                if (isDown || isDegraded) {
                  onUpdate(item.id, { failedReplicas: 0 });
                } else if (replicas > 1) {
                  setShowKillModal(true);
                } else {
                  onUpdate(item.id, { failedReplicas: 1 });
                }
              }}
              className={cn(
                "p-1.5 rounded-lg border transition-all flex items-center gap-2",
                (isDown || isDegraded)
                  ? "bg-red-600 border-red-700 text-white" 
                  : "bg-orange-50 border-orange-100 text-orange-600 dark:bg-orange-900/20 dark:border-orange-900/30"
              )}
              title={isDown || isDegraded ? "Restore Component" : "Fail Component"}
            >
              {isDown || isDegraded ? <RefreshCcw className="w-3.5 h-3.5" /> : <Skull className="w-3.5 h-3.5" />}
              <span className="text-[10px] font-bold uppercase">{isDown || isDegraded ? 'Restore' : 'Kill'}</span>
            </button>
          )}
          <button
            onClick={() => setShowNotes(!showNotes)}
            className={cn(
              "p-2 transition-colors",
              showNotes ? "text-blue-500" : "text-slate-300 dark:text-slate-600 hover:text-blue-400"
            )}
            title="Toggle Notes"
          >
            <StickyNote className="w-4 h-4" />
          </button>
          <button
            onClick={() => onRemove(item.id)}
            className="p-2 text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      )}
      {showNotes && !isGroup && (
        <div className="w-full mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-1 duration-200">
          <AutoExpandingTextarea
            value={item.notes || ''}
            onChange={(notes) => onUpdate(item.id, { notes })}
            placeholder="Add technical notes, assumptions, or documentation link..."
            className="text-xs text-slate-600 dark:text-slate-400 placeholder:text-slate-400 dark:placeholder:text-slate-600 font-medium"
          />
        </div>
      )}

      {showKillModal && (
        <KillModal 
          item={item} 
          onClose={() => setShowKillModal(false)}
          onConfirm={(failedCount) => {
            onUpdate(item.id, { failedReplicas: failedCount });
            setShowKillModal(false);
          }}
        />
      )}
    </div>
  );
};

export default ItemNode;
