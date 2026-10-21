import { clamp } from './number';
import {
  SLAItem,
  MonteCarloResult,
  calculateReliabilityWithoutDomains,
  createRandom,
  getActiveChildren,
  getDomainMttr,
  getMinChildrenRequired,
  getReplicaParams,
  randomSeed,
} from './sla-calculator';

/*
 * Component-level Monte Carlo simulation.
 *
 * Every component replica, failure domain and k-of-n switch is an alternating
 * up/down process: exponential times to failure with the mean that matches its
 * SLA, and exponential repairs with mean MTTR. Each simulated year advances
 * from event to event and re-evaluates the model whenever something changes,
 * so the timing of failures matters: redundancy only fails when its members
 * are down at the same time, and a failure domain takes all of its items down
 * together. Downtime is recorded per calendar month as well as per year.
 */

const YEAR_MINUTES = 365.25 * 24 * 60;
const MONTH_MINUTES = YEAR_MINUTES / 12;
const DEFAULT_MTTR = 60;
// The switch in front of a k-of-n pool has an availability (Failover %) but no repair time in the model
const SWITCH_MTTR = 60;
// Caps the work per run (simulated failures and repairs); flaky models simulate fewer years instead of hanging
const MAX_EVENTS = 1e7;

export interface Process {
  unavailability: number; // long-run share of time down, strictly between 0 and 1
  mttr: number; // mean repair time, minutes
}

type SimNode =
  | { kind: 'const'; up: boolean }
  | { kind: 'process'; index: number }
  | { kind: 'series'; children: SimNode[] }
  | { kind: 'kofn'; k: number; children: SimNode[] }
  | {
      kind: 'failover';
      primary: SimNode;
      standbys: SimNode[];
      switchProbability: number;
      switchover: number; // minutes of downtime per successful failover
    };

const UP: SimNode = { kind: 'const', up: true };
const DOWN: SimNode = { kind: 'const', up: false };

interface CompiledModel {
  root: SimNode;
  processes: Process[];
}

const series = (children: SimNode[]): SimNode => {
  if (children.some(child => child.kind === 'const' && !child.up)) return DOWN;
  const relevant = children.filter(child => child.kind !== 'const');
  if (relevant.length === 0) return UP;
  return relevant.length === 1 ? relevant[0] : { kind: 'series', children: relevant };
};

/** Turns the model into independent processes and the logic that combines them. */
export const compileModel = (root: SLAItem): CompiledModel => {
  const processes: Process[] = [];
  const domainsById = new Map((root.failureDomains || []).map(domain => [domain.id, domain]));
  const domainNodes = new Map<string, SimNode>();

  const process = (unavailability: number, mttr: number): SimNode => {
    if (unavailability <= 0) return UP;
    if (unavailability >= 1) return DOWN;
    processes.push({ unavailability, mttr });
    return { kind: 'process', index: processes.length - 1 };
  };

  // One process per domain, shared by every item tagged with it
  const domainNode = (id: string): SimNode => {
    let node = domainNodes.get(id);
    if (!node) {
      const domain = domainsById.get(id)!;
      node = process(1 - clamp(domain.sla / 100, 0, 1), getDomainMttr(domain));
      domainNodes.set(id, node);
    }
    return node;
  };

  // scale shrinks every unavailability below it: replicas with a shared-failure share β
  // keep only (1 − β) of their failures independent, the rest move to one shared process
  const build = (item: SLAItem, scale: number): SimNode => {
    const domains = (item.domains || []).filter(id => domainsById.has(id)).map(domainNode);
    const { replicas, required, working } = getReplicaParams(item);

    let body: SimNode;
    if (working < required) {
      body = DOWN;
    } else if (replicas <= 1) {
      body = buildBase(item, scale);
    } else {
      const beta = clamp((item.commonCause ?? 0) / 100, 0, 1);
      const copies = Array.from({ length: working }, () => buildBase(item, scale * (1 - beta)));
      const pool: SimNode = { kind: 'kofn', k: required, children: copies };
      body = beta > 0 ? series([sharedFailures(item, scale * beta), pool]) : pool;
    }
    return series([...domains, body]);
  };

  // The failures that hit all replicas of an item at once
  const sharedFailures = (item: SLAItem, scale: number): SimNode => {
    if (item.type === 'component') {
      return process(scale * (1 - clamp((item.sla ?? 100) / 100, 0, 1)), item.mttr && item.mttr > 0 ? item.mttr : DEFAULT_MTTR);
    }
    const single = calculateReliabilityWithoutDomains({ ...item, replicas: 1, commonCause: 0, failedReplicas: 0, domains: undefined });
    return process(scale * (1 - single.sla / 100), single.mttr || DEFAULT_MTTR);
  };

  const buildBase = (item: SLAItem, scale: number): SimNode => {
    if (item.type === 'component') {
      const availability = clamp((item.sla ?? 100) / 100, 0, 1);
      return process(scale * (1 - availability), item.mttr && item.mttr > 0 ? item.mttr : DEFAULT_MTTR);
    }

    const children = getActiveChildren(item).map(child => build(child, scale));
    if (children.length === 0) return UP;
    if (item.config === 'series') return series(children);

    const k = getMinChildrenRequired(item, children.length);
    const switchReliability = clamp((item.failoverSla ?? 100) / 100, 0, 1);
    if (k === 1) {
      if (children.length === 1) return children[0];
      return {
        kind: 'failover',
        primary: children[0],
        standbys: children.slice(1),
        switchProbability: switchReliability,
        switchover: Math.max(0, item.failoverTime ?? 0),
      };
    }
    return series([process(scale * (1 - switchReliability), SWITCH_MTTR), { kind: 'kofn', k, children }]);
  };

  const compiled = root.isOptional ? UP : build(root, 1);
  return { root: compiled, processes };
};

/** Min-heap of event times; index −1 marks a wake-up with no process to toggle. */
class EventQueue {
  private times: number[] = [];
  private indices: number[] = [];

  get size() { return this.times.length; }
  peekTime() { return this.times[0]; }
  clear() { this.times.length = 0; this.indices.length = 0; }

  push(time: number, index: number) {
    const { times, indices } = this;
    let i = times.length;
    times.push(time);
    indices.push(index);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (times[parent] <= time) break;
      times[i] = times[parent];
      indices[i] = indices[parent];
      i = parent;
    }
    times[i] = time;
    indices[i] = index;
  }

  pop(): number {
    const { times, indices } = this;
    const top = indices[0];
    const lastTime = times.pop()!;
    const lastIndex = indices.pop()!;
    const n = times.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        if (left >= n) break;
        const child = left + 1 < n && times[left + 1] < times[left] ? left + 1 : left;
        if (times[child] >= lastTime) break;
        times[i] = times[child];
        indices[i] = indices[child];
        i = child;
      }
      times[i] = lastTime;
      indices[i] = lastIndex;
    }
    return top;
  }
}

const CONST = 0;
const PROCESS = 1;
const SERIES = 2;
const KOFN = 3;
const FAILOVER = 4;

/**
 * The compiled model as numbered nodes, children before parents. A failure
 * domain shared by several items is one node with several parents.
 */
interface FlatModel {
  kind: Uint8Array;
  constUp: Uint8Array;
  k: Int32Array; // kofn: children required
  processIndex: Int32Array; // process nodes: index into processes
  primary: Int32Array; // failover: node id of the primary
  switchProbability: Float64Array;
  switchover: Float64Array;
  children: number[][];
  parents: number[][];
  processNode: Int32Array; // process index -> node id
  order: number[]; // every node after its children
  root: number;
}

const flatten = (model: CompiledModel): FlatModel => {
  const ids = new Map<SimNode, number>();
  const nodes: SimNode[] = [];
  const order: number[] = [];
  const visit = (node: SimNode): number => {
    const known = ids.get(node);
    if (known !== undefined) return known;
    const children = node.kind === 'series' || node.kind === 'kofn' ? node.children
      : node.kind === 'failover' ? [node.primary, ...node.standbys] : [];
    const childIds = children.map(visit);
    const id = nodes.length;
    ids.set(node, id);
    nodes.push(node);
    order.push(id);
    flatChildren[id] = childIds;
    return id;
  };
  const flatChildren: number[][] = [];
  const root = visit(model.root);

  const n = nodes.length;
  const flat: FlatModel = {
    kind: new Uint8Array(n),
    constUp: new Uint8Array(n),
    k: new Int32Array(n),
    processIndex: new Int32Array(n).fill(-1),
    primary: new Int32Array(n).fill(-1),
    switchProbability: new Float64Array(n),
    switchover: new Float64Array(n),
    children: flatChildren,
    parents: Array.from({ length: n }, () => []),
    processNode: new Int32Array(model.processes.length).fill(-1),
    order,
    root,
  };
  nodes.forEach((node, id) => {
    for (const child of flatChildren[id]) flat.parents[child].push(id);
    switch (node.kind) {
      case 'const':
        flat.kind[id] = CONST;
        flat.constUp[id] = node.up ? 1 : 0;
        break;
      case 'process':
        flat.kind[id] = PROCESS;
        flat.processIndex[id] = node.index;
        flat.processNode[node.index] = id;
        break;
      case 'series':
        flat.kind[id] = SERIES;
        break;
      case 'kofn':
        flat.kind[id] = KOFN;
        flat.k[id] = node.k;
        break;
      case 'failover':
        flat.kind[id] = FAILOVER;
        flat.primary[id] = flatChildren[id][0];
        flat.switchProbability[id] = node.switchProbability;
        flat.switchover[id] = node.switchover;
        break;
    }
  });
  return flat;
};

/** Simulated failures and repairs per year, used to keep a run's work bounded. */
const expectedEventsPerYear = (processes: Process[]): number =>
  processes.reduce((sum, p) => sum + (2 * p.unavailability * YEAR_MINUTES) / p.mttr, 0);

/**
 * How many years a run simulates: the requested number, or fewer when the model
 * fails so often that they would take too long.
 */
export const planYears = (processes: Process[], iterations: number): number => {
  const eventsPerYear = expectedEventsPerYear(processes) + 1;
  return Math.max(1, Math.min(iterations, Math.floor(MAX_EVENTS / eventsPerYear)));
};

const confidenceInterval = (share: number, iterations: number): [number, number] => {
  const error = 1.96 * Math.sqrt((share * (1 - share)) / iterations);
  return [Math.max(0, (share - error) * 100), Math.min(100, (share + error) * 100)];
};

/**
 * Simulates the model year by year. iterations is an upper bound: models with
 * very frequent failures simulate fewer years so a run stays fast, and the
 * result reports how many were used.
 */
export const simulateSystem = (
  root: SLAItem,
  targetSla: number,
  iterations: number = 10000,
  seed: number = randomSeed()
): MonteCarloResult => {
  const model = compileModel(root);
  const random = createRandom(seed);
  const exponential = (mean: number) => -Math.log(1 - random()) * mean;

  const years = planYears(model.processes, iterations);

  const flat = flatten(model);
  const nodeCount = flat.kind.length;
  const allowedYear = YEAR_MINUTES * (1 - targetSla / 100);
  const allowedMonth = MONTH_MINUTES * (1 - targetSla / 100);
  const meanUp = model.processes.map(p => (p.mttr * (1 - p.unavailability)) / p.unavailability);
  const processUp = new Uint8Array(model.processes.length);
  const queue = new EventQueue();
  const monthDowntime = new Float64Array(12);

  // Per node: whether it is up, and a count of children (down ones for series, up ones for k-of-n and standbys)
  const value = new Uint8Array(nodeCount);
  const counter = new Int32Array(nodeCount);
  // Failover state: the switch gets one attempt per primary outage
  const primaryWasUp = new Uint8Array(nodeCount);
  const switchFailed = new Uint8Array(nodeCount);
  const switchingUntil = new Float64Array(nodeCount);

  // A node's state from its children's, which are already up to date
  const compute = (id: number, time: number): number => {
    switch (flat.kind[id]) {
      case CONST: return flat.constUp[id];
      case PROCESS: return processUp[flat.processIndex[id]];
      case SERIES: return counter[id] === 0 ? 1 : 0;
      case KOFN: return counter[id] >= flat.k[id] ? 1 : 0;
      default: {
        const standbyUp = counter[id] > 0;
        if (value[flat.primary[id]] === 1) {
          primaryWasUp[id] = 1;
          switchFailed[id] = 0;
          return 1;
        }
        if (primaryWasUp[id] === 1) {
          // The primary just failed
          primaryWasUp[id] = 0;
          switchFailed[id] = random() >= flat.switchProbability[id] ? 1 : 0;
          if (switchFailed[id] === 0 && standbyUp && flat.switchover[id] > 0) {
            switchingUntil[id] = time + flat.switchover[id];
            queue.push(switchingUntil[id], -1 - id); // wake up when the switchover ends
          }
        }
        return switchFailed[id] === 0 && standbyUp && time >= switchingUntil[id] ? 1 : 0;
      }
    }
  };

  // Tells the parents of a node whose state just changed, and so on up while states keep changing
  const propagate = (id: number, time: number) => {
    const up = value[id] === 1;
    for (const parent of flat.parents[id]) {
      const kind = flat.kind[parent];
      if (kind === SERIES) counter[parent] += up ? -1 : 1;
      else if (kind === KOFN || flat.primary[parent] !== id) counter[parent] += up ? 1 : -1;
      // Failover groups recompute on every change, so they notice the primary failing
      const next = compute(parent, time);
      if (next !== value[parent]) {
        value[parent] = next;
        propagate(parent, time);
      }
    }
  };

  const update = (id: number, time: number) => {
    const next = compute(id, time);
    if (next !== value[id]) {
      value[id] = next;
      propagate(id, time);
    }
  };

  const addDowntime = (from: number, to: number) => {
    while (from < to) {
      const month = Math.min(11, Math.floor(from / MONTH_MINUTES));
      const end = month === 11 ? to : Math.min(to, (month + 1) * MONTH_MINUTES);
      monthDowntime[month] += end - from;
      from = end;
    }
  };

  const downtimes: number[] = [];
  let breaches = 0;
  let yearsWithMonthBreach = 0;
  let breachedMonths = 0;

  for (let year = 0; year < years; year++) {
    queue.clear();
    monthDowntime.fill(0);
    // Start in the long-run state; exponential times are memoryless, so no warm-up is needed
    model.processes.forEach((p, i) => {
      const up = random() >= p.unavailability;
      processUp[i] = up ? 1 : 0;
      queue.push(exponential(up ? meanUp[i] : p.mttr), i);
    });
    for (const id of flat.order) {
      const kind = flat.kind[id];
      let count = 0;
      for (const child of flat.children[id]) {
        if (kind === SERIES ? value[child] === 0 : child !== flat.primary[id] && value[child] === 1) count++;
      }
      counter[id] = count;
      primaryWasUp[id] = 1;
      switchFailed[id] = 0;
      switchingUntil[id] = 0;
      value[id] = compute(id, 0);
    }

    let time = 0;
    while (time < YEAR_MINUTES) {
      const next = queue.size > 0 ? Math.min(queue.peekTime(), YEAR_MINUTES) : YEAR_MINUTES;
      if (value[flat.root] === 0) addDowntime(time, next);
      time = next;
      if (time >= YEAR_MINUTES) break;
      while (queue.size > 0 && queue.peekTime() <= time) {
        const index = queue.pop();
        if (index < 0) {
          update(-1 - index, time);
          continue;
        }
        const nowUp = processUp[index] === 0;
        processUp[index] = nowUp ? 1 : 0;
        queue.push(time + exponential(nowUp ? meanUp[index] : model.processes[index].mttr), index);
        update(flat.processNode[index], time);
      }
    }

    let total = 0;
    let monthsOver = 0;
    for (const minutes of monthDowntime) {
      total += minutes;
      if (minutes > allowedMonth) monthsOver++;
    }
    downtimes.push(total);
    if (total > allowedYear) breaches++;
    if (monthsOver > 0) yearsWithMonthBreach++;
    breachedMonths += monthsOver;
  }

  downtimes.sort((a, b) => a - b);
  const mean = downtimes.reduce((a, b) => a + b, 0) / years;
  const variance = years > 1 ? downtimes.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (years - 1) : 0;
  const meanError = 1.96 * (Math.sqrt(variance) / Math.sqrt(years));
  const breachShare = breaches / years;
  const monthlyShare = yearsWithMonthBreach / years;

  return {
    iterations: years,
    seed,
    meanDowntime: mean,
    medianDowntime: downtimes[Math.floor(years * 0.5)],
    p95Downtime: downtimes[Math.floor(years * 0.95)],
    p99Downtime: downtimes[Math.floor(years * 0.99)],
    breachProbability: breachShare * 100,
    breachProbabilityCI: confidenceInterval(breachShare, years),
    meanDowntimeCI: [Math.max(0, mean - meanError), mean + meanError],
    monthlyBreachProbability: monthlyShare * 100,
    monthlyBreachProbabilityCI: confidenceInterval(monthlyShare, years),
    breachedMonthsPerYear: breachedMonths / years,
    distribution: downtimes,
  };
};
