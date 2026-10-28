'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Calculator,
  Undo2,
  Redo2,
  Network,
  List,
  Moon,
  Sun,
  ChevronDown,
  Library,
  Share2,
  Skull,
  Flame,
  HelpCircle
} from 'lucide-react';
import {
  SLAItem,
  calculateSLA,
  getDowntime,
  formatDuration,
  formatSLAPercentage,
  DowntimePeriod,
  findBottleneck,
  getDomainImpact,
  FailureDomain,
  getSensitivityRanking,
  calculateErrorBudget,
  getCalculationSteps,
  calculateReliability,
  MonteCarloResult,
  getBlastRadiusMap,
  getItemSLAs,
  calculateDRMetrics
} from '@/lib/sla-calculator';
import { ConfigError, clearFailures, decodeShareHash, encodeShareHash, parseConfig } from '@/lib/config';
import { generateId } from '@/lib/id';
import { createHistory, historyReducer } from '@/lib/history';
import { loadSavedModel, saveModel } from '@/lib/autosave';
import { normalizeDomain, normalizeItem } from '@/lib/normalize';
import { updateItemInTree, removeItemFromTree, addChildToGroup, findAncestorIds, findNestedGroupIds } from '@/lib/tree';
import { MAX_FAILURE_DOMAINS, filterDomainTags, nextDomainName } from '@/lib/domains';
import { cn } from '@/lib/cn';
import { renderDiagramSvg } from '@/lib/diagram';
import { renderReportHtml, renderReportMarkdown } from '@/lib/report';
import { downloadBlob, exportFilename, printHtml, svgToPngBlob } from '@/app/download';
import { isDarkMode, setDarkMode, watchTheme } from '@/lib/theme';
import { useBooleanPreference } from '@/lib/preferences';
import { searchTree } from '@/lib/search';
import { EXAMPLES } from '@/app/examples';
import ItemNode from '@/app/components/ItemNode';
import HelpModal from '@/app/components/HelpModal';
import MonteCarloHistogram from '@/app/components/MonteCarloHistogram';
import CalculationBreakdown from '@/app/components/CalculationBreakdown';
import TopologyView from '@/app/components/TopologyView';
import SensitivityRanking from '@/app/components/SensitivityRanking';
import ModelChecks from '@/app/components/ModelChecks';
import IncidentFreeOdds from '@/app/components/IncidentFreeOdds';
import FailureDomainsPanel from '@/app/components/FailureDomainsPanel';
import FileMenu, { type ExportFormat } from '@/app/components/FileMenu';
import ReliabilityAnalysisPanel from '@/app/components/ReliabilityAnalysisPanel';
import ListToolbar from '@/app/components/ListToolbar';
import { getModelWarnings, type ModelWarning } from '@/lib/warnings';
import { useMonteCarloSimulation } from '@/app/useMonteCarloSimulation';
import { Abbr } from '@/app/components/Abbr';

const RECOVERY_FIELDS_KEY = 'slayer-show-recovery-fields';

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
  const [showExamples, setShowExamples] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showHistogram, setShowHistogram] = useState(false);
  const [showShareTooltip, setShowShareTooltip] = useState(false);
  const [consumedDowntime, setConsumedDowntime] = useState(0); // in seconds
  const [budgetPeriod, setBudgetPeriod] = useState<DowntimePeriod>('month');
  const [targetRto, setTargetRto] = useState(240); // 4 hours
  const [targetRpo, setTargetRpo] = useState(60); // 1 hour
  const [missionHours, setMissionHours] = useState(3);
  const [simulationResult, setSimulationResult] = useState<MonteCarloResult | null>(null);
  const [overrideTargetSla, setOverrideTargetSla] = useState<number | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [autoSimulate, setAutoSimulate] = useState(false);
  // View state only: kept out of the model so collapsing isn't an undo step or saved
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());
  const [showRecoveryFields, setShowRecoveryFields] = useBooleanPreference(RECOVERY_FIELDS_KEY, false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const examplesRef = useRef<HTMLDivElement>(null);

  // Restore on mount: a shared link wins over the autosaved model
  useEffect(() => {
    const restore = async () => {
      let initial: SLAItem | null = null;
      const hash = window.location.hash.replace('#', '');
      if (hash) {
        try {
          initial = await decodeShareHash(hash);
          // Drop the hash so a reload keeps later (autosaved) edits instead of the shared version
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        } catch (err) {
          console.error('Failed to decode configuration from URL', err);
        }
      }
      initial ??= loadSavedModel();
      if (initial) dispatchHistory({ type: 'replace', value: initial });
      restoredRef.current = true;
    };
    restore();
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
      if (examplesRef.current && !examplesRef.current.contains(event.target as Node)) {
        setShowExamples(false);
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

  const handleShare = async () => {
    try {
      const encoded = await encodeShareHash(root);
      const url = `${window.location.origin}${window.location.pathname}#${encoded}`;
      await navigator.clipboard.writeText(url);
      setShowShareTooltip(true);
      setTimeout(() => setShowShareTooltip(false), 2000);
    } catch {
      alert('Failed to generate share link');
    }
  };

  const handleLoadExample = (exampleId: string) => {
    if (confirm(`Load the "${EXAMPLES[exampleId].name}" example? This will replace your current work.`)) {
      setRoot(EXAMPLES[exampleId].data);
      setShowExamples(false);
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

  const handleExport = async (format: ExportFormat) => {
    const reportOptions = { generatedAt: new Date(), targetRto, targetRpo, simulation: simulationResult };
    try {
      switch (format) {
        case 'json':
          downloadBlob(new Blob([JSON.stringify(root, null, 2)], { type: 'application/json' }), exportFilename(root.name, 'json'));
          break;
        case 'markdown':
          downloadBlob(new Blob([renderReportMarkdown(root, reportOptions)], { type: 'text/markdown' }), exportFilename(root.name, 'md'));
          break;
        case 'pdf':
          printHtml(renderReportHtml(root, reportOptions));
          break;
        case 'svg':
          downloadBlob(new Blob([renderDiagramSvg(root)], { type: 'image/svg+xml' }), exportFilename(root.name, 'svg'));
          break;
        case 'png':
          downloadBlob(await svgToPngBlob(renderDiagramSvg(root)), exportFilename(root.name, 'png'));
          break;
      }
    } catch (err) {
      console.error('Export failed', err);
      alert('Export failed. See the browser console for details.');
    }
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
    modelWarnings,
    domainImpact,
    reliability, 
    calculationSteps, 
    errorBudget,
    blastRadiusMap,
    itemSlas,
    drMetrics
  } = useMemo(() => {
    const sla = calculateSLA(root);
    const sensitivityRanking = getSensitivityRanking(root);
    return {
      compositeSla: sla,
      downtime: getDowntime(sla),
      bottleneck: findBottleneck(root, sensitivityRanking),
      sensitivityRanking,
      modelWarnings: getModelWarnings(root),
      domainImpact: getDomainImpact(root),
      reliability: calculateReliability(root),
      calculationSteps: getCalculationSteps(root),
      errorBudget: calculateErrorBudget(sla, consumedDowntime, budgetPeriod),
      blastRadiusMap: getBlastRadiusMap(root),
      itemSlas: getItemSLAs(root),
      drMetrics: calculateDRMetrics(root)
    };
  }, [root, consumedDowntime, budgetPeriod]);

  const runSimulation = useMonteCarloSimulation();
  // Lets a finished run detect that the model changed while it was running
  const rootRef = useRef(root);
  useEffect(() => {
    rootRef.current = root;
  }, [root]);

  const warningsById = useMemo(() => {
    const map: Record<string, ModelWarning[]> = {};
    for (const warning of modelWarnings) (map[warning.itemId] ??= []).push(warning);
    return map;
  }, [modelWarnings]);

  const handleRunSimulation = useCallback(() => {
    setIsSimulating(true);
    const target = overrideTargetSla !== null ? overrideTargetSla : compositeSla;
    runSimulation(root, target, 10000).then(result => {
      // null: superseded by a newer run, which will update the state
      if (result === null) return;
      if (rootRef.current === root) setSimulationResult(result);
      setIsSimulating(false);
    });
  }, [runSimulation, root, overrideTargetSla, compositeSla]);

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

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const nestedGroupIds = useMemo(() => findNestedGroupIds(root), [root]);
  const allCollapsed = nestedGroupIds.length > 0 && nestedGroupIds.every(id => collapsedIds.has(id));

  const [searchQuery, setSearchQuery] = useState('');
  const search = useMemo(() => searchTree(root, searchQuery), [root, searchQuery]);

  const revealItem = useCallback((id: string) => {
    // A search hiding the item would make the jump go nowhere
    if (search && !search.visibleIds.has(id)) setSearchQuery('');
    const ancestors = findAncestorIds(root, id);
    if (!ancestors?.some(a => collapsedIds.has(a))) return;
    setCollapsedIds(prev => new Set([...prev].filter(c => !ancestors.includes(c))));
  }, [root, collapsedIds, search]);

  const failureDomains = root.failureDomains || [];

  const handleAddDomain = () => {
    if (failureDomains.length >= MAX_FAILURE_DOMAINS) return;
    setSimulationResult(null);
    const domain: FailureDomain = { id: generateId(), name: nextDomainName(failureDomains), sla: 99.99, mttr: 120 };
    setRoot({ ...root, failureDomains: [...failureDomains, domain] });
  };

  const handleUpdateDomain = (id: string, updates: Partial<FailureDomain>) => {
    setSimulationResult(null);
    setRoot({ ...root, failureDomains: failureDomains.map(d => (d.id === id ? normalizeDomain({ ...d, ...updates }) : d)) }, `domain:${id}:${Object.keys(updates).sort().join(',')}`);
  };

  const handleRemoveDomain = (id: string) => {
    setSimulationResult(null);
    const remaining = failureDomains.filter(d => d.id !== id);
    const untagged = filterDomainTags(root, domainId => domainId !== id);
    setRoot({ ...untagged, failureDomains: remaining.length > 0 ? remaining : undefined });
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
              <div className="relative" ref={examplesRef}>
                <button 
                  onClick={() => setShowExamples(!showExamples)}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
                  title="Load an example model"
                >
                  <Library className="w-4 h-4" />
                  <span className="hidden xl:inline">Examples</span>
                  <ChevronDown className={cn("w-3 h-3 transition-transform", showExamples && "rotate-180")} />
                </button>
                
                {showExamples && (
                  <div className="absolute top-full mt-2 left-0 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-3 py-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700 mb-1">
                      Architecture Patterns
                    </div>
                    {Object.entries(EXAMPLES).map(([id, example]) => (
                      <button
                        key={id}
                        onClick={() => handleLoadExample(id)}
                        className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex flex-col"
                      >
                        <span className="font-bold">{example.name}</span>
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

            <FileMenu
              onImport={() => fileInputRef.current?.click()}
              onExport={handleExport}
              onReset={handleReset}
              onClear={handleClear}
            />
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
          <div className="flex-1 min-w-0 w-full space-y-6">
            {view === 'list' ? (
              <>
                <ListToolbar
                  query={searchQuery}
                  onQueryChange={setSearchQuery}
                  matchCount={search ? search.matchIds.size : null}
                  showRecoveryFields={showRecoveryFields}
                  onShowRecoveryFieldsChange={setShowRecoveryFields}
                  canCollapse={nestedGroupIds.length > 0}
                  allCollapsed={allCollapsed}
                  onToggleCollapseAll={() => setCollapsedIds(allCollapsed ? new Set() : new Set(nestedGroupIds))}
                />
                <ItemNode 
                  item={root} 
                  onUpdate={onUpdate} 
                  onRemove={onRemove} 
                  onAddChild={onAddChild} 
                  depth={0} 
                  bottleneckIds={bottleneck.ids}
                  chaosMode={chaosMode}
                  warnings={warningsById}
                  failureDomains={failureDomains}
                  itemSlas={itemSlas}
                  collapsedIds={collapsedIds}
                  onToggleCollapsed={toggleCollapsed}
                  showRecoveryFields={showRecoveryFields}
                  search={search}
                />
              </>
            ) : (
              <TopologyView 
                root={root} 
                bottleneckIds={bottleneck.ids} 
                layout={topologyLayout}
                onLayoutChange={setTopologyLayout}
                chaosMode={chaosMode}
                onUpdate={onUpdate}
                blastRadiusMap={blastRadiusMap}
                itemSlas={itemSlas}
              />
            )}
          </div>

          <div className="w-full xl:w-96 space-y-6 shrink-0 xl:sticky xl:top-8">
            <section className="bg-slate-900 dark:bg-slate-900 border border-slate-800 text-white rounded-2xl shadow-xl overflow-hidden transition-colors">
              <div className="p-8 text-center bg-gradient-to-br from-blue-600 to-indigo-700 dark:from-blue-700 dark:to-indigo-900">
                <p className="text-blue-100 text-sm font-semibold uppercase tracking-widest mb-2">Total System <Abbr>SLA</Abbr></p>
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
                      <span className="text-slate-400 text-sm">System <Abbr>MTTR</Abbr></span>
                      <span className="font-mono font-medium">{formatDuration(reliability.mttr)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm">Expected Frequency</span>
                      <span className="font-mono font-medium">
                        {reliability.frequency <= 0
                          ? "0 incidents"
                          : reliability.frequency >= 1
                            ? `${reliability.frequency.toLocaleString('en-US', { maximumFractionDigits: reliability.frequency >= 10 ? 0 : 1 })} incidents/year`
                            : `1 incident every ${(1 / reliability.frequency).toFixed(1)} years`}
                      </span>
                    </div>
                  </div>
                  <IncidentFreeOdds reliability={reliability} missionHours={missionHours} onMissionHoursChange={setMissionHours} />
                </div>

              </div>
            </section>

            <ModelChecks warnings={modelWarnings} canNavigate={view === 'list'} onReveal={revealItem} />

            <SensitivityRanking ranking={sensitivityRanking} />

            <FailureDomainsPanel
              domains={failureDomains}
              impact={domainImpact}
              bottleneckIds={bottleneck.ids}
              onAdd={handleAddDomain}
              onUpdate={handleUpdateDomain}
              onRemove={handleRemoveDomain}
            />

            <ReliabilityAnalysisPanel
              compositeSla={compositeSla}
              simulation={{
                result: simulationResult,
                isRunning: isSimulating,
                autoRun: autoSimulate,
                onAutoRunChange: setAutoSimulate,
                targetSlaOverride: overrideTargetSla,
                onTargetSlaOverrideChange: setOverrideTargetSla,
                onRun: handleRunSimulation,
                onShowDistribution: () => setShowHistogram(true),
              }}
              dr={{
                rto: drMetrics.rto,
                rpo: drMetrics.rpo,
                targetRto,
                targetRpo,
                onTargetRtoChange: setTargetRto,
                onTargetRpoChange: setTargetRpo,
              }}
              errorBudget={{
                ...errorBudget,
                consumedSeconds: consumedDowntime,
                onConsumedSecondsChange: setConsumedDowntime,
                period: budgetPeriod,
                onPeriodChange: setBudgetPeriod,
              }}
            />
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
