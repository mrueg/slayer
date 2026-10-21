import { clamp } from './number';

export type Configuration = 'series' | 'parallel';
export type InputMode = 'percentage' | 'downtime';
export type DowntimePeriod = 'day' | 'month' | 'year';

/**
 * Infrastructure that several items share, such as an availability zone,
 * region or provider. When it fails, every item tagged with it fails at
 * the same time (a common-cause failure). Defined on the root item.
 */
export interface FailureDomain {
  id: string;
  name: string;
  sla: number; // Percentage availability of the domain itself
  mttr?: number; // Mean Time To Recovery in minutes
}

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
  commonCause?: number; // Beta factor: % of replica failures that hit all replicas at once
  config?: Configuration; // For groups
  minChildrenRequired?: number; // For groups: min up children
  failoverSla?: number; // Failover reliability for parallel groups
  failoverTime?: number; // Minutes of downtime per successful failover (parallel 1-of-n)
  isOptional?: boolean; // If true, this item doesn't count against the total SLA
  failedReplicas?: number; // Number of replicas that are currently DOWN (Chaos Mode)
  children?: SLAItem[]; // For groups
  inputMode?: InputMode;
  downtimeValue?: number; // in seconds
  downtimePeriod?: DowntimePeriod;
  rto?: number; // Recovery Time Objective in minutes
  rpo?: number; // Recovery Point Objective in minutes
  domains?: string[]; // Ids of failure domains this item depends on
  failureDomains?: FailureDomain[]; // Domain definitions (on the root item)
}

export interface CalculationResult {
  compositeSla: number;
  downtimePerYear: number;
  downtimePerMonth: number;
  downtimePerDay: number;
}

const YEAR_MINUTES = 365.25 * 24 * 60;


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
export const getActiveChildren = (item: SLAItem): SLAItem[] =>
  (item.children || []).filter(child => !child.isOptional);

interface ReplicaParams {
  replicas: number;
  required: number;
  working: number;
}

export const getReplicaParams = (item: SLAItem): ReplicaParams => {
  const replicas = Math.max(1, Math.floor(item.replicas || 1));
  const required = clamp(Math.floor(item.minReplicasRequired || 1), 1, replicas);
  const failed = clamp(Math.floor(item.failedReplicas || 0), 0, replicas);
  return { replicas, required, working: replicas - failed };
};

export const getMinChildrenRequired = (item: SLAItem, childCount: number): number =>
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
  downDomains?: ReadonlySet<string>;
  // Failure domains to condition on at each item (see assignDomainOwners)
  domainOwners?: ReadonlyMap<SLAItem, FailureDomain[]>;
}

interface NodeMetrics {
  availability: number; // 0-1
  frequency: number; // failures per year
  domainFrequency: number; // the part of frequency caused by failure domain outages
}

const UP: NodeMetrics = { availability: 1, frequency: 0, domainFrequency: 0 };
const DOWN: NodeMetrics = { availability: 0, frequency: 0, domainFrequency: 0 };

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
  const owned = overrides.domainOwners?.get(item);
  return owned ? conditionOnDomains(item, owned, overrides) : evaluateItem(item, overrides);
};

const evaluateItem = (item: SLAItem, overrides: Overrides): NodeMetrics => {
  if (item.id === overrides.forceDownId) return DOWN;
  if (item.isOptional) return UP;
  // A failed domain takes the item down regardless of the item's own health
  if (overrides.downDomains && item.domains?.some(d => overrides.downDomains!.has(d))) {
    return DOWN;
  }
  if (item.id === overrides.forceUpId) return UP;

  let base: NodeMetrics;

  if (item.type === 'component') {
    const availability = clamp((item.sla ?? 100) / 100, 0, 1);
    const mttr = item.mttr && item.mttr > 0 ? item.mttr : 60;
    const frequency = availability > 0 && availability < 1
      ? ((1 - availability) * YEAR_MINUTES) / mttr
      : 0;
    base = { availability, frequency, domainFrequency: 0 };
  } else {
    const childMetrics = getActiveChildren(item).map(child => evaluate(child, overrides));
    const probabilities = childMetrics.map(m => m.availability);
    const availability = combineGroup(item, probabilities);

    let frequency = 0;
    let domainFrequency = 0;
    childMetrics.forEach((child, i) => {
      if (child.frequency === 0) return;
      const up = [...probabilities];
      const down = [...probabilities];
      up[i] = 1;
      down[i] = 0;
      const importance = Math.max(0, combineGroup(item, up) - combineGroup(item, down));
      frequency += child.frequency * importance;
      domainFrequency += child.domainFrequency * importance;
    });

    base = { availability, frequency, domainFrequency };

    // Failover is not instant: every successful switch from the primary to a
    // standby is an outage of failoverTime minutes on top of the above.
    const switchover = item.failoverTime ?? 0;
    if (item.config === 'parallel' && switchover > 0 && probabilities.length > 1
      && getMinChildrenRequired(item, probabilities.length) === 1) {
      const switchReliability = clamp((item.failoverSla ?? 100) / 100, 0, 1);
      const standbyAvailable = 1 - probabilities.slice(1).reduce((acc, p) => acc * (1 - p), 1);
      // Primary failures caused by a failure domain outage are not charged
      const primaryFailures = childMetrics[0].frequency - childMetrics[0].domainFrequency;
      const failovers = primaryFailures * switchReliability * standbyAvailable;
      const lost = Math.min(availability, (failovers * switchover) / YEAR_MINUTES);
      base = { availability: availability - lost, frequency: frequency + failovers, domainFrequency };
    }
  }

  // Apply redundancy (replicas) to both components and groups
  const { replicas, required, working } = getReplicaParams(item);
  if (working < required) return DOWN;
  if (replicas <= 1) return base;

  // Beta-factor model: a share β of each replica's failures (same bug, same
  // bad config push) takes down all replicas at once; the rest are independent.
  const beta = clamp((item.commonCause ?? 0) / 100, 0, 1);
  const unavailability = 1 - base.availability;
  const sharedAvailability = 1 - beta * unavailability;
  const independentAvailability = 1 - (1 - beta) * unavailability;

  const pool = calculateKofN(Array(working).fill(independentAvailability), required);
  const others = Array(working - 1).fill(independentAvailability);
  const importance = calculateKofN(others, required - 1) - calculateKofN(others, required);
  // System failures per failure of a single replica
  const perFailure = beta * pool + sharedAvailability * working * (1 - beta) * Math.max(0, importance);

  return {
    availability: sharedAvailability * pool,
    frequency: base.frequency * perFailure,
    domainFrequency: base.domainFrequency * perFailure,
  };
};

const getAllItems = (item: SLAItem): SLAItem[] =>
  [item, ...(item.children || []).flatMap(getAllItems)];

/** Items that take part in the calculation: everything except optional items and their subtrees. */
const getCriticalItems = (item: SLAItem): SLAItem[] =>
  item.isOptional ? [] : [item, ...getActiveChildren(item).flatMap(getCriticalItems)];

// Domain states less likely than this are skipped; their effect is far below display precision
const DOMAIN_STATE_EPSILON = 1e-15;
const DEFAULT_DOMAIN_MTTR = 120;

/** The MTTR the calculation uses for a domain (unset or non-positive values fall back to the default). */
export const getDomainMttr = (domain: FailureDomain): number =>
  domain.mttr && domain.mttr > 0 ? domain.mttr : DEFAULT_DOMAIN_MTTR;

/** Domains that are defined and referenced by at least one item. */
const getRelevantDomains = (root: SLAItem, domains: FailureDomain[]): FailureDomain[] => {
  if (domains.length === 0) return [];
  // Tags on optional items cannot affect the result, so they don't count
  const used = new Set(getCriticalItems(root).flatMap(item => item.domains || []));
  return domains.filter(domain => used.has(domain.id));
};

interface DomainState {
  down: string[];
  probability: number;
}

const enumerateDomainStates = (domains: FailureDomain[]): DomainState[] => {
  const states: DomainState[] = [];
  const walk = (index: number, down: string[], probability: number) => {
    if (probability < DOMAIN_STATE_EPSILON) return;
    if (index === domains.length) {
      states.push({ down, probability });
      return;
    }
    const availability = clamp(domains[index].sla / 100, 0, 1);
    walk(index + 1, down, probability * availability);
    walk(index + 1, [...down, domains[index].id], probability * (1 - availability));
  };
  walk(0, [], 1);
  return states;
};

/**
 * Evaluates an item by conditioning on which of the given domains are up.
 * Domain failure frequencies are added with the same Birnbaum formula used
 * for components, so frequency × MTTR stays consistent with the availability.
 */
const conditionOnDomains = (item: SLAItem, domains: FailureDomain[], overrides: Overrides): NodeMetrics => {
  const results = enumerateDomainStates(domains).map(state => ({
    state,
    metrics: evaluateItem(item, {
      ...overrides,
      downDomains: new Set([...(overrides.downDomains || []), ...state.down]),
    }),
  }));

  let availability = 0;
  let frequency = 0;
  let domainFrequency = 0;
  for (const { state, metrics } of results) {
    availability += state.probability * metrics.availability;
    frequency += state.probability * metrics.frequency;
    domainFrequency += state.probability * metrics.domainFrequency;
  }

  for (const domain of domains) {
    const domainAvailability = clamp(domain.sla / 100, 0, 1);
    if (domainAvailability <= 0 || domainAvailability >= 1) continue;
    let whenUp = 0;
    let whenDown = 0;
    for (const { state, metrics } of results) {
      if (state.down.includes(domain.id)) whenDown += state.probability * metrics.availability;
      else whenUp += state.probability * metrics.availability;
    }
    const importance = whenUp / domainAvailability - whenDown / (1 - domainAvailability);
    const caused = ((1 - domainAvailability) * YEAR_MINUTES) / getDomainMttr(domain) * Math.max(0, importance);
    frequency += caused;
    domainFrequency += caused;
  }

  return { availability, frequency, domainFrequency };
};

/**
 * Picks the item at which to condition on each domain: the lowest one whose
 * subtree contains every critical item tagged with it. Once all domains
 * reaching into a subtree are fixed, the subtree is independent of the rest
 * of the system, so conditioning there is exact. A domain used in one branch
 * then costs two evaluations of that branch instead of doubling the work for
 * the whole tree. Replicated items take every domain below them, since all
 * replicas share it.
 */
const assignDomainOwners = (root: SLAItem, domains: FailureDomain[]): Map<SLAItem, FailureDomain[]> => {
  const owners = new Map<SLAItem, FailureDomain[]>();
  const byId = new Map(domains.map(d => [d.id, d]));
  if (byId.size === 0 || root.isOptional) return owners;

  // Domains referenced anywhere in each critical subtree
  const refs = new Map<SLAItem, Set<string>>();
  const collect = (item: SLAItem): Set<string> => {
    const found = new Set((item.domains || []).filter(id => byId.has(id)));
    for (const child of getActiveChildren(item)) for (const id of collect(child)) found.add(id);
    refs.set(item, found);
    return found;
  };
  collect(root);

  // pending: domains reaching into this subtree that no ancestor conditions on
  const assign = (item: SLAItem, pending: Set<string>) => {
    const children = getActiveChildren(item);
    // Replicas are independent copies of the subtree, but a domain inside it
    // is shared by all of them, so it has to be fixed before replicating
    const replicated = (item.replicas || 1) > 1;
    const owned = [...pending].filter(id => replicated
      || item.domains?.includes(id) || children.filter(child => refs.get(child)!.has(id)).length > 1);
    if (owned.length > 0) owners.set(item, owned.map(id => byId.get(id)!));
    for (const child of children) {
      assign(child, new Set([...refs.get(child)!].filter(id => pending.has(id) && !owned.includes(id))));
    }
  };
  assign(root, refs.get(root)!);
  return owners;
};

/** Evaluates a tree including the shared failure domains its items are tagged with. */
const evaluateSystem = (root: SLAItem, overrides: Overrides = {}, domains = root.failureDomains || []): NodeMetrics =>
  evaluate(root, { ...overrides, domainOwners: assignDomainOwners(root, domains) });

/** SLA of the whole model in percent, including the failure domains defined on its root. */
export const calculateSLA = (root: SLAItem): number =>
  evaluateSystem(root).availability * 100;

/**
 * SLA in percent of one item inside a model. Failure domains are defined on
 * the root only, so the item alone does not know them: pass the root's.
 */
export const calculateItemSLA = (item: SLAItem, domains: FailureDomain[]): number =>
  evaluateSystem(item, {}, domains).availability * 100;

/**
 * SLA in percent of every item in the model, keyed by id, with the root's
 * failure domains applied. Computed once per model so views can look it up.
 */
export const getItemSLAs = (root: SLAItem): Record<string, number> => {
  const domains = root.failureDomains || [];
  return Object.fromEntries(getAllItems(root).map(item => [item.id, evaluateSystem(item, {}, domains).availability * 100]));
};

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

const toReliability = ({ availability, frequency }: NodeMetrics): ReliabilityResult => {
  const mttr = frequency > 0 ? ((1 - availability) * YEAR_MINUTES) / frequency : 0;
  return { sla: availability * 100, frequency, mttr };
};

/** Reliability of the whole model, including the failure domains defined on its root. */
export const calculateReliability = (root: SLAItem): ReliabilityResult => toReliability(evaluateSystem(root));

/** Reliability of an item on its own, leaving failure domains out. */
export const calculateReliabilityWithoutDomains = (item: SLAItem): ReliabilityResult => toReliability(evaluateSystem(item, {}, []));

export interface BottleneckResult {
  ids: string[];
  impact: number;
}

/**
 * Calculates the SLA of an item while treating a specific ID as 0% available.
 */
const calculateSLAWithForcedFailure = (item: SLAItem, forcedFailedId: string): number =>
  evaluateSystem(item, { forceDownId: forcedFailedId }).availability * 100;

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

export interface SensitivityEntry {
  id: string;
  name: string;
  type: SLAItem['type'] | 'domain';
  slaGain: number; // percentage points gained if this item or domain were 100% available
  downtimeSavedPerYear: number; // minutes
}

/**
 * Ranks every item and failure domain by how much the system SLA would
 * improve if it never failed, i.e. where reliability work pays off most.
 * Entries with no effect (optional, unused, or fully masked by redundancy)
 * are omitted.
 */
export const getSensitivityRanking = (root: SLAItem): SensitivityEntry[] => {
  const currentSla = calculateSLA(root);
  const domains = root.failureDomains || [];
  const entry = (id: string, name: string, type: SensitivityEntry['type'], improvedSla: number): SensitivityEntry => {
    const slaGain = improvedSla - currentSla;
    return { id, name, type, slaGain, downtimeSavedPerYear: (slaGain / 100) * YEAR_MINUTES };
  };
  const items = getAllItems(root)
    .filter(item => item.id !== root.id)
    .map(item => entry(item.id, item.name, item.type, evaluateSystem(root, { forceUpId: item.id }).availability * 100));
  const domainEntries = domains.map(domain => entry(domain.id, domain.name, 'domain',
    evaluateSystem(root, {}, domains.map(d => (d.id === domain.id ? { ...d, sla: 100 } : d))).availability * 100));
  return [...items, ...domainEntries]
    .filter(entry => entry.slaGain > 1e-12)
    .sort((a, b) => b.slaGain - a.slaGain);
};

/**
 * The top entries of the sensitivity ranking: the items or failure domains
 * whose improvement helps the system most. Ties go to the least available
 * ones. Items killed in chaos mode only count where they break the system on
 * their own.
 */
export const findBottleneck = (root: SLAItem, ranking = getSensitivityRanking(root)): BottleneckResult => {
  if (!root.children?.length) return { ids: [root.id], impact: 100 - calculateSLA(root) };

  const domains = root.failureDomains || [];
  const items = new Map(getAllItems(root).map(item => [item.id, item]));
  const serialMap = getSerialMap(root);
  const candidates = ranking.filter(entry => {
    const item = items.get(entry.id);
    return !item || (item.failedReplicas || 0) < (item.replicas || 1) || serialMap[item.id];
  });
  if (candidates.length === 0) return { ids: [], impact: 0 };

  const impact = candidates[0].slaGain;
  const tied = candidates.filter(entry => impact - entry.slaGain < 1e-12);
  const ownSla = (id: string) => {
    const item = items.get(id);
    return item ? calculateItemSLA(item, domains) : domains.find(d => d.id === id)!.sla;
  };
  const slas = tied.map(entry => ownSla(entry.id));
  const lowest = Math.min(...slas);
  return { ids: tied.filter((_, i) => slas[i] <= lowest + 1e-12).map(entry => entry.id), impact };
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
  // Independent failures only; shared failure domains are added as a final step
  const rel = calculateReliabilityWithoutDomains(item);
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
        inputValues: [`Base MTTR: ${baseMttr}m`, `Min Required: ${k}`, ...(item.commonCause ? [`Shared failures: ${item.commonCause}%`] : [])],
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
      
      const childRels = activeChildren.map(calculateReliabilityWithoutDomains);
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
          inputValues: [...childRels.map(r => `${formatSLAPercentage(r.sla)}%`), ...(item.failoverTime ? [`Switchover: ${formatDuration(item.failoverTime)}`] : [])],
          result: rel.sla,
          mttrResult: rel.mttr,
          frequencyResult: rel.frequency,
          rtoResult: dr.rto,
          rpoResult: dr.rpo
        });
      }
    }
  }

  const domains = getRelevantDomains(item, item.failureDomains || []);
  if (domains.length > 0) {
    const withDomains = calculateReliability(item);
    steps.push({
      id: `${item.id}:domains`,
      name: 'Shared failure domains',
      type: 'group',
      formula: `Conditioned on ${domains.length} failure domain${domains.length === 1 ? '' : 's'}`,
      explanation: 'Items in the same domain fail together when the domain fails.',
      inputValues: domains.map(d => `${d.name}: ${formatSLAPercentage(d.sla)}%`),
      result: withDomains.sla,
      mttrResult: withDomains.mttr,
      frequencyResult: withDomains.frequency,
      rtoResult: dr.rto,
      rpoResult: dr.rpo
    });
  }

  return steps;
};

export interface DomainImpact {
  id: string;
  name: string;
  itemCount: number; // critical (non-optional) items tagged with the domain
  downtimePerYear: number; // minutes of system downtime caused by the domain
  slaWhileDown: number; // system SLA while the domain is down
}

/** How much each failure domain costs the system, and what is left while it is down. */
export const getDomainImpact = (root: SLAItem): DomainImpact[] => {
  const domains = root.failureDomains || [];
  const items = getCriticalItems(root);
  const current = evaluateSystem(root).availability;
  return domains.map(domain => {
    const withDomain = (sla: number) => evaluateSystem(root, {}, domains.map(d => (d.id === domain.id ? { ...d, sla } : d))).availability;
    return {
      id: domain.id,
      name: domain.name,
      itemCount: items.filter(item => item.domains?.includes(domain.id)).length,
      downtimePerYear: Math.max(0, withDomain(100) - current) * YEAR_MINUTES,
      slaWhileDown: withDomain(0) * 100,
    };
  });
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

/**
 * Seedable PRNG (mulberry32) so simulation runs can be reproduced.
 * Returns floats in [0, 1).
 */
export const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const randomSeed = (): number => Math.floor(Math.random() * 0x100000000);

export interface MonteCarloResult {
  iterations: number;
  seed: number; // pass to runMonteCarlo to reproduce this run
  meanDowntime: number;
  medianDowntime: number;
  p95Downtime: number;
  p99Downtime: number;
  breachProbability: number; // % of years over the yearly downtime budget
  breachProbabilityCI?: [number, number];
  meanDowntimeCI?: [number, number];
  monthlyBreachProbability: number; // % of years with at least one month over its budget
  monthlyBreachProbabilityCI?: [number, number];
  breachedMonthsPerYear: number; // average number of months over budget per year
  distribution: number[]; // yearly downtime in minutes, sorted
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

/**
 * Formats an SLA percentage keeping every leading "nine" plus two further
 * significant digits (e.g. 99.95, 99.12, 99.99912). Digits beyond that are
 * truncated, never rounded up, so availability is not overstated.
 */
export const formatSLAPercentage = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  if (value >= 100) return '100';
  if (value <= 0) return '0';

  const DECIMALS = 12;
  const fixed = value.toFixed(DECIMALS);
  // Values just below 100 must not round up to "100"
  const str = fixed.startsWith('100') ? `99.${'9'.repeat(DECIMALS)}` : fixed;
  const [intPart, fracPart] = str.split('.');

  let leadingNines = 0;
  while (leadingNines < fracPart.length && fracPart[leadingNines] === '9') leadingNines++;

  const resultFrac = fracPart.slice(0, Math.min(fracPart.length, leadingNines + 2)).replace(/0+$/, '');
  return resultFrac ? `${intPart}.${resultFrac}` : intPart;
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

/**
 * Probability of getting through a window of `minutes` without an
 * incident, given the system is up at the start. Uses the failure rate
 * while up (frequency / availability) with exponential times between
 * failures, i.e. R(t) = exp(-λ·t).
 */
export const incidentFreeProbability = (reliability: ReliabilityResult, minutes: number): number => {
  const availability = reliability.sla / 100;
  if (availability <= 0) return 0;
  if (reliability.frequency <= 0 || minutes <= 0) return 1;
  const failuresPerMinuteUp = reliability.frequency / availability / YEAR_MINUTES;
  return Math.exp(-failuresPerMinuteUp * minutes);
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
