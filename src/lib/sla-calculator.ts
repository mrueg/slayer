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
  downtimeValue?: number; // in minutes
  downtimePeriod?: DowntimePeriod;
}

export interface CalculationResult {
  compositeSla: number;
  downtimePerYear: number;
  downtimePerMonth: number;
  downtimePerDay: number;
}

export const calculateSLA = (item: SLAItem): number => {
  if (item.type === 'component') {
    const singleSla = item.sla ?? 100;
    const replicas = item.replicas || 1;
    
    if (replicas <= 1) return singleSla;
    
    // Multiple replicas of a single component are treated as parallel redundancy
    // SLA = 1 - (1 - SLA_single)^replicas
    const failureProbability = Math.pow(1 - singleSla / 100, replicas);
    return (1 - failureProbability) * 100;
  }

  const children = item.children || [];
  if (children.length === 0) return 100;

  const childSlas = children.map(child => calculateSLA(child));

  if (item.config === 'series') {
    return childSlas.reduce((acc, sla) => acc * (sla / 100), 1) * 100;
  } else {
    const failureProbability = childSlas.reduce(
      (acc, sla) => acc * (1 - sla / 100),
      1
    );
    return (1 - failureProbability) * 100;
  }
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

export const slaFromDowntime = (minutes: number, period: DowntimePeriod): number => {
  const totalMinutes = {
    year: 365.25 * 24 * 60,
    month: (365.25 * 24 * 60) / 12,
    day: 24 * 60,
  }[period];
  
  if (minutes >= totalMinutes) return 0;
  if (minutes <= 0) return 100;
  
  return (1 - minutes / totalMinutes) * 100;
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
