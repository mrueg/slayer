'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Calculator, Layers, FolderPlus, Component, RefreshCcw, Eraser, Clock, Percent, Network, List, Moon, Sun, AlertTriangle } from 'lucide-react';
import { 
  SLAItem, 
  calculateSLA, 
  getDowntime, 
  formatDuration,
  slaFromDowntime,
  formatSLAPercentage,
  DowntimePeriod,
  InputMode,
  findBottleneck
} from '@/lib/sla-calculator';
import TopologyView from './TopologyView';
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
  bottleneckId: string;
}

const ItemNode: React.FC<ItemNodeProps> = ({ item, onUpdate, onRemove, onAddChild, depth, bottleneckId }) => {
  const isGroup = item.type === 'group';
  const mode = item.inputMode || 'percentage';
  const isBottleneck = item.id === bottleneckId;

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
        ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm mb-4" 
        : "bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800 p-4 flex flex-col md:flex-row gap-4 items-end group",
      depth > 0 && isGroup && "ml-4 md:ml-8",
      isBottleneck && "ring-2 ring-red-500 dark:ring-red-600 shadow-lg shadow-red-500/10"
    )}>
      {isBottleneck && (
        <div className="absolute -top-2 -right-2 bg-red-600 text-white px-2 py-0.5 rounded text-[8px] font-black flex items-center gap-1 z-20 animate-pulse shadow-md">
          <AlertTriangle className="w-2 h-2" />
          SYSTEM BOTTLENECK
        </div>
      )}
      {isGroup ? (
        <>
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between bg-slate-50/50 dark:bg-slate-900/20 gap-4">
            <div className="flex items-center gap-3">
              <Layers className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                value={item.name}
                onChange={(e) => onUpdate(item.id, { name: e.target.value })}
                className="bg-transparent font-semibold text-slate-700 dark:text-slate-200 outline-none focus:ring-b-2 focus:ring-blue-500 border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 transition-all"
              />
              <span className="text-xs font-mono bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                {formatSLAPercentage(calculateSLA(item))}%
              </span>
            </div>
            <div className="flex items-center gap-2">
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
              <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Replicas</span>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={item.replicas || 1}
                  onChange={(e) => onUpdate(item.id, { replicas: parseInt(e.target.value) || 1 })}
                  className="w-8 bg-transparent outline-none font-mono text-xs text-center dark:text-slate-200"
                />
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
                bottleneckId={bottleneckId}
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
              <Component className="w-4 h-4 text-slate-300 dark:text-slate-600" />
              <input
                type="text"
                value={item.name}
                onChange={(e) => onUpdate(item.id, { name: e.target.value })}
                className="w-full bg-transparent border-b border-slate-200 dark:border-slate-700 py-1 outline-none focus:border-blue-500 transition-all text-sm dark:text-slate-200"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1 w-full md:w-auto">
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
            <div className="w-full md:w-32">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">SLA (%)</label>
              <input
                type="number"
                step="0.00000001"
                min="0"
                max="100"
                value={item.sla}
                onChange={(e) => onUpdate(item.id, { sla: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm dark:text-slate-200"
              />
            </div>
          ) : (
            <div className="w-full md:w-48 flex gap-2">
              <div className="flex-1">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Downtime (sec)</label>
                <input
                  type="number"
                  min="0"
                  value={item.downtimeValue || 0}
                  onChange={(e) => handleDowntimeChange(parseFloat(e.target.value) || 0, item.downtimePeriod || 'month')}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm dark:text-slate-200"
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

          <div className="w-full md:w-20">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Replicas</label>
            <input
              type="number"
              min="1"
              max="99"
              value={item.replicas || 1}
              onChange={(e) => onUpdate(item.id, { replicas: parseInt(e.target.value) || 1 })}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm dark:text-slate-200"
            />
          </div>
          <button
            onClick={() => onRemove(item.id)}
            className="p-2 text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors"
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
  const [view, setView] = useState<'list' | 'topology'>('list');
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

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
  const bottleneck = useMemo(() => findBottleneck(root), [root]);

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 md:p-8 font-sans transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white flex items-center gap-3 italic">
              <Calculator className="w-10 h-10 text-blue-600" />
              slayer | composite SLA calculator
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1 font-bold italic tracking-wide">Raining Blood (and Uptime)</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <div className="flex bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
              <button
                onClick={() => setView('list')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                  view === 'list' ? "bg-blue-600 text-white shadow-md" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                )}
              >
                <List className="w-4 h-4" />
                List
              </button>
              <button
                onClick={() => setView('topology')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                  view === 'topology' ? "bg-blue-600 text-white shadow-md" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                )}
              >
                <Network className="w-4 h-4" />
                Topology
              </button>
            </div>
            <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-800 mx-2" />
            <div className="flex gap-2">
            <button 
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
            >
              <RefreshCcw className="w-4 h-4" />
              Reset Example
            </button>
            <button 
              onClick={handleClear}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-100 dark:hover:border-red-800 transition-colors shadow-sm"
            >
              <Eraser className="w-4 h-4" />
              Clear All
            </button>
          </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {view === 'list' ? (
              <ItemNode 
                item={root} 
                onUpdate={onUpdate} 
                onRemove={onRemove} 
                onAddChild={onAddChild} 
                depth={0} 
                bottleneckId={bottleneck.id}
              />
            ) : (
              <TopologyView root={root} bottleneckId={bottleneck.id} />
            )}
          </div>

          <div className="space-y-6">
            <section className="bg-slate-900 dark:bg-slate-900 border border-slate-800 text-white rounded-2xl shadow-xl overflow-hidden sticky top-8 transition-colors">
              <div className="p-8 text-center bg-gradient-to-br from-blue-600 to-indigo-700 dark:from-blue-700 dark:to-indigo-900">
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

        <footer className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800 text-center text-slate-400 dark:text-slate-600 text-sm font-medium italic">
          South of Heaven, North of Five Nines
        </footer>
      </div>
    </div>
  );
}
