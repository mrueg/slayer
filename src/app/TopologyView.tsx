'use client';

import React from 'react';
import { SLAItem, calculateSLA, formatSLAPercentage } from '@/lib/sla-calculator';
import { 
  Layers, Component, Zap, Shield, Database, Globe, MousePointer2, AlertTriangle, ToggleRight, ShieldCheck, Server, ZapOff, HardDrive, Cpu, Network,
  Cloud, Lock, Settings, MessageSquare, Mail, Terminal, Box, Smartphone, Monitor, Code, Activity, Skull, RefreshCcw, Flame
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface TopologyViewProps {
  root: SLAItem;
  bottleneckIds: string[];
  layout: 'horizontal' | 'vertical';
  chaosMode: boolean;
  onUpdate: (id: string, updates: Partial<SLAItem>) => void;
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

const TopologyNode: React.FC<{ 
  item: SLAItem; 
  depth: number; 
  bottleneckIds: string[]; 
  layout: 'horizontal' | 'vertical';
  chaosMode: boolean;
  onUpdate: (id: string, updates: Partial<SLAItem>) => void;
}> = ({ 
  item, 
  depth,
  bottleneckIds,
  layout,
  chaosMode,
  onUpdate
}) => {
  const isGroup = item.type === 'group';
  const sla = calculateSLA(item);
  const isBottleneck = bottleneckIds.includes(item.id);
  const isOptional = item.isOptional;
  const isFailed = item.isFailed;
  const isVertical = layout === 'vertical';

  return (
    <div className={cn(
      "flex items-center transition-all duration-500",
      isVertical ? "flex-col" : "flex-row"
    )}>
      {/* Node Card */}
      <div className={cn(
        "relative group flex items-center",
        isVertical ? "flex-col" : "flex-row"
      )}>
        {/* Left/Top connector from parent */}
        {depth > 0 && (
          <div className={cn(
            isVertical ? "w-[2px] h-10" : "w-10 h-[2px]",
            "flex-shrink-0 transition-colors duration-500",
            isFailed ? "bg-red-500" : (isOptional ? "bg-slate-200 dark:bg-slate-800" : "bg-slate-300 dark:bg-slate-700")
          )} />
        )}

        <div className={cn(
          "relative p-4 rounded-xl border-2 transition-all duration-500 min-w-[220px] max-w-[220px] z-10",
          isGroup 
            ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-lg group-hover:border-blue-400 dark:group-hover:border-blue-500" 
            : "bg-slate-900 dark:bg-black border-slate-800 dark:border-slate-800 shadow-xl group-hover:border-slate-600 dark:group-hover:border-slate-700",
          isBottleneck && !isFailed && "ring-2 ring-red-500 dark:ring-red-600 border-red-500 dark:border-red-600",
          isOptional && !isFailed && "opacity-50 grayscale-[0.5] border-dashed",
          isFailed && "ring-4 ring-red-600 border-red-600 bg-red-50 dark:bg-red-950/30 shadow-2xl animate-in shake-1 duration-500"
        )}>
          {isBottleneck && !isFailed && (
            <div className="absolute -top-2 -right-2 bg-red-600 text-white px-2 py-0.5 rounded text-[8px] font-black flex items-center gap-1 z-20 animate-pulse shadow-md">
              <AlertTriangle className="w-2 h-2" />
              BOTTLENECK
            </div>
          )}
          {isFailed && (
            <div className="absolute -top-2 -right-2 bg-red-600 text-white px-2 py-0.5 rounded text-[8px] font-black flex items-center gap-1 z-20 shadow-md animate-bounce">
              <Skull className="w-2 h-2" />
              DOWN
            </div>
          )}
          {isOptional && !isFailed && (
            <div className="absolute -top-2 -left-2 bg-slate-500 text-white px-2 py-0.5 rounded text-[8px] font-black flex items-center gap-1 z-20 shadow-md">
              <ShieldCheck className="w-2 h-2" />
              OPTIONAL
            </div>
          )}
          <div className="flex items-center gap-3 mb-3">
            <div className={cn(
              "p-1.5 rounded-lg transition-colors duration-500",
              isFailed ? "bg-red-100 dark:bg-red-900/40" : (isGroup ? "bg-blue-50 dark:bg-blue-900/20" : "bg-slate-800 dark:bg-slate-900")
            )}>
              {isFailed ? <Flame className="w-4 h-4 text-red-600" /> : getIcon(item)}
            </div>
            <span className={cn(
              "font-bold text-xs truncate transition-colors duration-500",
              isFailed ? "text-red-700 dark:text-red-400" : (isGroup ? "text-slate-700 dark:text-slate-200" : "text-slate-200 dark:text-slate-300"),
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
                  "text-[10px] font-bold px-2 py-0.5 rounded transition-colors duration-500",
                  isFailed ? "bg-red-200 dark:bg-red-900/60 text-red-800 dark:text-red-200" : (
                    isGroup 
                      ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300" 
                      : "bg-slate-800 dark:bg-slate-900 text-slate-400 dark:text-slate-500 border border-slate-700 dark:border-slate-800"
                  )
                )}>
                  {isGroup ? item.config?.toUpperCase() : `${item.replicas || 1} REPLICAS`}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-[9px] font-black uppercase tracking-wider mb-1 ${isGroup ? "text-slate-400 dark:text-slate-500" : "text-slate-500 dark:text-slate-600"}`}>
                SLA
              </div>
              <span className={cn(
                "font-mono text-sm font-black transition-colors duration-500",
                isFailed ? "text-red-600 dark:text-red-500" : (
                  isOptional ? "text-slate-400 dark:text-slate-600" : (isGroup ? "text-blue-600 dark:text-blue-400" : "text-blue-400 dark:text-blue-500")
                )
              )}>
                {isFailed ? "0.0" : (isOptional ? "100.0" : formatSLAPercentage(sla))}%
              </span>
            </div>
          </div>

          {chaosMode && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdate(item.id, { isFailed: !item.isFailed });
              }}
              className={cn(
                "absolute -bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[8px] font-black uppercase transition-all shadow-lg z-30",
                isFailed 
                  ? "bg-green-600 text-white hover:bg-green-500" 
                  : "bg-red-600 text-white hover:bg-red-500 animate-pulse"
              )}
            >
              {isFailed ? "Restore" : "Kill"}
            </button>
          )}

          {item.notes && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[9px] leading-relaxed text-slate-500 dark:text-slate-400 font-medium italic line-clamp-2">
                {item.notes}
              </p>
            </div>
          )}
        </div>

        {/* Right/Bottom connector to children */}
        {isGroup && item.children && item.children.length > 0 && (
          <div className={cn(
            "flex-shrink-0 relative transition-colors duration-500",
            isVertical ? "w-[2px] h-10" : "w-10 h-[2px]",
            isFailed ? "bg-red-500" : "bg-slate-300 dark:bg-slate-700"
          )}>
            <div className={cn(
              "absolute text-[8px] font-black px-1 border rounded uppercase z-20 whitespace-nowrap transition-colors duration-500",
              isVertical ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" : "left-1/2 -translate-x-1/2 -top-3",
              isFailed 
                ? "bg-red-600 text-white border-red-700" 
                : "bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700"
            )}>
              {item.config}
            </div>
            {item.config === 'parallel' && (item.children?.length || 0) > 1 && (item.failoverSla ?? 100) < 100 && (
              <div className={cn(
                "absolute flex items-center gap-1 text-[7px] font-bold bg-amber-50 dark:bg-amber-900/20 px-1 rounded border whitespace-nowrap z-20 transition-colors duration-500",
                isVertical ? "top-1/2 left-4 -translate-y-1/2" : "left-1/2 -translate-x-1/2 top-1.5",
                isFailed 
                  ? "text-white bg-red-600 border-red-700" 
                  : "text-amber-600 dark:text-amber-500 border-amber-100 dark:border-amber-900/30"
              )}>
                <ToggleRight className="w-2 h-2" />
                SWITCH: {item.failoverSla}%
              </div>
            )}
          </div>
        )}
      </div>

      {/* Children Container */}
      {isGroup && item.children && item.children.length > 0 && (
        <div className={cn(
          "flex relative transition-all duration-500",
          isVertical ? "flex-row gap-8 pt-4" : "flex-col gap-6 ml-0"
        )}>
          {/* Connector line connecting children */}
          {item.children.length > 1 && (
            <div className={cn(
              "absolute transition-colors duration-500",
              isFailed ? "bg-red-500" : "bg-slate-300 dark:bg-slate-700",
              isVertical 
                ? "top-0 left-0 right-0 h-[2px] mx-auto" 
                : "top-0 bottom-0 left-0 w-[2px] my-auto"
            )} 
            style={isVertical 
              ? { width: 'calc(100% - 220px)', top: '0' } 
              : { height: 'calc(100% - 60px)' }
            } />
          )}
          {item.children.map((child) => (
            <TopologyNode 
              key={child.id} 
              item={child} 
              depth={depth + 1}
              bottleneckIds={bottleneckIds}
              layout={layout}
              chaosMode={chaosMode}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function TopologyView({ root, bottleneckIds, layout, chaosMode, onUpdate }: TopologyViewProps) {
  return (
    <div className={cn(
      "w-full overflow-auto rounded-3xl border shadow-inner min-h-[600px] relative group/canvas transition-colors duration-700",
      chaosMode ? "bg-red-50/20 dark:bg-red-950/10 border-red-200 dark:border-red-900/50" : "bg-slate-100/50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800"
    )}>
      <div className={cn(
        "absolute top-6 left-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest backdrop-blur px-3 py-1.5 rounded-full border z-20 transition-all",
        chaosMode 
          ? "bg-red-600 text-white border-red-700 animate-pulse" 
          : "bg-white/80 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700"
      )}>
        {chaosMode ? <Flame className="w-3 h-3" /> : <MousePointer2 className="w-3 h-3" />}
        {chaosMode ? "Chaos Simulation Active" : "Interactive Topology Map"}
      </div>
      <div className="p-24 min-w-max flex items-center justify-center min-h-full">
        <TopologyNode 
          item={root} 
          depth={0} 
          bottleneckIds={bottleneckIds} 
          layout={layout} 
          chaosMode={chaosMode}
          onUpdate={onUpdate}
        />
      </div>
      
      {/* Background Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]" 
           style={{ backgroundImage: `radial-gradient(${chaosMode ? '#f00' : '#000'} 1px, transparent 1px)`, backgroundSize: '24px 24px' }} />
    </div>
  );
}
