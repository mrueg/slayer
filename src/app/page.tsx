'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Plus, Trash2, Calculator, Layers, FolderPlus, Component, RefreshCcw, Eraser, Clock, Percent, Network, List, Moon, Sun, AlertTriangle, Download, Upload, Activity, ChevronDown, Library, Share2, ShieldCheck, ShieldAlert,
  Database, Globe, Zap, Shield, ZapOff, Server, HardDrive, Cpu, Cloud, Lock, Settings, MessageSquare, Mail, Terminal, Box, Smartphone, Monitor, Code, Columns, Rows, StickyNote, Search, Skull, Flame, Dices, BarChart3, HelpCircle
} from 'lucide-react';
import { 
  SLAItem, 
  calculateSLA, 
  getDowntime, 
  formatDuration,
  slaFromDowntime,
  formatSLAPercentage,
  DowntimePeriod,
  InputMode,
  findBottleneck,
  calculateErrorBudget,
  getCalculationSteps,
  CalculationStep,
  calculateReliability,
  ReliabilityResult,
  runMonteCarlo,
  MonteCarloResult,
  getHistogramData,
  getBlastRadiusMap,
  calculateDRMetrics,
  DRResult
} from '@/lib/sla-calculator';
import TopologyView from './TopologyView';
import KillModal from './KillModal';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CLOUD_CATALOG = [
  { provider: 'AWS', name: 'S3 (Standard)', sla: 99.9, mttr: 120, icon: 'hardDrive' },
  { provider: 'AWS', name: 'Lambda', sla: 99.95, mttr: 15, icon: 'zap' },
  { provider: 'AWS', name: 'RDS (Multi-AZ)', sla: 99.95, mttr: 60, icon: 'database' },
  { provider: 'AWS', name: 'DynamoDB (Standard)', sla: 99.9, mttr: 20, icon: 'database' },
  { provider: 'AWS', name: 'DynamoDB (Global Tables)', sla: 99.999, mttr: 10, icon: 'database' },
  { provider: 'AWS', name: 'EC2 (Instance)', sla: 99.5, mttr: 60, icon: 'server' },
  { provider: 'AWS', name: 'Route53 (DNS)', sla: 100, mttr: 0, icon: 'globe' },
  { provider: 'AWS', name: 'CloudFront (CDN)', sla: 99.9, mttr: 45, icon: 'globe' },
  { provider: 'AWS', name: 'API Gateway', sla: 99.95, mttr: 15, icon: 'zap' },
  { provider: 'Azure', name: 'SQL Database', sla: 99.99, mttr: 30, icon: 'database' },
  { provider: 'Azure', name: 'App Service', sla: 99.95, mttr: 45, icon: 'cloud' },
  { provider: 'Azure', name: 'Cosmos DB', sla: 99.999, mttr: 10, icon: 'database' },
  { provider: 'Azure', name: 'Virtual Machines', sla: 99.9, mttr: 60, icon: 'server' },
  { provider: 'GCP', name: 'Compute Engine', sla: 99.9, mttr: 60, icon: 'server' },
  { provider: 'GCP', name: 'Cloud Storage', sla: 99.9, mttr: 90, icon: 'hardDrive' },
  { provider: 'GCP', name: 'Cloud Spanner', sla: 99.999, mttr: 10, icon: 'database' },
  { provider: 'GCP', name: 'BigQuery', sla: 99.9, mttr: 60, icon: 'database' },
  { provider: 'Cloudflare', name: 'Edge Workers', sla: 99.99, mttr: 5, icon: 'zap' },
  { provider: 'Cloudflare', name: 'KV Storage', sla: 99.99, mttr: 10, icon: 'database' },
];

const ICON_MAP = {
  layers: Layers,
  component: Component,
  database: Database,
  globe: Globe,
  zap: Zap,
  shield: Shield,
  zapOff: ZapOff,
  server: Server,
  hardDrive: HardDrive,
  cpu: Cpu,
  cloud: Cloud,
  lock: Lock,
  settings: Settings,
  messageSquare: MessageSquare,
  mail: Mail,
  terminal: Terminal,
  box: Box,
  smartphone: Smartphone,
  monitor: Monitor,
  code: Code,
  network: Network,
  activity: Activity
};

const getIcon = (item: SLAItem) => {
  if (item.icon && ICON_MAP[item.icon as keyof typeof ICON_MAP]) {
    const IconComp = ICON_MAP[item.icon as keyof typeof ICON_MAP];
    return <IconComp className="w-4 h-4" />;
  }
  
  const name = item.name.toLowerCase();
  const type = item.type;
  
  if (type === 'group') return <Layers className="w-4 h-4" />;
  if (name.includes('db') || name.includes('data') || name.includes('aurora')) return <Database className="w-4 h-4" />;
  if (name.includes('dns') || name.includes('global') || name.includes('cdn')) return <Globe className="w-4 h-4" />;
  if (name.includes('auth') || name.includes('shield') || name.includes('security')) return <Shield className="w-4 h-4" />;
  if (name.includes('api') || name.includes('service') || name.includes('lambda')) return <Zap className="w-4 h-4" />;
  if (name.includes('power') || name.includes('grid') || name.includes('gen')) return <ZapOff className="w-4 h-4" />;
  if (name.includes('rack') || name.includes('blade') || name.includes('server')) return <Server className="w-4 h-4" />;
  if (name.includes('router') || name.includes('switch') || name.includes('net')) return <Network className="w-4 h-4" />;
  if (name.includes('storage') || name.includes('s3') || name.includes('disk')) return <HardDrive className="w-4 h-4" />;
  if (name.includes('compute') || name.includes('cpu') || name.includes('node')) return <Cpu className="w-4 h-4" />;
  return <Component className="w-4 h-4" />;
};

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

const IconPicker: React.FC<{ current: string | undefined, onSelect: (name: string) => void }> = ({ current, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 transition-all shadow-sm"
        title="Select Icon"
      >
        <ChevronDown className={cn("w-3 h-3 transition-transform", isOpen && "rotate-180")} />
      </button>
      
      {isOpen && (
        <div className="absolute top-full mt-2 left-0 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[100] p-2 grid grid-cols-4 gap-1 animate-in fade-in zoom-in-95 duration-100">
          {Object.entries(ICON_MAP).map(([name, Icon]) => (
            <button
              key={name}
              onClick={() => {
                onSelect(name);
                setIsOpen(false);
              }}
              className={cn(
                "p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center transition-colors",
                current === name ? "text-blue-500 bg-blue-50 dark:bg-blue-900/30" : "text-slate-400 dark:text-slate-500"
              )}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
          <button
            onClick={() => {
              onSelect('');
              setIsOpen(false);
            }}
            className="col-span-4 mt-1 py-1 text-[10px] font-bold uppercase text-slate-400 hover:text-red-500 transition-colors"
          >
            Reset to Auto
          </button>
        </div>
      )}
    </div>
  );
};

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

const AutoExpandingTextarea: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, placeholder, className }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "w-full bg-transparent overflow-hidden resize-none",
        className
      )}
      rows={1}
    />
  );
};

interface ItemNodeProps {
  item: SLAItem;
  onUpdate: (id: string, updates: Partial<SLAItem>) => void;
  onRemove: (id: string) => void;
  onAddChild: (groupId: string, type: 'component' | 'group') => void;
  depth: number;
  bottleneckIds: string[];
  chaosMode: boolean;
}

const ItemNode: React.FC<ItemNodeProps> = ({ item, onUpdate, onRemove, onAddChild, depth, bottleneckIds, chaosMode }) => {
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
    <div className={cn(
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
                  item.isOptional ? "text-slate-400 dark:text-slate-600 italic line-through" : "text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600"
                )}
              />
              <span className={cn(
                "text-xs font-mono px-2 py-0.5 rounded-full transition-colors",
                item.isOptional ? "bg-slate-200 dark:bg-slate-800 text-slate-500" : "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
              )}>
                {formatSLAPercentage(calculateSLA(item))}%
              </span>
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
                    onChange={(e) => onUpdate(item.id, { minChildrenRequired: parseInt(e.target.value) || 1 })}
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
                    onChange={(e) => onUpdate(item.id, { failoverSla: parseFloat(e.target.value) || 0 })}
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
                  onChange={(e) => onUpdate(item.id, { replicas: parseInt(e.target.value) || 1 })}
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
                    onChange={(e) => onUpdate(item.id, { minReplicasRequired: parseInt(e.target.value) || 1 })}
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
                onChange={(e) => onUpdate(item.id, { sla: parseFloat(e.target.value) || 0 })}
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
                  onChange={(e) => handleDowntimeChange(parseFloat(e.target.value) || 0, item.downtimePeriod || 'month')}
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
              onChange={(e) => onUpdate(item.id, { mttr: parseInt(e.target.value) || 1 })}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm dark:text-slate-200"
              title="Mean Time To Recovery (average time to fix)"
            />
          </div>

          <div className="w-full lg:w-20">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">RTO (min)</label>
            <input
              type="number"
              min="0"
              value={item.rto || 0}
              onChange={(e) => onUpdate(item.id, { rto: parseInt(e.target.value) || 0 })}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm dark:text-slate-200"
              title="Recovery Time Objective (Target time to restore service)"
            />
          </div>

          <div className="w-full lg:w-20">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">RPO (min)</label>
            <input
              type="number"
              min="0"
              value={item.rpo || 0}
              onChange={(e) => onUpdate(item.id, { rpo: parseInt(e.target.value) || 0 })}
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
              onChange={(e) => onUpdate(item.id, { replicas: parseInt(e.target.value) || 1 })}
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
                onChange={(e) => onUpdate(item.id, { minReplicasRequired: parseInt(e.target.value) || 1 })}
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

const TEMPLATES: Record<string, { name: string, data: SLAItem }> = {
  serverless: {
    name: "Modern Serverless App (AWS)",
    data: {
      id: 'root',
      name: 'E-Commerce Platform',
      type: 'group',
      config: 'series',
      children: [
        { id: 'dns', name: 'Route53 DNS', type: 'component', sla: 100, replicas: 1, notes: "AWS provides 100% SLA for Route53 DNS.", mttr: 5 },
        { id: 'cdn', name: 'CloudFront CDN', type: 'component', sla: 99.9, replicas: 1, notes: "Includes edge locations and global delivery.", mttr: 45 },
        { 
          id: 'frontend', 
          name: 'Frontend Assets (S3)', 
          type: 'component', 
          sla: 99.9, 
          replicas: 1,
          notes: "Static hosting in US-East-1.",
          mttr: 60
        },
        {
          id: 'backend',
          name: 'API & Business Logic',
          type: 'group',
          config: 'series',
          notes: "Core transactional path.",
          children: [
            { id: 'api-g', name: 'API Gateway', type: 'component', sla: 99.95, replicas: 2, minReplicasRequired: 1, mttr: 15 },
            { id: 'lambda', name: 'Lambda (Compute)', type: 'component', sla: 99.95, replicas: 3, minReplicasRequired: 2, mttr: 10 },
            { id: 'dynamo', name: 'DynamoDB (Global)', type: 'component', sla: 99.999, replicas: 1, notes: "Global tables with multi-region replication.", mttr: 5 },
          ]
        },
        { 
          id: 'analytics', 
          name: 'Optional Analytics (Segment)', 
          type: 'component', 
          sla: 99.9, 
          replicas: 1,
          isOptional: true,
          notes: "Non-critical tracking. System remains functional if this fails.",
          mttr: 30
        },
      ]
    }
  },
  multi_az: {
    name: "High Availability DB Cluster",
    data: {
      id: 'root',
      name: 'PostgreSQL HA Cluster',
      type: 'group',
      config: 'parallel',
      failoverSla: 99.99,
      notes: "Standard HA pattern with primary and hot standby.",
      children: [
        { 
          id: 'primary', 
          name: 'Primary Node (US-East-1a)', 
          type: 'component', 
          sla: 99.95, 
          replicas: 1,
          notes: "Single-instance SLA for RDS.",
          mttr: 60
        },
        { 
          id: 'standby', 
          name: 'Hot Standby (US-East-1b)', 
          type: 'component', 
          sla: 99.95, 
          replicas: 1,
          notes: "Synchronous replication enabled.",
          mttr: 60
        },
        { 
          id: 'backup', 
          name: 'Cold Backup (S3)', 
          type: 'component', 
          sla: 99.9, 
          replicas: 1,
          isOptional: true,
          notes: "Daily snapshots. RTO: 4 hours.",
          mttr: 240
        },
      ]
    }
  },
  on_prem: {
    name: "On-Premise Tier-III Datacenter",
    data: {
      id: 'root',
      name: 'Corporate Datacenter',
      type: 'group',
      config: 'series',
      notes: "Physical facility dependencies.",
      children: [
        {
          id: 'power',
          name: 'Power Infrastructure',
          type: 'group',
          config: 'parallel',
          failoverSla: 99.999,
          notes: "Dual utility feeds with automatic ATS.",
          children: [
            { id: 'grid', name: 'Utility Grid Feed', type: 'component', sla: 99.9, replicas: 1, notes: "Reliability of local municipality feed.", mttr: 120 },
            { id: 'gen', name: 'Diesel Generators', type: 'component', sla: 99.0, replicas: 2, notes: "N+1 configuration with 48h fuel supply.", mttr: 15 },
          ]
        },
        {
          id: 'cooling',
          name: 'CRAC Cooling Units',
          type: 'group',
          config: 'parallel',
          notes: "Maintained at 22°C +/- 2°C.",
          children: [
            { id: 'chiller-1', name: 'Chiller A', type: 'component', sla: 99.5, replicas: 1, mttr: 180 },
            { id: 'chiller-2', name: 'Chiller B', type: 'component', sla: 99.5, replicas: 1, mttr: 180 },
          ]
        },
        {
          id: 'net',
          name: 'Core Networking',
          type: 'group',
          config: 'series',
          notes: "Fully redundant 100G core.",
          children: [
            { id: 'edge-router', name: 'Border Routers', type: 'component', sla: 99.99, replicas: 2, mttr: 30 },
            { id: 'core-switch', name: 'Core Switches', type: 'component', sla: 99.99, replicas: 2, mttr: 30 },
          ]
        },
        {
          id: 'compute',
          name: 'Compute Racks',
          type: 'group',
          config: 'parallel',
          notes: "Virtualized workload clusters.",
          children: [
            { id: 'rack-1', name: 'Rack A (Blade Chassis)', type: 'component', sla: 99.9, replicas: 1, mttr: 120 },
            { id: 'rack-2', name: 'Rack B (Blade Chassis)', type: 'component', sla: 99.9, replicas: 1, mttr: 120 },
          ]
        }
      ]
    }
  },
  global_api: {
    name: "Edge-First Global API",
    data: {
      id: 'root',
      name: 'Global API Architecture',
      type: 'group',
      config: 'series',
      notes: "Multi-region active-active deployment.",
      children: [
        { id: 'global-dns', name: 'Route53 Latency Routing', type: 'component', sla: 100, replicas: 1, notes: "Global entry point.", mttr: 5 },
        {
          id: 'regions',
          name: 'Regional Deployments',
          type: 'group',
          config: 'parallel',
          failoverSla: 99.9,
          notes: "Automatic failover between regions.",
          children: [
            { id: 'us-east', name: 'US-East Region (AWS)', type: 'component', sla: 99.99, replicas: 1, notes: "Northern Virginia cluster.", mttr: 30 },
            { id: 'eu-west', name: 'EU-West Region (AWS)', type: 'component', sla: 99.99, replicas: 1, notes: "Ireland cluster.", mttr: 30 },
            { id: 'ap-south', name: 'AP-South Region (AWS)', type: 'component', sla: 99.99, replicas: 1, notes: "Mumbai cluster.", mttr: 30 },
          ]
        },
        { id: 'global-db', name: 'Aurora Global Database', type: 'component', sla: 99.99, replicas: 1, notes: "Storage-level cross-region replication.", mttr: 10 },
      ]
    }
  },
  hybrid_cloud: {
    name: "Enterprise Hybrid Platform (Detailed)",
    data: {
      id: 'root',
      name: 'Financial Transaction Platform',
      type: 'group',
      config: 'series',
      notes: "Mission-critical hybrid stack spanning AWS and Private Datacenter.",
      children: [
        {
          id: 'ingress',
          name: 'Edge Ingress',
          type: 'group',
          config: 'series',
          children: [
            { id: 'dns', name: 'Global DNS', type: 'component', sla: 100, replicas: 1, icon: 'globe', mttr: 5 },
            { id: 'waf', name: 'WAF & DDoS Shield', type: 'component', sla: 99.99, replicas: 1, icon: 'shield', mttr: 15 },
          ]
        },
        {
          id: 'k8s-platform',
          name: 'Kubernetes Platform (EKS)',
          type: 'group',
          config: 'series',
          notes: "Modern cloud-native service layer.",
          children: [
            {
              id: 'k8s-control-plane',
              name: 'K8s Control Plane',
              type: 'group',
              config: 'parallel',
              minChildrenRequired: 2,
              notes: "High-availability etcd and API server cluster.",
              children: [
                { id: 'master-1', name: 'Control Node 1', type: 'component', sla: 99.95, replicas: 1, icon: 'cpu', mttr: 30 },
                { id: 'master-2', name: 'Control Node 2', type: 'component', sla: 99.95, replicas: 1, icon: 'cpu', mttr: 30 },
                { id: 'master-3', name: 'Control Node 3', type: 'component', sla: 99.95, replicas: 1, icon: 'cpu', mttr: 30 },
              ]
            },
            {
              id: 'k8s-data-plane',
              name: 'Worker Node Groups',
              type: 'group',
              config: 'parallel',
              minChildrenRequired: 2,
              notes: "Requires at least 2 functional node groups for capacity.",
              children: [
                { id: 'ng-1', name: 'Node Group A (m5.large)', type: 'component', sla: 99.9, replicas: 5, minReplicasRequired: 3, icon: 'layers', mttr: 15 },
                { id: 'ng-2', name: 'Node Group B (m5.large)', type: 'component', sla: 99.9, replicas: 5, minReplicasRequired: 3, icon: 'layers', mttr: 15 },
                { id: 'ng-3', name: 'Node Group C (m5.large)', type: 'component', sla: 99.9, replicas: 5, minReplicasRequired: 3, icon: 'layers', mttr: 15 },
              ]
            }
          ]
        },
        {
          id: 'dc-facility',
          name: 'On-Prem Private Cloud',
          type: 'group',
          config: 'series',
          notes: "Physical datacenter dependencies.",
          children: [
            {
              id: 'dc-power',
              name: 'Power & Cooling',
              type: 'group',
              config: 'parallel',
              failoverSla: 99.999,
              children: [
                { id: 'grid', name: 'Utility Grid Feed', type: 'component', sla: 99.9, replicas: 1, icon: 'zapOff', mttr: 240 },
                { id: 'diesel', name: 'N+1 Diesel Generators', type: 'component', sla: 99.0, replicas: 2, minReplicasRequired: 1, icon: 'zapOff', mttr: 10 },
              ]
            },
            {
              id: 'spine-leaf',
              name: 'Spine-Leaf Network',
              type: 'group',
              config: 'series',
              notes: "Non-blocking high-speed fabric.",
              children: [
                { id: 'spine', name: 'Core Spine Switches', type: 'component', sla: 99.999, replicas: 2, minReplicasRequired: 1, icon: 'network', mttr: 60 },
                { id: 'leaf', name: 'Top-of-Rack Leaf Switches', type: 'component', sla: 99.99, replicas: 2, minReplicasRequired: 1, icon: 'network', mttr: 30 },
              ]
            },
            {
              id: 'compute-racks',
              name: 'HCI Compute Racks',
              type: 'group',
              config: 'parallel',
              minChildrenRequired: 1,
              notes: "Hyper-Converged Infrastructure nodes.",
              children: [
                {
                  id: 'rack-a',
                  name: 'Rack Unit A',
                  type: 'group',
                  config: 'series',
                  children: [
                    { id: 'pdu-a', name: 'Dual PDUs', type: 'component', sla: 99.999, replicas: 2, minReplicasRequired: 1, icon: 'zap', mttr: 120 },
                    { id: 'blades-a', name: 'Blade Chassis (16 Nodes)', type: 'component', sla: 99.9, replicas: 16, minReplicasRequired: 12, icon: 'server', mttr: 45 }
                  ]
                },
                {
                  id: 'rack-b',
                  name: 'Rack Unit B',
                  type: 'group',
                  config: 'series',
                  children: [
                    { id: 'pdu-b', name: 'Dual PDUs', type: 'component', sla: 99.999, replicas: 2, minReplicasRequired: 1, icon: 'zap', mttr: 120 },
                    { id: 'blades-b', name: 'Blade Chassis (16 Nodes)', type: 'component', sla: 99.9, replicas: 16, minReplicasRequired: 12, icon: 'server', mttr: 45 }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  }
};

const HelpModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'engine' | 'simulation' | 'controls'>('engine');

  const sections = {
    engine: [
      {
        title: "Reliability Engine",
        icon: <Calculator className="w-4 h-4" />,
        content: [
          { label: "K-out-of-N Redundancy", text: "Support for 'Partial Failures'. Define 'Min UP' requirements (e.g. 2-out-of-3) to model systems that stay healthy at reduced capacity." },
          { label: "Failover Reliability", text: "Parallel groups include a 'Failover %' to model the success rate of the switch mechanism itself." },
          { label: "MTTR Modeling", text: "Input Mean Time To Recovery for components to calculate weighted system recovery times and yearly outage durations." },
                  { label: "Incident Frequency", text: "Estimated outages per year based on the statistical relationship between SLA and recovery time." },
                  { label: "RTO & RPO Modeling", text: "Define Recovery Time Objective (restoration time) and Recovery Point Objective (data loss window) to verify DR compliance." }
                ]
              },
          
      {
        title: "Productivity Tools",
        icon: <Settings className="w-4 h-4 text-blue-500" />,
        content: [
          { label: "Cloud SLA Catalog", text: "Searchable database of official SLAs from AWS, Azure, and GCP for one-click architectural modeling." },
          { label: "Impact Analysis", text: "Sensitivity engine that identifies 'System Bottlenecks' where improvements yield the highest gains." },
          { label: "Calculation Steps", text: "A 'Show Detailed Work' modal providing full mathematical transparency for both SLA and MTTR." },
          { label: "Shareable URLs", text: "Instantly encode your entire design into a Base64 URL for instant sharing without a backend." }
        ]
      }
    ],
    simulation: [
      {
        title: "Chaos & Simulation",
        icon: <Flame className="w-4 h-4 text-orange-500" />,
        content: [
          { label: "Chaos Mode", text: "Interactive mode to 'Kill' specific components or groups to see real-time blast radius and system degradation." },
          { label: "Blast Radius Heatmap", text: "Visual overlay that colors nodes based on their 'System Health Impact'—see which failures are catastrophic." },
          { label: "Monte Carlo Engine", text: "Runs 10,000 yearly simulations to show statistical variance, breach risk, and 'Bad Year' (P95) scenarios." },
          { label: "Distribution Histogram", text: "Visual bell curve of all 10,000 simulation outcomes to understand the 'long-tail' risk of your architecture." }
        ]
      }
    ],
    controls: [
      {
        title: "Node Controls",
        icon: <Component className="w-4 h-4 text-blue-500" />,
        content: [
          { label: "Critical/Optional", text: "Toggle whether a component is critical. Optional items are ignored in the total SLA calculation." },
          { label: "Kill / Restore", text: "In Chaos Mode, injects failures. If multiple replicas exist, you can choose how many to fail." },
          { label: "Lookup (Search)", text: "Opens the Cloud SLA Catalog to auto-fill metrics for standard AWS/GCP/Azure services." },
          { label: "RTO / RPO", text: "Restore Time and Data Loss window inputs. These values aggregate to show system-wide disaster recovery metrics." }
        ]
      },
      {
        title: "System Controls",
        icon: <Settings className="w-4 h-4 text-slate-500" />,
        content: [
          { label: "List/Topology", text: "Switch between the hierarchical editor and the visual infrastructure diagram." },
          { label: "Horizontal/Vertical", text: "In Topology view, reorient the diagram from a Left-to-Right flow to a Top-Down tree." },
          { label: "Chaos (Skull)", text: "Activates the failure simulation environment and the Blast Radius heatmap." }
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
                <p className="text-sm text-slate-500 dark:text-slate-400 font-bold tracking-tight uppercase opacity-70">Architecture reliability guide</p>
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
              Reliability Engine
            </button>
            <button
              onClick={() => setActiveTab('simulation')}
              className={cn(
                "px-4 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all",
                activeTab === 'simulation' ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              Chaos & Simulations
            </button>
            <button
              onClick={() => setActiveTab('controls')}
              className={cn(
                "px-4 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all",
                activeTab === 'controls' ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              Interface & Controls
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-2 gap-8 scrollbar-hide">
          {sections[activeTab].map((section, idx) => (
            <div key={idx} className="space-y-6">
              <div className="flex items-center gap-2 pb-2 border-b-2 border-slate-100 dark:border-slate-800">
                <div className="text-blue-600 dark:text-blue-400">{section.icon}</div>
                <h3 className="font-black uppercase tracking-widest text-xs text-slate-900 dark:text-white">{section.title}</h3>
              </div>
              <div className="space-y-6">
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
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="block text-[10px] font-black text-slate-400 uppercase mb-1">Median Year</span>
              <span className="text-xl font-black font-mono dark:text-white">{formatDuration(result.medianDowntime)}</span>
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
              {maxCount > 0 && (
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

const CalculationBreakdown: React.FC<{ steps: CalculationStep[], onClose: () => void }> = ({ steps, onClose }) => {
  const [activeTab, setActiveTab] = useState<'sla' | 'mttr'>('sla');

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
              SLA Breakdown
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
                  ) : (
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
  const [topologyLayout, setTopologyLayout] = useState<'horizontal' | 'vertical'>('vertical');
  const [darkMode, setDarkMode] = useState(false);
  const [chaosMode, setChaosMode] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showHistogram, setShowHistogram] = useState(false);
  const [showShareTooltip, setShowShareTooltip] = useState(false);
  const [consumedDowntime, setConsumedDowntime] = useState(0); // in seconds
  const [budgetPeriod, setBudgetPeriod] = useState<DowntimePeriod>('month');
  const [targetRto, setTargetRto] = useState(240); // 4 hours
  const [targetRpo, setTargetRpo] = useState(60); // 1 hour
  const [simulationResult, setSimulationResult] = useState<MonteCarloResult | null>(null);
  const [overrideTargetSla, setOverrideTargetSla] = useState<number | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Load from URL on mount
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      try {
        const decoded = JSON.parse(atob(hash));
        if (decoded && decoded.id) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setRoot(decoded);
        }
      } catch {
        console.error('Failed to decode configuration from URL');
      }
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (templateRef.current && !templateRef.current.contains(event.target as Node)) {
        setShowTemplates(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleReset = () => {
    if (confirm('Reset to default example?')) {
      setRoot(defaultSystem);
      setSimulationResult(null);
    }
  };

  const handleShare = () => {
    try {
      const encoded = btoa(JSON.stringify(root));
      const url = `${window.location.origin}${window.location.pathname}#${encoded}`;
      navigator.clipboard.writeText(url);
      window.location.hash = encoded;
      setShowShareTooltip(true);
      setTimeout(() => setShowShareTooltip(false), 2000);
    } catch {
      alert('Failed to generate share link');
    }
  };

  const handleLoadTemplate = (templateId: string) => {
    if (confirm(`Load the "${TEMPLATES[templateId].name}" template? This will replace your current work.`)) {
      setRoot(TEMPLATES[templateId].data);
      setShowTemplates(false);
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

  const handleExport = () => {
    const data = JSON.stringify(root, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `slayer-config-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        // Basic validation: check if it has an id and type
        if (json.id && json.type) {
          setRoot(json);
        } else {
          alert('Invalid SLAYER configuration file.');
        }
      } catch {
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  const handleRunSimulation = () => {
    setIsSimulating(true);
    // Use setTimeout to allow the UI to show loading state
    setTimeout(() => {
      const target = overrideTargetSla !== null ? overrideTargetSla : compositeSla;
      const result = runMonteCarlo(reliability, target, 10000);
      setSimulationResult(result);
      setIsSimulating(false);
    }, 50);
  };

  const { 
    compositeSla, 
    downtime, 
    bottleneck, 
    reliability, 
    calculationSteps, 
    errorBudget,
    blastRadiusMap,
    drMetrics
  } = useMemo(() => {
    const sla = calculateSLA(root);
    return {
      compositeSla: sla,
      downtime: getDowntime(sla),
      bottleneck: findBottleneck(root),
      reliability: calculateReliability(root),
      calculationSteps: getCalculationSteps(root),
      errorBudget: calculateErrorBudget(sla, consumedDowntime, budgetPeriod),
      blastRadiusMap: getBlastRadiusMap(root),
      drMetrics: calculateDRMetrics(root)
    };
  }, [root, consumedDowntime, budgetPeriod]);

  const onUpdate = (id: string, updates: Partial<SLAItem>) => {
    setSimulationResult(null); // Reset simulation when data changes
    if (id === 'root') {
      setRoot({ ...root, ...updates });
    } else {
      setRoot({ ...root, children: updateItemInTree(root.children || [], id, updates) });
    }
  };

  const onRemove = (id: string) => {
    setSimulationResult(null);
    if (id !== 'root') {
      setRoot({ ...root, children: removeItemFromTree(root.children || [], id) });
    }
  };

  const onAddChild = (groupId: string, type: 'component' | 'group') => {
    setSimulationResult(null);
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
      <div className="w-full mx-auto px-4">
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white flex items-center gap-3 italic">
              <Calculator className="w-10 h-10 text-blue-600" />
              slayer
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium text-xs tracking-tight">Reliability Engineering & Probabilistic Risk Modeling</p>
          </div>
          <div className="flex items-center gap-2">
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

            {view === 'topology' && (
              <div className="flex bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                <button
                  onClick={() => setTopologyLayout('horizontal')}
                  className={cn(
                    "p-1.5 rounded-md transition-all",
                    topologyLayout === 'horizontal' ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                  )}
                  title="Horizontal Layout"
                >
                  <Columns className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setTopologyLayout('vertical')}
                  className={cn(
                    "p-1.5 rounded-md transition-all",
                    topologyLayout === 'vertical' ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                  )}
                  title="Vertical Layout"
                >
                  <Rows className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1" />

            <div className="flex bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
              <button
                onClick={() => setChaosMode(!chaosMode)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                  chaosMode ? "bg-red-600 text-white shadow-md animate-pulse" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                )}
                title="Toggle Chaos Mode (Simulate Failures)"
              >
                {chaosMode ? <Flame className="w-4 h-4" /> : <Skull className="w-4 h-4" />}
                Chaos
              </button>
            </div>

            <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1" />

            <div className="flex items-center gap-1">
              <div className="relative" ref={templateRef}>
                <button 
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
                  title="Load infrastructure templates"
                >
                  <Library className="w-4 h-4" />
                  <span className="hidden xl:inline">Templates</span>
                  <ChevronDown className={cn("w-3 h-3 transition-transform", showTemplates && "rotate-180")} />
                </button>
                
                {showTemplates && (
                  <div className="absolute top-full mt-2 left-0 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-3 py-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700 mb-1">
                      Architecture Patterns
                    </div>
                    {Object.entries(TEMPLATES).map(([id, template]) => (
                      <button
                        key={id}
                        onClick={() => handleLoadTemplate(id)}
                        className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex flex-col"
                      >
                        <span className="font-bold">{template.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <button 
                  onClick={handleShare}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
                  title="Copy shareable URL to clipboard"
                >
                  <Share2 className="w-4 h-4" />
                  <span className="hidden xl:inline">Share</span>
                </button>
                {showShareTooltip && (
                  <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow-xl animate-in fade-in slide-in-from-top-1 z-50 whitespace-nowrap">
                    COPIED!
                  </div>
                )}
              </div>
            </div>

            <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1" />

            <div className="flex items-center gap-1">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
                title="Import configuration from JSON"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden xl:inline">Import</span>
              </button>
              <button 
                onClick={handleExport}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
                title="Export configuration to JSON"
              >
                <Download className="w-4 h-4" />
                <span className="hidden xl:inline">Export</span>
              </button>
            </div>

            <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1" />

            <div className="flex items-center gap-1">
              <button 
                onClick={handleReset}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
                title="Reset to default example"
              >
                <RefreshCcw className="w-4 h-4" />
                <span className="hidden xl:inline text-xs">Reset</span>
              </button>
              <button 
                onClick={handleClear}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-100 dark:hover:border-red-800 transition-colors shadow-sm"
                title="Clear all components"
              >
                <Eraser className="w-4 h-4" />
                <span className="hidden xl:inline text-xs text-red-600">Clear</span>
              </button>
            </div>

            <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1" />

            <button
              onClick={() => setShowHelp(true)}
              className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
              title="View Documentation"
            >
              <HelpCircle className="w-5 h-5" />
            </button>

            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </header>

        <div className="flex flex-col xl:flex-row gap-8 items-start">
          <div className="flex-1 w-full space-y-6">
            {view === 'list' ? (
              <ItemNode 
                item={root} 
                onUpdate={onUpdate} 
                onRemove={onRemove} 
                onAddChild={onAddChild} 
                depth={0} 
                bottleneckIds={bottleneck.ids}
                chaosMode={chaosMode}
              />
            ) : (
              <TopologyView 
                root={root} 
                bottleneckIds={bottleneck.ids} 
                layout={topologyLayout} 
                chaosMode={chaosMode}
                onUpdate={onUpdate}
                blastRadiusMap={blastRadiusMap}
              />
            )}
          </div>

          <div className="w-full xl:w-96 space-y-6 shrink-0">
            <section className="bg-slate-900 dark:bg-slate-900 border border-slate-800 text-white rounded-2xl shadow-xl overflow-hidden sticky top-8 transition-colors">
              <div className="p-8 text-center bg-gradient-to-br from-blue-600 to-indigo-700 dark:from-blue-700 dark:to-indigo-900">
                <p className="text-blue-100 text-sm font-semibold uppercase tracking-widest mb-2">Total System SLA</p>
                <div className="text-5xl font-black mb-2 tracking-tighter">
                  {formatSLAPercentage(compositeSla)}%
                </div>
                <button
                  onClick={() => setShowBreakdown(true)}
                  className="mt-4 px-4 py-1.5 bg-white/10 hover:bg-white/20 rounded-full text-[10px] font-black uppercase tracking-widest transition-all backdrop-blur-sm border border-white/10"
                >
                  Show Detailed Work
                </button>
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
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 pb-2">System Reliability</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm">System MTTR</span>
                      <span className="font-mono font-medium">{formatDuration(reliability.mttr)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm">Expected Frequency</span>
                      <span className="font-mono font-medium">
                        {reliability.frequency > 0 
                          ? `1 incident every ${(1 / reliability.frequency).toFixed(1)} years`
                          : "0 incidents"}
                      </span>
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

            <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm sticky top-[480px]">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Disaster Recovery (DR) Goals</h3>
              </div>
              
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Target RTO (min)</label>
                    <input
                      type="number"
                      min="0"
                      value={targetRto}
                      onChange={(e) => setTargetRto(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Target RPO (min)</label>
                    <input
                      type="number"
                      min="0"
                      value={targetRpo}
                      onChange={(e) => setTargetRpo(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm dark:text-slate-200"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="p-3 rounded-xl border flex items-center justify-between transition-all" style={{ 
                    backgroundColor: drMetrics.rto <= targetRto ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                    borderColor: drMetrics.rto <= targetRto ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'
                  }}>
                    <div>
                      <span className="block text-[9px] font-black uppercase text-slate-400">Actual System RTO</span>
                      <span className={cn("text-sm font-mono font-black", drMetrics.rto <= targetRto ? "text-emerald-600" : "text-red-600")}>
                        {formatDuration(drMetrics.rto)}
                      </span>
                    </div>
                    <div className={cn(
                      "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                      drMetrics.rto <= targetRto ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    )}>
                      {drMetrics.rto <= targetRto ? "GOAL MET" : "EXCEEDED"}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border flex items-center justify-between transition-all" style={{ 
                    backgroundColor: drMetrics.rpo <= targetRpo ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                    borderColor: drMetrics.rpo <= targetRpo ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'
                  }}>
                    <div>
                      <span className="block text-[9px] font-black uppercase text-slate-400">Actual System RPO</span>
                      <span className={cn("text-sm font-mono font-black", drMetrics.rpo <= targetRpo ? "text-emerald-600" : "text-red-600")}>
                        {formatDuration(drMetrics.rpo)}
                      </span>
                    </div>
                    <div className={cn(
                      "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                      drMetrics.rpo <= targetRpo ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    )}>
                      {drMetrics.rpo <= targetRpo ? "GOAL MET" : "EXCEEDED"}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm sticky top-[780px]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Dices className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Monte Carlo Simulation</h3>
                </div>
                <button
                  onClick={handleRunSimulation}
                  disabled={isSimulating}
                  className={cn(
                    "px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-400 text-white rounded-lg text-[10px] font-black uppercase transition-all shadow-md",
                    isSimulating && "animate-pulse"
                  )}
                >
                  {isSimulating ? "Running..." : "Run 10k Sims"}
                </button>
              </div>

              <div className="mb-4">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Target SLA for Simulation (%)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max="100"
                    value={overrideTargetSla !== null ? overrideTargetSla : compositeSla}
                    onChange={(e) => setOverrideTargetSla(parseFloat(e.target.value))}
                    className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono text-sm dark:text-slate-200"
                    placeholder={compositeSla.toString()}
                  />
                  {overrideTargetSla !== null && (
                    <button 
                      onClick={() => setOverrideTargetSla(null)}
                      className="text-[10px] font-bold text-indigo-500 hover:text-indigo-400 uppercase whitespace-nowrap"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <p className="mt-1.5 text-[9px] text-slate-400 leading-tight italic">
                  Default is system SLA ({formatSLAPercentage(compositeSla)}%). Change this to see risk vs a different contractual goal.
                </p>
              </div>

              {!simulationResult ? (
                <div className="py-4 text-center">
                  <p className="text-[10px] text-slate-400 italic">
                    Run a simulation to see the probability distribution of SLA breaches over a 1-year period.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Breach Probability</span>
                      <span className={cn(
                        "text-sm font-black font-mono",
                        simulationResult.breachProbability > 5 ? "text-red-500" : "text-emerald-500"
                      )}>
                        {simulationResult.breachProbability.toFixed(2)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          "h-full transition-all duration-1000",
                          simulationResult.breachProbability > 5 ? "bg-red-500" : "bg-emerald-500"
                        )}
                        style={{ width: `${Math.min(100, simulationResult.breachProbability)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[9px] text-slate-400 leading-tight">
                      Based on 10,000 yearly runs, there is a {simulationResult.breachProbability.toFixed(2)}% chance you will exceed your downtime budget.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700/50">
                      <span className="block text-[8px] font-black text-slate-400 uppercase mb-1">Median Year</span>
                      <span className="text-[10px] font-mono font-bold dark:text-white">{formatDuration(simulationResult.medianDowntime)}</span>
                    </div>
                    <div className="p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700/50">
                      <span className="block text-[8px] font-black text-slate-400 uppercase mb-1">Mean (Avg)</span>
                      <span className="text-[10px] font-mono font-bold dark:text-white">{formatDuration(simulationResult.meanDowntime)}</span>
                    </div>
                    <div className="p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700/50">
                      <span className="block text-[8px] font-black text-red-400 uppercase mb-1">P95 (Bad Year)</span>
                      <span className="text-[10px] font-mono font-bold text-red-500">{formatDuration(simulationResult.p95Downtime)}</span>
                    </div>
                    <div className="p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700/50">
                      <span className="block text-[8px] font-black text-red-600 uppercase mb-1">P99 (Calamity)</span>
                      <span className="text-[10px] font-mono font-bold text-red-600">{formatDuration(simulationResult.p99Downtime)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowHistogram(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl text-[10px] font-black uppercase transition-all"
                  >
                    <BarChart3 className="w-3 h-3" />
                    Show Distribution Histogram
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>

        <footer className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800 text-center text-slate-400 dark:text-slate-600 text-sm font-medium italic">
          South of Heaven, North of Five Nines
        </footer>
      </div>

      {showBreakdown && (
        <CalculationBreakdown 
          steps={calculationSteps} 
          onClose={() => setShowBreakdown(false)} 
        />
      )}

      {showHistogram && simulationResult && (
        <MonteCarloHistogram
          result={simulationResult}
          targetSla={overrideTargetSla !== null ? overrideTargetSla : compositeSla}
          onClose={() => setShowHistogram(false)}
        />
      )}

      {showHelp && (
        <HelpModal onClose={() => setShowHelp(false)} />
      )}
    </div>
  );
}
