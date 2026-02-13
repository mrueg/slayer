'use client';

import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Info, Calculator, Layers, Share2, FolderPlus, Component, RefreshCcw, Eraser, Clock, Percent } from 'lucide-react';
import { 
  SLAItem, 
  Configuration, 
  calculateSLA, 
  getDowntime, 
  formatDuration,
  slaFromDowntime,
  formatSLAPercentage,
  DowntimePeriod,
  InputMode
} from '@/lib/sla-calculator';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper to update a deep item in the tree
const updateItemInTree = (items: SLAItem[], id: string, updates: Partial<SLAItem>): SLAItem[] => {
  return items.map(item => {
    if (item.id === id) {
      return { ...item, ...updates };
    }
    if (item.children) {
      return { ...item, children: updateItemInTree(item.children, id, updates) };
    }
    return item;
  });
};

// Helper to remove an item from the tree
const removeItemFromTree = (items: SLAItem[], id: string): SLAItem[] => {
  return items
    .filter(item => item.id !== id)
    .map(item => ({
      ...item,
      children: item.children ? removeItemFromTree(item.children, id) : undefined
    }));
};

// Helper to add a child to a specific group
const addChildToGroup = (items: SLAItem[], groupId: string, newItem: SLAItem): SLAItem[] => {
  return items.map(item => {
    if (item.id === groupId) {
      return { ...item, children: [...(item.children || []), newItem] };
    }
    if (item.children) {
      return { ...item, children: addChildToGroup(item.children, groupId, newItem) };
    }
    return item;
  });
};

interface ItemNodeProps {
  item: SLAItem;
  onUpdate: (id: string, updates: Partial<SLAItem>) => void;
  onRemove: (id: string) => void;
  onAddChild: (groupId: string, type: 'component' | 'group') => void;
  depth: number;
}

const ItemNode: React.FC<ItemNodeProps> = ({ item, onUpdate, onRemove, onAddChild, depth }) => {
  const isGroup = item.type === 'group';
  const mode = item.inputMode || 'percentage';

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
    <div className={cn(
      "relative rounded-xl transition-all border",
      isGroup 
        ? "bg-white border-slate-200 shadow-sm mb-4" 
        : "bg-slate-50 border-slate-100 p-4 flex flex-col md:flex-row gap-4 items-end group",
      depth > 0 && isGroup && "ml-4 md:ml-8"
    )}>
      {isGroup ? (
        <>
          <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between bg-slate-50/50 gap-4">
            <div className="flex items-center gap-3">
              <Layers className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={item.name}
                onChange={(e) => onUpdate(item.id, { name: e.target.value })}
                className="bg-transparent font-semibold text-slate-700 outline-none focus:ring-b-2 focus:ring-blue-500 border-b border-transparent hover:border-slate-300 transition-all"
              />
              <span className="text-xs font-mono bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                {formatSLAPercentage(calculateSLA(item))}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                <button
                  onClick={() => onUpdate(item.id, { config: 'series' })}
                  className={cn(
                    "px-3 py-1 text-xs rounded-md transition-all",
                    item.config === 'series' ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  Series
                </button>
                <button
                  onClick={() => onUpdate(item.id, { config: 'parallel' })}
                  className={cn(
                    "px-3 py-1 text-xs rounded-md transition-all",
                    item.config === 'parallel' ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  Parallel
                </button>
              </div>
              <button
                onClick={() => onRemove(item.id)}
                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="p-4 space-y-4">
            {item.children?.map(child => (
              <ItemNode 
                key={child.id} 
                item={child} 
                onUpdate={onUpdate} 
                onRemove={onRemove} 
                onAddChild={onAddChild}
                depth={depth + 1}
              />
            ))}
            <div className="flex gap-2">
              <button
                onClick={() => onAddChild(item.id, 'component')}
                className="flex-1 py-2 border border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-blue-400 hover:text-blue-500 transition-all flex items-center justify-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Component
              </button>
              <button
                onClick={() => onAddChild(item.id, 'group')}
                className="flex-1 py-2 border border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-indigo-400 hover:text-indigo-500 transition-all flex items-center justify-center gap-2 text-sm"
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
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Component Name</label>
            <div className="flex items-center gap-2">
              <Component className="w-4 h-4 text-slate-300" />
              <input
                type="text"
                value={item.name}
                onChange={(e) => onUpdate(item.id, { name: e.target.value })}
                className="w-full bg-transparent border-b border-slate-200 py-1 outline-none focus:border-blue-500 transition-all text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1 w-full md:w-auto">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Input Mode</label>
            <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm h-[38px]">
              <button
                onClick={() => handleModeToggle('percentage')}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  mode === 'percentage' ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-100"
                )}
                title="Input SLA Percentage"
              >
                <Percent className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleModeToggle('downtime')}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  mode === 'downtime' ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-100"
                )}
                title="Input Acceptable Downtime"
              >
                <Clock className="w-4 h-4" />
              </button>
            </div>
          </div>

          {mode === 'percentage' ? (
            <div className="w-full md:w-32">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">SLA (%)</label>
              <input
                type="number"
                step="0.00000001"
                min="0"
                max="100"
                value={item.sla}
                onChange={(e) => onUpdate(item.id, { sla: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm"
              />
            </div>
          ) : (
            <div className="w-full md:w-48 flex gap-2">
              <div className="flex-1">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Downtime (sec)</label>
                <input
                  type="number"
                  min="0"
                  value={item.downtimeValue || 0}
                  onChange={(e) => handleDowntimeChange(parseFloat(e.target.value) || 0, item.downtimePeriod || 'month')}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm"
                />
              </div>
              <div className="w-20">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Per</label>
                <select
                  value={item.downtimePeriod || 'month'}
                  onChange={(e) => handleDowntimeChange(item.downtimeValue || 0, e.target.value as DowntimePeriod)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-xs h-[38px]"
                >
                  <option value="day">Day</option>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                </select>
              </div>
            </div>
          )}

          <div className="w-full md:w-20">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Replicas</label>
            <input
              type="number"
              min="1"
              max="99"
              value={item.replicas || 1}
              onChange={(e) => onUpdate(item.id, { replicas: parseInt(e.target.value) || 1 })}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm"
            />
          </div>
          <button
            onClick={() => onRemove(item.id)}
            className="p-2 text-slate-300 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
};

export default function SLACalculator() {
  const defaultSystem: SLAItem = {
    id: 'root',
    name: 'Cloud Infrastructure',
    type: 'group',
    config: 'series',
    children: [
      { 
        id: 'dns', 
        name: 'Global DNS (Route53)', 
        type: 'component', 
        sla: 99.99, 
        replicas: 1 
      },
      { 
        id: 'ingress', 
        name: 'Edge Ingress', 
        type: 'group', 
        config: 'parallel', 
        children: [
          { id: 'lb-1', name: 'Primary Load Balancer', type: 'component', sla: 99.99, replicas: 1 },
          { id: 'lb-2', name: 'Secondary Load Balancer', type: 'component', sla: 99.99, replicas: 1 },
        ]
      },
      {
        id: 'app-layer',
        name: 'Application Tier',
        type: 'group',
        config: 'series',
        children: [
          { 
            id: 'web-api', 
            name: 'API Microservices', 
            type: 'component', 
            sla: 99.9, 
            replicas: 3 
          },
          { 
            id: 'auth-service', 
            name: 'Auth Service', 
            type: 'component', 
            sla: 99.95, 
            replicas: 2 
          },
        ]
      },
      {
        id: 'data-layer',
        name: 'Data Tier',
        type: 'group',
        config: 'parallel',
        children: [
          { id: 'db-primary', name: 'Aurora Primary', type: 'component', sla: 99.95, replicas: 1 },
          { id: 'db-replica', name: 'Aurora Replica', type: 'component', sla: 99.95, replicas: 1 },
        ]
      }
    ]
  };

  const [root, setRoot] = useState<SLAItem>(defaultSystem);

  const handleReset = () => {
    if (confirm('Reset to default example?')) {
      setRoot(defaultSystem);
    }
  };

  const handleClear = () => {
    if (confirm('Clear all components and start from scratch?')) {
      setRoot({
        id: 'root',
        name: 'New System',
        type: 'group',
        config: 'series',
        children: []
      });
    }
  };

  const compositeSla = useMemo(() => calculateSLA(root), [root]);

  const downtime = useMemo(() => getDowntime(compositeSla), [compositeSla]);

  const onUpdate = (id: string, updates: Partial<SLAItem>) => {
    if (id === 'root') {
      setRoot({ ...root, ...updates });
    } else {
      setRoot({ ...root, children: updateItemInTree(root.children || [], id, updates) });
    }
  };

  const onRemove = (id: string) => {
    if (id !== 'root') {
      setRoot({ ...root, children: removeItemFromTree(root.children || [], id) });
    }
  };

  const onAddChild = (groupId: string, type: 'component' | 'group') => {
    const newItem: SLAItem = type === 'component' 
      ? { id: Math.random().toString(36).substr(2, 9), name: 'New Component', type: 'component', sla: 99.9 }
      : { id: Math.random().toString(36).substr(2, 9), name: 'New Group', type: 'group', config: 'series', children: [] };
    
    if (groupId === 'root') {
      setRoot({ ...root, children: [...(root.children || []), newItem] });
    } else {
      setRoot({ ...root, children: addChildToGroup(root.children || [], groupId, newItem) });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tighter text-slate-900 flex items-center gap-3 uppercase italic">
              <Calculator className="w-10 h-10 text-blue-600" />
              slayer | composite SLA calculator
            </h1>
            <p className="text-slate-500 mt-1 font-bold italic tracking-wide">Raining Blood (and Uptime)</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
            >
              <RefreshCcw className="w-4 h-4" />
              Reset Example
            </button>
            <button 
              onClick={handleClear}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-white border border-slate-200 rounded-lg hover:bg-red-50 hover:border-red-100 transition-colors shadow-sm"
            >
              <Eraser className="w-4 h-4" />
              Clear All
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <ItemNode 
              item={root} 
              onUpdate={onUpdate} 
              onRemove={onRemove} 
              onAddChild={onAddChild} 
              depth={0} 
            />
          </div>

          <div className="space-y-6">
            <section className="bg-slate-900 text-white rounded-2xl shadow-xl overflow-hidden sticky top-8">
              <div className="p-8 text-center bg-gradient-to-br from-blue-600 to-indigo-700">
                <p className="text-blue-100 text-sm font-semibold uppercase tracking-widest mb-2">Total System SLA</p>
                <div className="text-5xl font-black mb-2 tracking-tighter">
                  {formatSLAPercentage(compositeSla)}%
                </div>
              </div>
              
              <div className="p-6 space-y-6">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 border-b border-slate-800 pb-2">Allowed Downtime</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm">Yearly</span>
                      <span className="font-mono font-medium">{formatDuration(downtime.downtimePerYear)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm">Monthly</span>
                      <span className="font-mono font-medium">{formatDuration(downtime.downtimePerMonth)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm">Daily</span>
                      <span className="font-mono font-medium">{formatDuration(downtime.downtimePerDay)}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800">
                  <div className="text-xs text-slate-500 space-y-2">
                    <p>• Series: Components depend on each other.</p>
                    <p>• Parallel: Components provide redundancy.</p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        <footer className="mt-12 pt-8 border-t border-slate-200 text-center text-slate-400 text-sm font-medium italic">
          South of Heaven, North of Five Nines
        </footer>
      </div>
    </div>
  );
}
