'use client';

import React from 'react';
import { SLAItem, calculateSLA, formatSLAPercentage } from '@/lib/sla-calculator';
import { Layers, Component, Zap, Shield, Database, Globe, MousePointer2 } from 'lucide-react';

interface TopologyViewProps {
  root: SLAItem;
}

const getIcon = (name: string, type: 'group' | 'component') => {
  const lowerName = name.toLowerCase();
  if (type === 'group') return <Layers className="w-4 h-4 text-blue-500" />;
  if (lowerName.includes('db') || lowerName.includes('data') || lowerName.includes('aurora')) return <Database className="w-4 h-4 text-amber-500" />;
  if (lowerName.includes('dns') || lowerName.includes('global')) return <Globe className="w-4 h-4 text-indigo-500" />;
  if (lowerName.includes('auth') || lowerName.includes('shield')) return <Shield className="w-4 h-4 text-emerald-500" />;
  if (lowerName.includes('api') || lowerName.includes('service')) return <Zap className="w-4 h-4 text-orange-500" />;
  return <Component className="w-4 h-4 text-slate-400" />;
};

const TopologyNode: React.FC<{ item: SLAItem; depth: number }> = ({ 
  item, 
  depth
}) => {
  const isGroup = item.type === 'group';
  const sla = calculateSLA(item);

  return (
    <div className="flex items-center">
      {/* Node Card */}
      <div className="relative group flex items-center">
        {/* Left connector from parent */}
        {depth > 0 && (
          <div className="w-10 h-[2px] bg-slate-300 flex-shrink-0" />
        )}

        <div className={`
          relative p-4 rounded-xl border-2 transition-all min-w-[220px] max-w-[220px] z-10
          ${isGroup 
            ? "bg-white border-slate-200 shadow-lg group-hover:border-blue-400" 
            : "bg-slate-900 border-slate-800 shadow-xl group-hover:border-slate-600"}
        `}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`p-1.5 rounded-lg ${isGroup ? "bg-blue-50" : "bg-slate-800"}`}>
              {getIcon(item.name, item.type)}
            </div>
            <span className={`font-bold text-xs truncate ${isGroup ? "text-slate-700" : "text-slate-200"}`}>
              {item.name}
            </span>
          </div>
          
          <div className="flex justify-between items-end">
            <div>
              <div className={`text-[9px] font-black uppercase tracking-wider mb-1 ${isGroup ? "text-slate-400" : "text-slate-500"}`}>
                {isGroup ? "Configuration" : "Redundancy"}
              </div>
              <span className={`
                text-[10px] font-bold px-2 py-0.5 rounded
                ${isGroup 
                  ? "bg-blue-100 text-blue-700" 
                  : "bg-slate-800 text-slate-400 border border-slate-700"}
              `}>
                {isGroup ? item.config?.toUpperCase() : `${item.replicas || 1} REPLICAS`}
              </span>
            </div>
            <div className="text-right">
              <div className={`text-[9px] font-black uppercase tracking-wider mb-1 ${isGroup ? "text-slate-400" : "text-slate-500"}`}>
                SLA
              </div>
              <span className={`font-mono text-sm font-black ${isGroup ? "text-blue-600" : "text-blue-400"}`}>
                {formatSLAPercentage(sla)}%
              </span>
            </div>
          </div>
        </div>

        {/* Right connector to children */}
        {isGroup && item.children && item.children.length > 0 && (
          <div className="w-10 h-[2px] bg-slate-300 flex-shrink-0 relative">
            <div className="absolute left-1/2 -translate-x-1/2 -top-3 text-[8px] font-black bg-white px-1 text-slate-400 border border-slate-200 rounded uppercase z-20">
              {item.config}
            </div>
          </div>
        )}
      </div>

      {/* Children Container */}
      {isGroup && item.children && item.children.length > 0 && (
        <div className="flex flex-col gap-6 relative">
          {/* Vertical line connecting children */}
          {item.children.length > 1 && (
            <div className="absolute top-0 bottom-0 left-0 w-[2px] bg-slate-300 my-auto" 
                 style={{ height: 'calc(100% - 60px)' }} />
          )}
          {item.children.map((child) => (
            <TopologyNode 
              key={child.id} 
              item={child} 
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function TopologyView({ root }: TopologyViewProps) {
  return (
    <div className="w-full overflow-auto bg-slate-100/50 rounded-3xl border border-slate-200 shadow-inner min-h-[600px] relative group/canvas">
      <div className="absolute top-6 left-6 flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest bg-white/80 backdrop-blur px-3 py-1.5 rounded-full border border-slate-200 z-20">
        <MousePointer2 className="w-3 h-3" />
        Interactive Topology Map
      </div>
      <div className="p-24 min-w-max flex items-center justify-center min-h-full">
        <TopologyNode item={root} depth={0} />
      </div>
      
      {/* Background Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" 
           style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
    </div>
  );
}
