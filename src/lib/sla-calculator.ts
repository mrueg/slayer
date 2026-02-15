export type Configuration = 'series' | 'parallel';
export type InputMode = 'percentage' | 'downtime';
export type DowntimePeriod = 'day' | 'month' | 'year';

export interface SLAItem {
  id: string;
  name: string;
  type: 'component' | 'group';
  icon?: string; // Custom icon name
  notes?: string; // Descriptive annotations
  mttr?: number; // Mean Time To Recovery in minutes
  sla?: number; // Percentage, e.g., 99.9 (for components)
  replicas?: number; // Number of redundant instances (for components)
  config?: Configuration; // For groups
  failoverSla?: number; // Failover reliability for parallel groups
  isOptional?: boolean; // If true, this item doesn't count against the total SLA
  isFailed?: boolean; // Chaos mode failure state
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
  if (item.isFailed) return 0;
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

export interface ReliabilityResult {
  sla: number;
  frequency: number; // incidents per year
  mttr: number; // minutes
}

const YEAR_MINUTES = 365.25 * 24 * 60;

export const calculateReliability = (item: SLAItem): ReliabilityResult => {
  if (item.isFailed) return { sla: 0, frequency: 999999, mttr: item.mttr || 60 };
  if (item.isOptional) return { sla: 100, frequency: 0, mttr: 0 };

  if (item.type === 'component') {
    const baseSla = item.sla ?? 100;
    const baseMttr = item.mttr || 60; // Default 1h MTTR
    const replicas = item.replicas || 1;

    // Single instance metrics
    const baseFrequency = ((1 - baseSla / 100) * YEAR_MINUTES) / baseMttr;

    if (replicas <= 1) {
      return { sla: baseSla, frequency: baseFrequency, mttr: baseMttr };
    }

    // Parallel redundancy for replicas
    const sla = (1 - Math.pow(1 - baseSla / 100, replicas)) * 100;
    const frequency = baseFrequency * Math.pow((baseFrequency * baseMttr) / YEAR_MINUTES, replicas - 1) * replicas;
    const mttr = baseMttr / replicas;

    return { sla, frequency, mttr };
  }

  const children = item.children || [];
  if (children.length === 0) return { sla: 100, frequency: 0, mttr: 0 };

  const childResults = children.map(child => calculateReliability(child));

  let sla = 100;
  let frequency = 0;
  let mttr = 0;

  if (item.config === 'series') {
    sla = childResults.reduce((acc, r) => acc * (r.sla / 100), 1) * 100;
    frequency = childResults.reduce((acc, r) => acc + r.frequency, 0);
    mttr = frequency > 0 ? childResults.reduce((acc, r) => acc + (r.frequency * r.mttr), 0) / frequency : 0;
  } else {
    // Parallel
    const primary = childResults[0];
    const others = childResults.slice(1);
    const switchReliability = (item.failoverSla ?? 100) / 100;

    const othersSla = others.reduce((acc, r) => acc * (1 - r.sla / 100), 1);
    const pFail = (1 - primary.sla / 100) * ((1 - switchReliability) + switchReliability * othersSla);
    sla = (1 - pFail) * 100;

    // Parallel frequency approx
    frequency = childResults.length > 1 
      ? childResults.reduce((acc, r, idx) => {
          if (idx === 0) return r.frequency;
          return (acc * r.frequency * (mttr + r.mttr)) / YEAR_MINUTES;
        }, childResults[0].frequency)
      : childResults[0].frequency;
    
    if (switchReliability < 1) {
      frequency += primary.frequency * (1 - switchReliability);
    }

    mttr = frequency > 0 ? ((1 - sla / 100) * YEAR_MINUTES) / frequency : 0;
  }

  const groupReplicas = item.replicas || 1;
  if (groupReplicas > 1) {
    const bSla = sla;
    const bMttr = mttr || 60;
    const bFreq = frequency || ((1 - bSla / 100) * YEAR_MINUTES) / bMttr;

    sla = (1 - Math.pow(1 - baseSla / 100, groupReplicas)) * 100;
    frequency = bFreq * Math.pow((bFreq * bMttr) / YEAR_MINUTES, groupReplicas - 1) * groupReplicas;
    mttr = bMttr / groupReplicas;
  }

  return { sla, frequency, mttr };
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
  if (item.isFailed) return 0;
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

/**
 * Calculates the SLA of an item while treating a specific ID as 0% available.
 */
const calculateSLAWithForcedFailure = (item: SLAItem, forcedFailedId: string): number => {
  if (item.id === forcedFailedId) return 0;
  if (item.isFailed) return 0;
  if (item.isOptional) return 100;
  
  let baseSla = 100;
  if (item.type === 'component') {
    baseSla = item.sla ?? 100;
  } else {
    const children = item.children || [];
    if (children.length === 0) {
      baseSla = 100;
    } else {
      const childSlas = children.map(child => calculateSLAWithForcedFailure(child, forcedFailedId));
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

const getSerialMap = (item: SLAItem, parent?: SLAItem, map: Record<string, boolean> = {}): Record<string, boolean> => {
  if (!parent || parent.config === 'series' || (parent.config === 'parallel' && (parent.children?.length || 0) <= 1)) {
    map[item.id] = true;
  } else {
    map[item.id] = false;
  }
  
  if (item.children) {
    item.children.forEach(child => getSerialMap(child, item, map));
  }
  return map;
};

export const findBottleneck = (root: SLAItem): BottleneckResult => {
  const currentRootSla = calculateSLA(root);
  const allItems = getAllItems(root);
  const serialMap = getSerialMap(root);
  
  let maxImpact = -1;
  let results: { id: string, individualSla: number }[] = [];

  const candidates = allItems.length > 1 
    ? allItems.filter(item => item.id !== root.id)
    : allItems;

  for (const item of candidates) {
    if (item.isFailed && !serialMap[item.id]) continue;

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

  if (results.length > 1) {
    const lowestSla = Math.min(...results.map(r => r.individualSla));
    return {
      ids: results.filter(r => r.individualSla <= lowestSla + 1e-12).map(r => r.id),
      impact: maxImpact
    };
  }

  return { ids: results.map(r => r.id), impact: maxImpact };
};

export const getBlastRadiusMap = (root: SLAItem): Record<string, number> => {
  const currentRootSla = calculateSLA(root);
  const allItems = getAllItems(root);
  const map: Record<string, number> = {};

  allItems.forEach(item => {
    if (currentRootSla <= 0) {
      map[item.id] = item.isFailed ? 1 : 0;
      return;
    }

    const slaWithFailure = calculateSLAWithForcedFailure(root, item.id);
    const impact = (currentRootSla - slaWithFailure) / currentRootSla;
    map[item.id] = Math.max(0, Math.min(1, impact));
  });

  return map;
};

export interface CalculationStep {
  id: string;
  name: string;
  type: 'component' | 'group';
  formula: string;
  explanation: string;
  inputValues: string[];
  result: number;
  mttrResult?: number;
  frequencyResult?: number;
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
      result: 100,
      mttrResult: 0,
      frequencyResult: 0
    }];
  }

  const steps: CalculationStep[] = [];
  const rel = calculateReliability(item);

  if (item.type === 'component') {
    const baseSla = item.sla ?? 100;
    const baseMttr = item.mttr || 60;
    const replicas = item.replicas || 1;

    if (replicas > 1) {
      steps.push({
        id: item.id,
        name: item.name,
        type: item.type,
        formula: `1 - (1 - ${baseSla}%)^${replicas}`,
        explanation: `${replicas}x Redundancy: SLA improved by parallel replicas, MTTR reduced.`,
        inputValues: [`Base MTTR: ${baseMttr}m`],
        result: rel.sla,
        mttrResult: rel.mttr,
        frequencyResult: rel.frequency
      });
    } else {
      steps.push({
        id: item.id,
        name: item.name,
        type: item.type,
        formula: `${baseSla}%`,
        explanation: `Base component metrics.`,
        inputValues: [`MTTR: ${baseMttr}m`],
        result: baseSla,
        mttrResult: baseMttr,
        frequencyResult: rel.frequency
      });
    }
  } else {
    const children = item.children || [];
    if (children.length === 0) {
      steps.push({
        id: item.id,
        name: item.name,
        type: item.type,
        formula: "100%",
        explanation: "Empty group defaults to 100%",
        inputValues: [],
        result: 100,
        mttrResult: 0,
        frequencyResult: 0
      });
    } else {
      children.forEach(child => steps.push(...getCalculationSteps(child)));
      
      const childRels = children.map(child => calculateReliability(child));
      
      if (item.config === 'series') {
        steps.push({
          id: item.id,
          name: item.name,
          type: item.type,
          formula: `Product of child SLAs | Sum of child frequencies`,
          explanation: `Series: The system fails if ANY component fails. Total frequency is additive.`,
          inputValues: childRels.map(r => `${formatSLAPercentage(r.sla)}% (${r.frequency.toFixed(2)} freq)`),
          result: rel.sla,
          mttrResult: rel.mttr,
          frequencyResult: rel.frequency
        });
      } else {
        steps.push({
          id: item.id,
          name: item.name,
          type: item.type,
          formula: `1 - (P_fail * Switch_fail_adj)`,
          explanation: `Parallel: The system only fails if all components fail (adjusted by switch reliability).`,
          inputValues: childRels.map(r => `${formatSLAPercentage(r.sla)}%`),
          result: rel.sla,
          mttrResult: rel.mttr,
          frequencyResult: rel.frequency
        });
      }
    }
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

export const runMonteCarlo = (reliability: ReliabilityResult, targetSla: number, iterations: number = 10000): MonteCarloResult => {
  const allowedDowntimeMinutes = YEAR_MINUTES * (1 - targetSla / 100);
  const downtimes: number[] = [];
  let breaches = 0;

  const lambda = reliability.frequency;
  const mttr = reliability.mttr;

  for (let i = 0; i < iterations; i++) {
    let numIncidents = 0;
    if (lambda > 100) {
      const standardNormal = Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random());
      numIncidents = Math.max(0, Math.round(lambda + standardNormal * Math.sqrt(lambda)));
    } else {
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= Math.random();
      } while (p > L);
      numIncidents = k - 1;
    }

    let yearlyDowntime = 0;
    for (let j = 0; j < numIncidents; j++) {
      yearlyDowntime += -Math.log(1 - Math.random()) * mttr;
    }

    downtimes.push(yearlyDowntime);
    if (yearlyDowntime > allowedDowntimeMinutes) {
      breaches++;
    }
  }

  downtimes.sort((a, b) => a - b);
  
  const sum = downtimes.reduce((a, b) => a + b, 0);
  const mean = sum / iterations;
  const median = downtimes[Math.floor(iterations * 0.5)];
  const p95 = downtimes[Math.floor(iterations * 0.95)];
  const p99 = downtimes[Math.floor(iterations * 0.99)];

  return {
    iterations,
    meanDowntime: mean,
    medianDowntime: median,
    p95Downtime: p95,
    p99Downtime: p99,
    breachProbability: (breaches / iterations) * 100,
    distribution: downtimes
  };
};

export interface MonteCarloResult {
  iterations: number;
  meanDowntime: number;
  medianDowntime: number;
  p95Downtime: number;
  p99Downtime: number;
  breachProbability: number;
  distribution: number[];
}

export const getHistogramData = (distribution: number[], bins: number = 40): { bin: string, count: number, label: string }[] => {
  if (distribution.length === 0) return [];
  
  const min = distribution[0];
  const max = distribution[distribution.length - 1];
  const range = max - min;
  const binSize = range / bins;
  
  const histogram: { count: number, start: number, end: number }[] = [];
  for (let i = 0; i < bins; i++) {
    histogram.push({
      count: 0,
      start: min + i * binSize,
      end: min + (i + 1) * binSize
    });
  }
  
  distribution.forEach(val => {
    let binIdx = Math.floor((val - min) / binSize);
    if (binIdx >= bins) binIdx = bins - 1;
    histogram[binIdx].count++;
  });
  
  return histogram.map(h => ({
    bin: h.start.toFixed(2),
    count: h.count,
    label: `${formatDuration(h.start)} - ${formatDuration(h.end)}`
  }));
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
