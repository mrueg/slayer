export type Configuration = 'series' | 'parallel';
export type InputMode = 'percentage' | 'downtime';
export type DowntimePeriod = 'day' | 'month' | 'year';

export interface SLAItem {
  id: string;
  name: string;
  type: 'component' | 'group';
  sla?: number; // Percentage, e.g., 99.9 (for components)
  replicas?: number; // Number of redundant instances (for components)
  config?: Configuration; // For groups
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
        const failureProbability = childSlas.reduce(
          (acc, sla) => acc * (1 - sla / 100),
          1
        );
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
  id: string;
  impact: number;
}

/**
 * Calculates the SLA of an item while treating a specific ID as 100% available.
 * Used for sensitivity analysis.
 */
const calculateSLAWithOverride = (item: SLAItem, overrideId: string): number => {
  if (item.id === overrideId) return 100;
  
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
        const failureProbability = childSlas.reduce((acc, sla) => acc * (1 - sla / 100), 1);
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
  
  let bestId = root.id;
  let maxImpact = -1;
  let lowestSlaAtMaxImpact = 101;

  // Skip the root itself as the bottleneck candidate unless it's the only node
  const candidates = allItems.length > 1 
    ? allItems.filter(item => item.id !== root.id)
    : allItems;

  for (const item of candidates) {
    const slaWithImprovement = calculateSLAWithOverride(root, item.id);
    const impact = slaWithImprovement - currentRootSla;
    const individualSla = calculateSLA(item);
    
    // Tie-breaker: if impact is the same (common in parallel groups), 
    // pick the one with the lowest individual SLA.
    const isSignificantImprovement = impact > maxImpact + 1e-12;
    const isEquivalentButWorseSla = Math.abs(impact - maxImpact) < 1e-12 && individualSla < lowestSlaAtMaxImpact;

    if (isSignificantImprovement || isEquivalentButWorseSla) {
      maxImpact = impact;
      lowestSlaAtMaxImpact = individualSla;
      bestId = item.id;
    }
  }

  return { id: bestId, impact: maxImpact };
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
