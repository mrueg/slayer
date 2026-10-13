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
  minReplicasRequired?: number; // For components: min up replicas
  config?: Configuration; // For groups
  minChildrenRequired?: number; // For groups: min up children
  failoverSla?: number; // Failover reliability for parallel groups
  isOptional?: boolean; // If true, this item doesn't count against the total SLA
  failedReplicas?: number; // Number of replicas that are currently DOWN (Chaos Mode)
  children?: SLAItem[]; // For groups
  inputMode?: InputMode;
  downtimeValue?: number; // in seconds
  downtimePeriod?: DowntimePeriod;
  rto?: number; // Recovery Time Objective in minutes
  rpo?: number; // Recovery Point Objective in minutes
}

export interface CalculationResult {
  compositeSla: number;
  downtimePerYear: number;
  downtimePerMonth: number;
  downtimePerDay: number;
}

const YEAR_MINUTES = 365.25 * 24 * 60;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Calculates the probability that at least k items out of n are UP.
 * Uses dynamic programming to handle non-identical probabilities.
 */
const calculateKofN = (probabilities: number[], k: number): number => {
  const n = probabilities.length;
  if (k <= 0) return 1;
  if (k > n) return 0;

  // dp[j] = probability that exactly j of the items processed so far are UP
  const dp: number[] = Array(n + 1).fill(0);
  dp[0] = 1;

  for (let i = 0; i < n; i++) {
    const p = probabilities[i];
    for (let j = i + 1; j >= 0; j--) {
      // UP if this item is UP and j-1 prev were UP, or if this item is DOWN and j prev were UP
      dp[j] = (j > 0 ? dp[j - 1] * p : 0) + dp[j] * (1 - p);
    }
  }

  // Sum probabilities for all counts >= k
  let totalProbability = 0;
  for (let j = k; j <= n; j++) {
    totalProbability += dp[j];
  }

  return Math.min(1, totalProbability);
};

/**
 * Children that participate in the calculation. Optional children are
 * excluded entirely: treating them as 100% available would make any
 * parallel group containing one look perfect.
 */
const getActiveChildren = (item: SLAItem): SLAItem[] =>
  (item.children || []).filter(child => !child.isOptional);

interface ReplicaParams {
  replicas: number;
  required: number;
  working: number;
}

const getReplicaParams = (item: SLAItem): ReplicaParams => {
  const replicas = Math.max(1, Math.floor(item.replicas || 1));
  const required = clamp(Math.floor(item.minReplicasRequired || 1), 1, replicas);
  const failed = clamp(Math.floor(item.failedReplicas || 0), 0, replicas);
  return { replicas, required, working: replicas - failed };
};

const getMinChildrenRequired = (item: SLAItem, childCount: number): number =>
  clamp(Math.floor(item.minChildrenRequired || 1), 1, Math.max(1, childCount));

/**
 * Combines child availabilities (0-1) into the availability of a group.
 *
 * Parallel 1-out-of-N uses an active/standby failover model: the first child
 * is primary and the failover mechanism only has to work when the primary
 * fails. Parallel K-out-of-N (K > 1) treats the switch/load balancer as a
 * series element in front of the pool.
 */
const combineGroup = (item: SLAItem, probabilities: number[]): number => {
  if (probabilities.length === 0) return 1;

  if (item.config === 'series') {
    return probabilities.reduce((acc, p) => acc * p, 1);
  }

  const k = getMinChildrenRequired(item, probabilities.length);
  const switchReliability = clamp((item.failoverSla ?? 100) / 100, 0, 1);

  if (k === 1) {
    const primary = probabilities[0];
    const othersFailureProb = probabilities.slice(1).reduce((acc, p) => acc * (1 - p), 1);
    const failureProbability = probabilities.length === 1
      ? 1 - primary
      : (1 - primary) * ((1 - switchReliability) + switchReliability * othersFailureProb);
    return 1 - failureProbability;
  }

  return calculateKofN(probabilities, k) * switchReliability;
};

interface Overrides {
  forceUpId?: string;
  forceDownId?: string;
}

interface NodeMetrics {
  availability: number; // 0-1
  frequency: number; // failures per year
}

/**
 * Evaluates availability and failure frequency of an item.
 *
 * Frequencies are combined with the Birnbaum importance formula for systems of
 * independent repairable components:
 *   f_sys = Σ f_i · (A_sys | i up − A_sys | i down)
 * This keeps frequency × MTTR consistent with unavailability, so the
 * Monte Carlo simulation agrees with the headline SLA.
 */
const evaluate = (item: SLAItem, overrides: Overrides = {}): NodeMetrics => {
  if (item.id === overrides.forceUpId) return { availability: 1, frequency: 0 };
  if (item.id === overrides.forceDownId) return { availability: 0, frequency: 0 };
  if (item.isOptional) return { availability: 1, frequency: 0 };

  let base: NodeMetrics;

  if (item.type === 'component') {
    const availability = clamp((item.sla ?? 100) / 100, 0, 1);
    const mttr = item.mttr && item.mttr > 0 ? item.mttr : 60;
    const frequency = availability > 0 && availability < 1
      ? ((1 - availability) * YEAR_MINUTES) / mttr
      : 0;
    base = { availability, frequency };
  } else {
    const childMetrics = getActiveChildren(item).map(child => evaluate(child, overrides));
    const probabilities = childMetrics.map(m => m.availability);
    const availability = combineGroup(item, probabilities);

    let frequency = 0;
    childMetrics.forEach((child, i) => {
      if (child.frequency === 0) return;
      const up = [...probabilities];
      const down = [...probabilities];
      up[i] = 1;
      down[i] = 0;
      frequency += child.frequency * Math.max(0, combineGroup(item, up) - combineGroup(item, down));
    });

    base = { availability, frequency };
  }

  // Apply redundancy (replicas) to both components and groups
  const { replicas, required, working } = getReplicaParams(item);
  if (working < required) return { availability: 0, frequency: 0 };
  if (replicas <= 1) return base;

  const availability = calculateKofN(Array(working).fill(base.availability), required);
  const others = Array(working - 1).fill(base.availability);
  const importance = calculateKofN(others, required - 1) - calculateKofN(others, required);
  const frequency = working * base.frequency * Math.max(0, importance);

  return { availability, frequency };
};

export const calculateSLA = (item: SLAItem): number => evaluate(item).availability * 100;

export interface ReliabilityResult {
  sla: number;
  frequency: number; // incidents per year
  mttr: number; // minutes
}

export interface DRResult {
  rto?: number; // undefined when no contributing component defines it
  rpo?: number;
}

const definedValues = (values: (number | undefined)[]): number[] =>
  values.filter((v): v is number => v !== undefined && Number.isFinite(v));

export const calculateDRMetrics = (item: SLAItem): DRResult => {
  if (item.isOptional) return {};

  if (item.type === 'component') {
    return { rto: item.rto, rpo: item.rpo };
  }

  const children = getActiveChildren(item);
  if (children.length === 0) return {};

  const childMetrics = children.map(child => calculateDRMetrics(child));
  const rtos = definedValues(childMetrics.map(m => m.rto));
  const rpos = definedValues(childMetrics.map(m => m.rpo));

  if (item.config === 'series') {
    return {
      // Series: RTO is the sum (sequential recovery)
      rto: rtos.length > 0 ? rtos.reduce((acc, v) => acc + v, 0) : undefined,
      // Series: RPO is the max (data is as old as the weakest backup link)
      rpo: rpos.length > 0 ? Math.max(...rpos) : undefined
    };
  }

  // Parallel: You only need ONE to recover
  return {
    rto: rtos.length > 0 ? Math.min(...rtos) : undefined,
    rpo: rpos.length > 0 ? Math.min(...rpos) : undefined
  };
};

export const calculateReliability = (item: SLAItem): ReliabilityResult => {
  const { availability, frequency } = evaluate(item);
  const mttr = frequency > 0 ? ((1 - availability) * YEAR_MINUTES) / frequency : 0;
  return { sla: availability * 100, frequency, mttr };
};

export interface BottleneckResult {
  ids: string[];
  impact: number;
}

/**
 * Calculates the SLA of an item while treating a specific ID as 100% available.
 * Used for sensitivity analysis.
 */
const calculateSLAWithOverride = (item: SLAItem, overrideId: string): number =>
  evaluate(item, { forceUpId: overrideId }).availability * 100;

/**
 * Calculates the SLA of an item while treating a specific ID as 0% available.
 */
const calculateSLAWithForcedFailure = (item: SLAItem, forcedFailedId: string): number =>
  evaluate(item, { forceDownId: forcedFailedId }).availability * 100;

const getAllItems = (item: SLAItem): SLAItem[] =>
  [item, ...(item.children || []).flatMap(getAllItems)];

const getSerialMap = (item: SLAItem, parent?: SLAItem, map: Record<string, boolean> = {}): Record<string, boolean> => {
  if (!parent || parent.config === 'series' || (parent.config === 'parallel' && getActiveChildren(parent).length <= 1)) {
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
    const isTotalFailure = (item.failedReplicas || 0) >= (item.replicas || 1);
    if (isTotalFailure && !serialMap[item.id]) continue;

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
      const isTotalFailure = (item.failedReplicas || 0) >= (item.replicas || 1);
      map[item.id] = isTotalFailure ? 1 : 0;
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
  rtoResult?: number;
  rpoResult?: number;
}

export const getCalculationSteps = (item: SLAItem): CalculationStep[] => {
  if (item.isOptional) {
    return [{
      id: item.id,
      name: item.name,
      type: item.type,
      formula: "Excluded",
      explanation: "Optional item excluded from calculation",
      inputValues: [],
      result: 100,
      mttrResult: 0,
      frequencyResult: 0
    }];
  }

  const steps: CalculationStep[] = [];
  const rel = calculateReliability(item);
  const dr = calculateDRMetrics(item);

  if (item.type === 'component') {
    const baseSla = item.sla ?? 100;
    const baseMttr = item.mttr || 60;
    const { replicas, required: k } = getReplicaParams(item);

    if (replicas > 1) {
      steps.push({
        id: item.id,
        name: item.name,
        type: item.type,
        formula: `${k}-out-of-${replicas} Redundancy`,
        explanation: `${replicas}x Redundancy: SLA improved by parallel replicas, MTTR reduced.`,
        inputValues: [`Base MTTR: ${baseMttr}m`, `Min Required: ${k}`],
        result: rel.sla,
        mttrResult: rel.mttr,
        frequencyResult: rel.frequency,
        rtoResult: dr.rto,
        rpoResult: dr.rpo
      });
    } else {
      steps.push({
        id: item.id,
        name: item.name,
        type: item.type,
        formula: `${baseSla}%`,
        explanation: `Base component metrics.`,
        inputValues: [`MTTR: ${baseMttr}m`],
        result: rel.sla,
        mttrResult: rel.mttr,
        frequencyResult: rel.frequency,
        rtoResult: dr.rto,
        rpoResult: dr.rpo
      });
    }
  } else {
    const children = item.children || [];
    const activeChildren = getActiveChildren(item);
    if (activeChildren.length === 0) {
      children.forEach(child => steps.push(...getCalculationSteps(child)));
      steps.push({
        id: item.id,
        name: item.name,
        type: item.type,
        formula: "100%",
        explanation: "Group without critical children defaults to 100%",
        inputValues: [],
        result: rel.sla,
        mttrResult: rel.mttr,
        frequencyResult: rel.frequency
      });
    } else {
      children.forEach(child => steps.push(...getCalculationSteps(child)));
      
      const childRels = activeChildren.map(child => calculateReliability(child));
      const k = getMinChildrenRequired(item, activeChildren.length);
      
      if (item.config === 'series') {
        steps.push({
          id: item.id,
          name: item.name,
          type: item.type,
          formula: `Product of child SLAs | Sum of child frequencies`,
          explanation: `Series: Sequential recovery (Sum of RTO) and weakest link data loss (Max RPO).`,
          inputValues: childRels.map(r => `${formatSLAPercentage(r.sla)}% (${r.frequency.toFixed(2)} freq)`),
          result: rel.sla,
          mttrResult: rel.mttr,
          frequencyResult: rel.frequency,
          rtoResult: dr.rto,
          rpoResult: dr.rpo
        });
      } else {
        steps.push({
          id: item.id,
          name: item.name,
          type: item.type,
          formula: `${k}-out-of-${activeChildren.length} Redundancy`,
          explanation: `Parallel: Minimum time to recover any path (Min RTO) and freshest data path (Min RPO).`,
          inputValues: childRels.map(r => `${formatSLAPercentage(r.sla)}%`),
          result: rel.sla,
          mttrResult: rel.mttr,
          frequencyResult: rel.frequency,
          rtoResult: dr.rto,
          rpoResult: dr.rpo
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
  // A system that is hard down (e.g. chaos-injected failure) has no failure
  // events to sample; it is simply down for the whole year.
  const isHardDown = reliability.sla <= 0;

  for (let i = 0; i < iterations; i++) {
    if (isHardDown) {
      downtimes.push(YEAR_MINUTES);
      if (YEAR_MINUTES > allowedDowntimeMinutes) breaches++;
      continue;
    }

    let numIncidents = 0;
    if (lambda > 100) {
      const standardNormal = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
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
    if (numIncidents > 100) {
      // Normal approximation of Gamma distribution for large n
      const mean = numIncidents * mttr;
      const stdDev = Math.sqrt(numIncidents) * mttr;
      const standardNormal = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
      yearlyDowntime = Math.max(0, mean + standardNormal * stdDev);
    } else {
      for (let j = 0; j < numIncidents; j++) {
        yearlyDowntime += -Math.log(1 - Math.random()) * mttr;
      }
    }

    yearlyDowntime = Math.min(YEAR_MINUTES, yearlyDowntime);
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

  // Calculate Confidence Intervals (95%)
  // For Breach Probability (Binomial Distribution)
  const p = breaches / iterations;
  const z = 1.96; // 95% confidence
  const breachError = z * Math.sqrt((p * (1 - p)) / iterations);
  const breachProbabilityCI: [number, number] = [
    Math.max(0, (p - breachError) * 100),
    Math.min(100, (p + breachError) * 100)
  ];

  // For Mean Downtime
  const variance = downtimes.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (iterations - 1);
  const stdDev = Math.sqrt(variance);
  const meanError = z * (stdDev / Math.sqrt(iterations));
  const meanDowntimeCI: [number, number] = [
    Math.max(0, mean - meanError),
    mean + meanError
  ];

  return {
    iterations,
    meanDowntime: mean,
    medianDowntime: median,
    p95Downtime: p95,
    p99Downtime: p99,
    breachProbability: p * 100,
    breachProbabilityCI,
    meanDowntimeCI,
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
  breachProbabilityCI?: [number, number];
  meanDowntimeCI?: [number, number];
  distribution: number[];
}

export const getHistogramData = (distribution: number[], bins: number = 40): { bin: string, count: number, label: string }[] => {
  if (distribution.length === 0) return [];
  
  const min = distribution[0];
  const max = distribution[distribution.length - 1];
  const range = max - min;

  if (range === 0) {
    return [{
      bin: min.toFixed(2),
      count: distribution.length,
      label: formatDuration(min)
    }];
  }
  
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
  if (!Number.isFinite(minutes) || minutes <= 0) return '0s';
  if (minutes < 1 / 60) return '< 1s';

  // Round to whole seconds first so carries propagate (no "1m 60s")
  const totalSeconds = Math.round(minutes * 60);
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);

  return parts.join(' ');
};
