'use client';

import React from 'react';
import { SLAItem, calculateSLA, formatSLAPercentage } from '@/lib/sla-calculator';
import { 
  Layers, Component, Zap, Shield, Database, Globe, MousePointer2, AlertTriangle, ToggleRight, ShieldCheck, Server, ZapOff, HardDrive, Cpu, Network,
  Cloud, Lock, Settings, MessageSquare, Mail, Terminal, Box, Smartphone, Monitor, Code, Activity
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface TopologyViewProps {
  root: SLAItem;
  bottleneckIds: string[];
}

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
  
  if (type === 'group') return <Layers className="w-4 h-4 text-blue-500" />;
  if (name.includes('db') || name.includes('data') || name.includes('aurora')) return <Database className="w-4 h-4 text-amber-500" />;
  if (name.includes('dns') || name.includes('global') || name.includes('cdn')) return <Globe className="w-4 h-4 text-indigo-500" />;
  if (name.includes('auth') || name.includes('shield') || name.includes('security')) return <Shield className="w-4 h-4 text-emerald-500" />;
  if (name.includes('api') || name.includes('service') || name.includes('lambda')) return <Zap className="w-4 h-4 text-orange-500" />;
  if (name.includes('power') || name.includes('grid') || name.includes('gen')) return <ZapOff className="w-4 h-4 text-yellow-500" />;
  if (name.includes('rack') || name.includes('blade') || name.includes('server')) return <Server className="w-4 h-4 text-slate-500" />;
  if (name.includes('router') || name.includes('switch') || name.includes('net')) return <Network className="w-4 h-4 text-blue-400" />;
  if (name.includes('storage') || name.includes('s3') || name.includes('disk')) return <HardDrive className="w-4 h-4 text-cyan-500" />;
  if (name.includes('compute') || name.includes('cpu') || name.includes('node')) return <Cpu className="w-4 h-4 text-red-500" />;
  return <Component className="w-4 h-4 text-slate-400" />;
};

const TopologyNode: React.FC<{ item: SLAItem; depth: number; bottleneckIds: string[] }> = ({ 
  item, 
  depth,
  bottleneckIds
}) => {
  const isGroup = item.type === 'group';
  const sla = calculateSLA(item);
  const isBottleneck = bottleneckIds.includes(item.id);
  const isOptional = item.isOptional;

  return (
    <div className="flex items-center">
      {/* Node Card */}
      <div className="relative group flex items-center">
        {/* Left connector from parent */}
        {depth > 0 && (
          <div className={cn(
            "w-10 h-[2px] flex-shrink-0",
            isOptional ? "bg-slate-200 dark:bg-slate-800" : "bg-slate-300 dark:bg-slate-700"
          )} />
        )}

        <div className={cn(
          "relative p-4 rounded-xl border-2 transition-all min-w-[220px] max-w-[220px] z-10",
          isGroup 
            ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-lg group-hover:border-blue-400 dark:group-hover:border-blue-500" 
            : "bg-slate-900 dark:bg-black border-slate-800 dark:border-slate-800 shadow-xl group-hover:border-slate-600 dark:group-hover:border-slate-700",
          isBottleneck && "ring-2 ring-red-500 dark:ring-red-600 border-red-500 dark:border-red-600",
          isOptional && "opacity-50 grayscale-[0.5] border-dashed"
        )}>
          {isBottleneck && (
            <div className="absolute -top-2 -right-2 bg-red-600 text-white px-2 py-0.5 rounded text-[8px] font-black flex items-center gap-1 z-20 animate-pulse shadow-md">
              <AlertTriangle className="w-2 h-2" />
              BOTTLENECK
            </div>
          )}
          {isOptional && (
            <div className="absolute -top-2 -left-2 bg-slate-500 text-white px-2 py-0.5 rounded text-[8px] font-black flex items-center gap-1 z-20 shadow-md">
              <ShieldCheck className="w-2 h-2" />
              OPTIONAL
            </div>
          )}
          <div className="flex items-center gap-3 mb-3">
            <div className={`p-1.5 rounded-lg ${isGroup ? "bg-blue-50 dark:bg-blue-900/20" : "bg-slate-800 dark:bg-slate-900"}`}>
              {getIcon(item)}
            </div>
            <span className={cn(
              "font-bold text-xs truncate",
              isGroup ? "text-slate-700 dark:text-slate-200" : "text-slate-200 dark:text-slate-300",
              isOptional && "line-through decoration-slate-400"
            )}>
              {item.name}
            </span>
          </div>
          
          <div className="flex justify-between items-end">
            <div>
              <div className={`text-[9px] font-black uppercase tracking-wider mb-1 ${isGroup ? "text-slate-400 dark:text-slate-500" : "text-slate-500 dark:text-slate-600"}`}>
                {isGroup ? "Configuration" : "Redundancy"}
              </div>
              <div className="flex gap-1">
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded",
                  isGroup 
                    ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300" 
                    : "bg-slate-800 dark:bg-slate-900 text-slate-400 dark:text-slate-500 border border-slate-700 dark:border-slate-800"
                )}>
                  {isGroup ? item.config?.toUpperCase() : `${item.replicas || 1} REPLICAS`}
                </span>
                {isGroup && (item.replicas || 1) > 1 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
                    {item.replicas}X
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className={`text-[9px] font-black uppercase tracking-wider mb-1 ${isGroup ? "text-slate-400 dark:text-slate-500" : "text-slate-500 dark:text-slate-600"}`}>
                SLA
              </div>
              <span className={cn(
                "font-mono text-sm font-black",
                isOptional ? "text-slate-400 dark:text-slate-600" : (isGroup ? "text-blue-600 dark:text-blue-400" : "text-blue-400 dark:text-blue-500")
              )}>
                {isOptional ? "100.0" : formatSLAPercentage(sla)}%
              </span>
            </div>
          </div>
        </div>

        {/* Right connector to children */}
        {isGroup && item.children && item.children.length > 0 && (
          <div className="w-10 h-[2px] bg-slate-300 dark:bg-slate-700 flex-shrink-0 relative">
            <div className="absolute left-1/2 -translate-x-1/2 -top-3 text-[8px] font-black bg-white dark:bg-slate-800 px-1 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded uppercase z-20 whitespace-nowrap">
              {item.config}
            </div>
            {item.config === 'parallel' && (item.children?.length || 0) > 1 && (item.failoverSla ?? 100) < 100 && (
              <div className="absolute left-1/2 -translate-x-1/2 top-1.5 flex items-center gap-1 text-[7px] font-bold text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-1 rounded border border-amber-100 dark:border-amber-900/30 whitespace-nowrap z-20">
                <ToggleRight className="w-2 h-2" />
                SWITCH: {item.failoverSla}%
              </div>
            )}
          </div>
        )}
      </div>

      {/* Children Container */}
      {isGroup && item.children && item.children.length > 0 && (
        <div className="flex flex-col gap-6 relative">
          {/* Vertical line connecting children */}
          {item.children.length > 1 && (
            <div className="absolute top-0 bottom-0 left-0 w-[2px] bg-slate-300 dark:bg-slate-700 my-auto" 
                 style={{ height: 'calc(100% - 60px)' }} />
          )}
          {item.children.map((child) => (
            <TopologyNode 
              key={child.id} 
              item={child} 
              depth={depth + 1}
              bottleneckIds={bottleneckIds}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function TopologyView({ root, bottleneckIds }: TopologyViewProps) {
  return (
    <div className="w-full overflow-auto bg-slate-100/50 dark:bg-slate-900/20 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-inner min-h-[600px] relative group/canvas transition-colors">
      <div className="absolute top-6 left-6 flex items-center gap-2 text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-widest bg-white/80 dark:bg-slate-800/80 backdrop-blur px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 z-20">
        <MousePointer2 className="w-3 h-3" />
        Interactive Topology Map
      </div>
      <div className="p-24 min-w-max flex items-center justify-center min-h-full">
        <TopologyNode item={root} depth={0} bottleneckIds={bottleneckIds} />
      </div>
      
      {/* Background Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]" 
           style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
    </div>
  );
}
