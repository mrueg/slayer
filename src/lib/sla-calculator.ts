export type Configuration = 'series' | 'parallel';
export type InputMode = 'percentage' | 'downtime';
export type DowntimePeriod = 'day' | 'month' | 'year';

export interface SLAItem {
  id: string;
  name: string;
  type: 'component' | 'group';
  icon?: string; // Custom icon name
  notes?: string; // Descriptive annotations
  sla?: number; // Percentage, e.g., 99.9 (for components)
  replicas?: number; // Number of redundant instances (for components)
  config?: Configuration; // For groups
  failoverSla?: number; // Failover reliability for parallel groups
  isOptional?: boolean; // If true, this item doesn't count against the total SLA
  children?: SLAItem[]; // For groups
  inputMode?: InputMode;
  downtimeValue?: number; // in seconds
  downtimePeriod?: DowntimePeriod;
}

export interface CalculationResult {
  compositeSla: number;
  downtimePerYear: number;
  downtimePerMonth: number;
  downtimePerDay: number;
}

export const calculateSLA = (item: SLAItem): number => {
  if (item.isOptional) return 100;
  
  let baseSla = 100;

  if (item.type === 'component') {
    baseSla = item.sla ?? 100;
  } else {
    const children = item.children || [];
    if (children.length === 0) {
      baseSla = 100;
    } else {
      const childSlas = children.map(child => calculateSLA(child));

      if (item.config === 'series') {
        baseSla = childSlas.reduce((acc, sla) => acc * (sla / 100), 1) * 100;
      } else {
        const primarySla = childSlas[0] / 100;
        const othersFailureProbability = childSlas.slice(1).reduce(
          (acc, sla) => acc * (1 - sla / 100),
          1
        );
        const switchReliability = (item.failoverSla ?? 100) / 100;
        
        // P_fail = P_fail_primary * [ (1 - R_switch) + R_switch * P_fail_others ]
        const failureProbability = (1 - primarySla) * ((1 - switchReliability) + switchReliability * othersFailureProbability);
        baseSla = (1 - failureProbability) * 100;
      }
    }
  }

  // Apply redundancy (replicas) to both components and groups
  const replicas = item.replicas || 1;
  if (replicas <= 1) return baseSla;

  // SLA = 1 - (1 - SLA_base)^replicas
  const failureProbability = Math.pow(1 - baseSla / 100, replicas);
  return (1 - failureProbability) * 100;
};

export interface BottleneckResult {
  ids: string[];
  impact: number;
}

/**
 * Calculates the SLA of an item while treating a specific ID as 100% available.
 * Used for sensitivity analysis.
 */
const calculateSLAWithOverride = (item: SLAItem, overrideId: string): number => {
  if (item.id === overrideId) return 100;
  if (item.isOptional) return 100;
  
  let baseSla = 100;
  if (item.type === 'component') {
    baseSla = item.sla ?? 100;
  } else {
    const children = item.children || [];
    if (children.length === 0) {
      baseSla = 100;
    } else {
      const childSlas = children.map(child => calculateSLAWithOverride(child, overrideId));
      if (item.config === 'series') {
        baseSla = childSlas.reduce((acc, sla) => acc * (sla / 100), 1) * 100;
      } else {
        const primarySla = childSlas[0] / 100;
        const othersFailureProbability = childSlas.slice(1).reduce((acc, sla) => acc * (1 - sla / 100), 1);
        const switchReliability = (item.failoverSla ?? 100) / 100;
        const failureProbability = (1 - primarySla) * ((1 - switchReliability) + switchReliability * othersFailureProbability);
        baseSla = (1 - failureProbability) * 100;
      }
    }
  }

  const replicas = item.replicas || 1;
  if (replicas <= 1) return baseSla;
  const failureProbability = Math.pow(1 - baseSla / 100, replicas);
  return (1 - failureProbability) * 100;
};

const getAllItems = (item: SLAItem): SLAItem[] => {
  let items = [item];
  if (item.children) {
    item.children.forEach(child => {
      items = [...items, ...getAllItems(child)];
    });
  }
  return items;
};

export const findBottleneck = (root: SLAItem): BottleneckResult => {
  const currentRootSla = calculateSLA(root);
  const allItems = getAllItems(root);
  
  let maxImpact = -1;
  let results: { id: string, individualSla: number }[] = [];

  // Skip the root itself as the bottleneck candidate unless it's the only node
  const candidates = allItems.length > 1 
    ? allItems.filter(item => item.id !== root.id)
    : allItems;

  for (const item of candidates) {
    const slaWithImprovement = calculateSLAWithOverride(root, item.id);
    const impact = slaWithImprovement - currentRootSla;
    const individualSla = calculateSLA(item);
    
    const isSignificantImprovement = impact > maxImpact + 1e-12;
    const isEquivalentImpact = Math.abs(impact - maxImpact) < 1e-12;

    if (isSignificantImprovement) {
      maxImpact = impact;
      results = [{ id: item.id, individualSla }];
    } else if (isEquivalentImpact && impact > 0) {
      results.push({ id: item.id, individualSla });
    }
  }

  // If we have multiple candidates with equal impact, 
  // we still only want to highlight the ones with the lowest individual SLA 
  // (the truly weakest parts of that specific impact tier).
  if (results.length > 1) {
    const lowestSla = Math.min(...results.map(r => r.individualSla));
    return {
      ids: results.filter(r => r.individualSla <= lowestSla + 1e-12).map(r => r.id),
      impact: maxImpact
    };
  }

  return { ids: results.map(r => r.id), impact: maxImpact };
};

export interface CalculationStep {
  id: string;
  name: string;
  type: 'component' | 'group';
  formula: string;
  explanation: string;
  inputValues: string[];
  result: number;
}

export const getCalculationSteps = (item: SLAItem): CalculationStep[] => {
  if (item.isOptional) {
    return [{
      id: item.id,
      name: item.name,
      type: item.type,
      formula: "100%",
      explanation: "Optional component excluded from calculation",
      inputValues: [],
      result: 100
    }];
  }

  const steps: CalculationStep[] = [];
  let baseSla = 100;
  let formula = "";
  let explanation = "";
  let inputs: string[] = [];

  if (item.type === 'component') {
    baseSla = item.sla ?? 100;
    formula = `${baseSla}%`;
    explanation = "Base component SLA";
  } else {
    const children = item.children || [];
    if (children.length === 0) {
      baseSla = 100;
      formula = "100%";
      explanation = "Empty group";
    } else {
      // Get steps for all children first
      const childStepGroups = children.map(child => getCalculationSteps(child));
      childStepGroups.forEach(childSteps => steps.push(...childSteps));
      
      const childResults = children.map(child => calculateSLA(child));
      inputs = childResults.map(r => `${formatSLAPercentage(r)}%`);

      if (item.config === 'series') {
        baseSla = childResults.reduce((acc, sla) => acc * (sla / 100), 1) * 100;
        formula = childResults.map(r => `(${formatSLAPercentage(r)}%)`).join(' * ');
        explanation = `Series group: Product of all children`;
      } else {
        const primarySla = childResults[0] / 100;
        const othersFailureProbability = childResults.slice(1).reduce((acc, sla) => acc * (1 - sla / 100), 1);
        const switchReliability = (item.failoverSla ?? 100) / 100;
        
        const failureProbability = (1 - primarySla) * ((1 - switchReliability) + switchReliability * othersFailureProbability);
        baseSla = (1 - failureProbability) * 100;
        
        formula = `1 - ( (1 - ${formatSLAPercentage(childResults[0])}%) * ( (1 - ${item.failoverSla ?? 100}%) + ${item.failoverSla ?? 100}% * (1 - S_SLA) ) )`;
        explanation = `Parallel group with ${item.failoverSla ?? 100}% failover reliability`;
      }
    }
  }

  // Apply redundancy (replicas)
  const replicas = item.replicas || 1;
  if (replicas > 1) {
    const finalSla = (1 - Math.pow(1 - baseSla / 100, replicas)) * 100;
    steps.push({
      id: item.id,
      name: item.name,
      type: item.type,
      formula: `1 - (1 - ${formatSLAPercentage(baseSla)}%)^${replicas}`,
      explanation: `${replicas}x Parallel Redundancy for ${item.name}`,
      inputValues: inputs,
      result: finalSla
    });
  } else {
    steps.push({
      id: item.id,
      name: item.name,
      type: item.type,
      formula,
      explanation,
      inputValues: inputs,
      result: baseSla
    });
  }

  return steps;
};

export interface ErrorBudget {
  totalBudgetSeconds: number;
  consumedSeconds: number;
  remainingSeconds: number;
  isBreached: boolean;
}

export const calculateErrorBudget = (targetSla: number, consumedSeconds: number, period: DowntimePeriod = 'month'): ErrorBudget => {
  const totalSeconds = {
    year: 365.25 * 24 * 60 * 60,
    month: (365.25 * 24 * 60 * 60) / 12,
    day: 24 * 60 * 60,
  }[period];

  const totalBudgetSeconds = totalSeconds * (1 - targetSla / 100);
  const remainingSeconds = totalBudgetSeconds - consumedSeconds;
  
  return {
    totalBudgetSeconds,
    consumedSeconds,
    remainingSeconds: Math.max(0, remainingSeconds),
    isBreached: remainingSeconds < 0
  };
};

export const formatSLAPercentage = (value: number): string => {
  if (value >= 100) return '100';
  if (value <= 0) return '0';

  // Use a high fixed precision to ensure we have enough digits
  const str = value.toFixed(12);
  const [intPart, fracPart] = str.split('.');
  
  let resultFrac = '';
  for (let i = 0; i < fracPart.length; i++) {
    const digit = fracPart[i];
    resultFrac += digit;
    if (digit !== '9') break;
  }
  
  return `${intPart}.${resultFrac}`;
};

export const getDowntime = (sla: number): Omit<CalculationResult, 'compositeSla'> => {
  const totalMinutesYear = 365.25 * 24 * 60;
  const year = totalMinutesYear * (1 - sla / 100);
  return {
    downtimePerYear: year,
    downtimePerMonth: year / 12,
    downtimePerDay: year / 365.25,
  };
};

export const slaFromDowntime = (seconds: number, period: DowntimePeriod): number => {
  const totalSeconds = {
    year: 365.25 * 24 * 60 * 60,
    month: (365.25 * 24 * 60 * 60) / 12,
    day: 24 * 60 * 60,
  }[period];
  
  if (seconds >= totalSeconds) return 0;
  if (seconds <= 0) return 100;
  
  return (1 - seconds / totalSeconds) * 100;
};

export const formatDuration = (minutes: number): string => {
  if (minutes <= 0) return '0s';
  if (minutes < 0.017) return '< 1s';
  
  const d = Math.floor(minutes / (24 * 60));
  const h = Math.floor((minutes % (24 * 60)) / 60);
  const m = Math.floor(minutes % 60);
  const s = Math.round((minutes % 1) * 60);

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);

  return parts.join(' ');
};
