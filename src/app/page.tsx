'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Calculator,
  Undo2,
  Redo2,
  RefreshCcw,
  Eraser,
  Network,
  List,
  Moon,
  Sun,
  Download,
  Upload,
  Activity,
  ChevronDown,
  Library,
  Share2,
  ShieldCheck,
  Columns,
  Rows,
  Skull,
  Flame,
  Dices,
  BarChart3,
  HelpCircle,
  Play,
  RotateCw
} from 'lucide-react';
import {
  SLAItem,
  calculateSLA,
  getDowntime,
  formatDuration,
  formatSLAPercentage,
  DowntimePeriod,
  findBottleneck,
  getSensitivityRanking,
  calculateErrorBudget,
  getCalculationSteps,
  calculateReliability,
  MonteCarloResult,
  getBlastRadiusMap,
  calculateDRMetrics
} from '@/lib/sla-calculator';
import { ConfigError, clearFailures, decodeShareHash, encodeShareHash, parseConfig } from '@/lib/config';
import { generateId } from '@/lib/id';
import { createHistory, historyReducer } from '@/lib/history';
import { loadSavedModel, saveModel } from '@/lib/autosave';
import { normalizeItem } from '@/lib/normalize';
import { updateItemInTree, removeItemFromTree, addChildToGroup } from '@/lib/tree';
import { cn } from '@/lib/cn';
import { isDarkMode, setDarkMode, watchTheme } from '@/lib/theme';
import { TEMPLATES } from '@/app/templates';
import ItemNode from '@/app/components/ItemNode';
import HelpModal from '@/app/components/HelpModal';
import MonteCarloHistogram from '@/app/components/MonteCarloHistogram';
import CalculationBreakdown from '@/app/components/CalculationBreakdown';
import TopologyView from '@/app/components/TopologyView';
import SensitivityRanking from '@/app/components/SensitivityRanking';
import { useMonteCarloSimulation } from '@/app/useMonteCarloSimulation';

export default function ReliabilityModeling() {
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
        replicas: 1,
        rto: 5,
        rpo: 0
      },
      { 
        id: 'ingress', 
        name: 'Edge Ingress', 
        type: 'group', 
        config: 'parallel', 
        children: [
          { id: 'lb-1', name: 'Primary Load Balancer', type: 'component', sla: 99.99, replicas: 1, rto: 15, rpo: 0 },
          { id: 'lb-2', name: 'Secondary Load Balancer', type: 'component', sla: 99.99, replicas: 1, rto: 15, rpo: 0 },
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
            replicas: 3,
            rto: 10,
            rpo: 0
          },
          { 
            id: 'auth-service', 
            name: 'Auth Service', 
            type: 'component', 
            sla: 99.95, 
            replicas: 2,
            rto: 5,
            rpo: 0
          },
        ]
      },
      {
        id: 'data-layer',
        name: 'Data Tier',
        type: 'group',
        config: 'parallel',
        children: [
          { id: 'db-primary', name: 'Aurora Primary', type: 'component', sla: 99.95, replicas: 1, rto: 30, rpo: 1 },
          { id: 'db-replica', name: 'Aurora Replica', type: 'component', sla: 99.95, replicas: 1, rto: 5, rpo: 1 },
        ]
      }
    ]
  };

  const [modelHistory, dispatchHistory] = React.useReducer(historyReducer<SLAItem>, defaultSystem, createHistory);
  const root = modelHistory.present;
  // Every model change is an undo step; edits with the same coalesceKey in quick succession merge
  const setRoot = useCallback((value: SLAItem, coalesceKey?: string) => {
    dispatchHistory({ type: 'set', value, coalesceKey, now: Date.now() });
  }, []);
  const restoredRef = useRef(false);
  const [view, setView] = useState<'list' | 'topology'>('list');
  const [topologyLayout, setTopologyLayout] = useState<'horizontal' | 'vertical'>('vertical');
  useEffect(() => watchTheme(), []);
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
  const [autoSimulate, setAutoSimulate] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateRef = useRef<HTMLDivElement>(null);

  // Restore on mount: a shared link wins over the autosaved model
  useEffect(() => {
    let initial: SLAItem | null = null;
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      try {
        initial = decodeShareHash(hash);
        // Drop the hash so a reload keeps later (autosaved) edits instead of the shared version
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch (err) {
        console.error('Failed to decode configuration from URL', err);
      }
    }
    initial ??= loadSavedModel();
    setTimeout(() => {
      if (initial) dispatchHistory({ type: 'replace', value: initial });
      restoredRef.current = true;
    }, 0);
  }, []);

  // Autosave, but never before the saved model was restored (that would overwrite it with the default)
  useEffect(() => {
    if (!restoredRef.current) return;
    const timer = setTimeout(() => saveModel(root), 300);
    return () => clearTimeout(timer);
  }, [root]);

  const handleUndo = useCallback(() => {
    setSimulationResult(null);
    dispatchHistory({ type: 'undo' });
  }, []);

  const handleRedo = useCallback(() => {
    setSimulationResult(null);
    dispatchHistory({ type: 'redo' });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      // Leave text fields their native undo
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

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
      const encoded = encodeShareHash(root);
      const url = `${window.location.origin}${window.location.pathname}#${encoded}`;
      navigator.clipboard.writeText(url);
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
        setRoot(parseConfig(json));
        setSimulationResult(null);
      } catch (err) {
        if (err instanceof ConfigError) {
          alert(`Invalid SLAYER configuration file: ${err.message}`);
        } else {
          alert('Failed to parse JSON file.');
        }
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  const { 
    compositeSla, 
    downtime, 
    bottleneck, 
    sensitivityRanking,
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
      sensitivityRanking: getSensitivityRanking(root),
      reliability: calculateReliability(root),
      calculationSteps: getCalculationSteps(root),
      errorBudget: calculateErrorBudget(sla, consumedDowntime, budgetPeriod),
      blastRadiusMap: getBlastRadiusMap(root),
      drMetrics: calculateDRMetrics(root)
    };
  }, [root, consumedDowntime, budgetPeriod]);

  const runSimulation = useMonteCarloSimulation();
  // Lets a finished run detect that the model changed while it was running
  const reliabilityRef = useRef(reliability);
  useEffect(() => {
    reliabilityRef.current = reliability;
  }, [reliability]);

  const handleRunSimulation = useCallback(() => {
    setIsSimulating(true);
    const target = overrideTargetSla !== null ? overrideTargetSla : compositeSla;
    runSimulation(reliability, target, 10000).then(result => {
      // null: superseded by a newer run, which will update the state
      if (result === null) return;
      if (reliabilityRef.current === reliability) setSimulationResult(result);
      setIsSimulating(false);
    });
  }, [runSimulation, reliability, overrideTargetSla, compositeSla]);

  // Run simulation automatically when data changes (if auto-simulate is on)
  useEffect(() => {
    if (!autoSimulate) return;
    const timer = setTimeout(() => {
      handleRunSimulation();
    }, 500);
    return () => clearTimeout(timer);
  }, [handleRunSimulation, autoSimulate]);

  const onUpdate = (id: string, updates: Partial<SLAItem>) => {
    setSimulationResult(null); // Reset simulation when data changes
    const coalesceKey = `${id}:${Object.keys(updates).sort().join(',')}`;
    if (id === root.id) {
      setRoot(normalizeItem({ ...root, ...updates }), coalesceKey);
    } else {
      setRoot({ ...root, children: updateItemInTree(root.children || [], id, updates) }, coalesceKey);
    }
  };

  const onRemove = (id: string) => {
    setSimulationResult(null);
    if (id !== root.id) {
      setRoot({ ...root, children: removeItemFromTree(root.children || [], id) });
    }
  };

  const onAddChild = (groupId: string, type: 'component' | 'group') => {
    setSimulationResult(null);
    const newItem: SLAItem = type === 'component' 
      ? { id: generateId(), name: 'New Component', type: 'component', sla: 99.9 }
      : { id: generateId(), name: 'New Group', type: 'group', config: 'series', children: [] };
    
    if (groupId === root.id) {
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
            <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium text-xs tracking-tight">Reliability Modeling & Probabilistic Risk Analysis</p>
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
                onClick={() => {
                  if (chaosMode) {
                    // Leaving chaos mode restores every injected failure so it
                    // doesn't leak into normal mode, share links or exports.
                    // Also from history, so undo can't bring failures back outside chaos mode
                    dispatchHistory({ type: 'mapAll', fn: clearFailures });
                    setSimulationResult(null);
                  }
                  setChaosMode(!chaosMode);
                }}
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
              <button
                onClick={handleUndo}
                disabled={modelHistory.past.length === 0}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={handleRedo}
                disabled={modelHistory.future.length === 0}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                title="Redo (Ctrl+Shift+Z)"
                aria-label="Redo"
              >
                <Redo2 className="w-4 h-4" />
              </button>
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
              onClick={() => setDarkMode(!isDarkMode())}
              className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
              title="Toggle dark mode"
              aria-label="Toggle dark mode"
            >
              {/* Chosen by CSS so the pre-rendered HTML is right before hydration */}
              <Sun className="w-5 h-5 hidden dark:block" />
              <Moon className="w-5 h-5 dark:hidden" />
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

          <div className="w-full xl:w-96 space-y-6 shrink-0 xl:sticky xl:top-8">
            <section className="bg-slate-900 dark:bg-slate-900 border border-slate-800 text-white rounded-2xl shadow-xl overflow-hidden transition-colors">
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

            <SensitivityRanking ranking={sensitivityRanking} />

            <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm space-y-8">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-4">
                <Activity className="w-4 h-4 text-blue-500" />
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white italic">Reliability Analysis</h3>
              </div>

              {/* Monte Carlo Simulation (Promoted to Top) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Dices className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Monte Carlo Simulation</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-500 transition-colors">Auto-run</span>
                      <button 
                        onClick={() => setAutoSimulate(!autoSimulate)}
                        className={cn(
                          "w-6 h-3 rounded-full relative transition-colors duration-200 outline-none",
                          autoSimulate ? "bg-indigo-500" : "bg-slate-200 dark:bg-slate-700"
                        )}
                      >
                        <div className={cn(
                          "absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all duration-200 shadow-sm",
                          autoSimulate ? "left-3.5" : "left-0.5"
                        )} />
                      </button>
                    </label>
                    <div className={cn(
                      "flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-[8px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 transition-all",
                      isSimulating ? "animate-pulse opacity-100" : "opacity-50"
                    )}>
                      {isSimulating ? (
                        <>
                          <RotateCw className="w-2 h-2 animate-spin" />
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
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Target SLA for Simulation (%)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      max="100"
                      value={overrideTargetSla !== null ? overrideTargetSla : compositeSla}
                      onChange={(e) => setOverrideTargetSla(parseFloat(e.target.value))}
                      className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm dark:text-slate-200"
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
                </div>

                {!autoSimulate && (
                  <button
                    onClick={handleRunSimulation}
                    disabled={isSimulating}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md hover:shadow-lg disabled:opacity-50 active:scale-[0.98]"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Run Yearly Simulation
                  </button>
                )}

                {!simulationResult ? (
                  autoSimulate ? (
                    <div className="py-2 text-center">
                      <p className="text-[10px] text-slate-400 italic">
                        Waiting for data changes...
                      </p>
                    </div>
                  ) : null
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
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700/50">
                        <span className="block text-[8px] font-black text-slate-400 uppercase mb-1">Median Year</span>
                        <span className="text-[10px] font-mono font-bold dark:text-white">{formatDuration(simulationResult.medianDowntime)}</span>
                      </div>
                      <div className="p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700/50">
                        <span className="block text-[8px] font-black text-red-400 uppercase mb-1">P95 (Bad Year)</span>
                        <span className="text-[10px] font-mono font-bold text-red-500">{formatDuration(simulationResult.p95Downtime)}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => setShowHistogram(true)}
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
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">DR Goals (RTO/RPO)</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Target RTO</label>
                    <input
                      type="number"
                      min="0"
                      value={targetRto}
                      onChange={(e) => setTargetRto(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Target RPO</label>
                    <input
                      type="number"
                      min="0"
                      value={targetRpo}
                      onChange={(e) => setTargetRpo(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm dark:text-slate-200"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-slate-400 uppercase">System RTO:</span>
                    {drMetrics.rto === undefined ? (
                      <span className="font-mono font-black text-slate-400" title="No component defines an RTO">not set</span>
                    ) : (
                      <span className={cn("font-mono font-black", drMetrics.rto <= targetRto ? "text-emerald-600" : "text-red-600")}>
                        {formatDuration(drMetrics.rto)} {drMetrics.rto <= targetRto ? "✓" : "!!"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-slate-400 uppercase">System RPO:</span>
                    {drMetrics.rpo === undefined ? (
                      <span className="font-mono font-black text-slate-400" title="No component defines an RPO">not set</span>
                    ) : (
                      <span className={cn("font-mono font-black", drMetrics.rpo <= targetRpo ? "text-emerald-600" : "text-red-600")}>
                        {formatDuration(drMetrics.rpo)} {drMetrics.rpo <= targetRpo ? "✓" : "!!"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="h-[1px] bg-slate-100 dark:bg-slate-700" />

              {/* Error Budget Modeling */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-500" />
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Error Budget Modeling</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Downtime (s)</label>
                    <input
                      type="number"
                      min="0"
                      value={consumedDowntime}
                      onChange={(e) => setConsumedDowntime(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Period</label>
                    <select
                      value={budgetPeriod}
                      onChange={(e) => setBudgetPeriod(e.target.value as DowntimePeriod)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-[10px] h-[34px] dark:text-slate-200 font-bold uppercase"
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

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImport}
        className="hidden"
        accept=".json"
      />
    </div>
  );
}
