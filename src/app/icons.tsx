import React from 'react';
import {
  Layers, Component, Database, Globe, Zap, Shield, ZapOff, Server, HardDrive, Cpu, Cloud, Lock, Settings,
  MessageSquare, Mail, Terminal, Box, Smartphone, Monitor, Code, Network, Activity, type LucideIcon
} from 'lucide-react';
import { SLAItem } from '@/lib/sla-calculator';

export const ICON_MAP = {
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

// Fallback icons inferred from the item name, first match wins
const NAME_RULES: { keywords: string[]; Icon: LucideIcon; color: string }[] = [
  { keywords: ['db', 'data', 'aurora'], Icon: Database, color: 'text-amber-500' },
  { keywords: ['dns', 'global', 'cdn'], Icon: Globe, color: 'text-indigo-500' },
  { keywords: ['auth', 'shield', 'security'], Icon: Shield, color: 'text-emerald-500' },
  { keywords: ['api', 'service', 'lambda'], Icon: Zap, color: 'text-orange-500' },
  { keywords: ['power', 'grid', 'gen'], Icon: ZapOff, color: 'text-yellow-500' },
  { keywords: ['rack', 'blade', 'server'], Icon: Server, color: 'text-slate-500' },
  { keywords: ['router', 'switch', 'net'], Icon: Network, color: 'text-blue-400' },
  { keywords: ['storage', 's3', 'disk'], Icon: HardDrive, color: 'text-cyan-500' },
  { keywords: ['compute', 'cpu', 'node'], Icon: Cpu, color: 'text-red-500' },
];

/**
 * Returns the icon for an item: its custom icon if set, otherwise one
 * inferred from its type and name. `colored` tints the inferred icons
 * (used by the topology view).
 */
export const getIcon = (item: SLAItem, colored = false) => {
  if (item.icon && ICON_MAP[item.icon as keyof typeof ICON_MAP]) {
    const IconComp = ICON_MAP[item.icon as keyof typeof ICON_MAP];
    return <IconComp className="w-4 h-4" />;
  }

  const name = item.name.toLowerCase();
  const { Icon, color } = item.type === 'group'
    ? { Icon: Layers, color: 'text-blue-500' }
    : NAME_RULES.find(rule => rule.keywords.some(k => name.includes(k))) ?? { Icon: Component, color: 'text-slate-400' };

  return <Icon className={colored ? `w-4 h-4 ${color}` : 'w-4 h-4'} />;
};
