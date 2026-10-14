import type { FailureDomain, SLAItem } from './sla-calculator';
import { clamp } from './number';

const MAX_REPLICAS = 99;

/** Clamps a failure domain's SLA to 0-100 and its MTTR to whole minutes of at least 1. */
export const normalizeDomain = (domain: FailureDomain): FailureDomain => {
  const next: FailureDomain = { ...domain, sla: clamp(domain.sla, 0, 100) };
  if (next.mttr !== undefined) next.mttr = Math.max(1, Math.floor(next.mttr));
  return next;
};

/**
 * Clamps numeric fields of an item into valid ranges and keeps dependent
 * fields consistent (e.g. lowering replicas also lowers Min UP and the
 * number of chaos-failed replicas).
 */
export const normalizeItem = (item: SLAItem): SLAItem => {
  const next: SLAItem = { ...item };

  if (next.sla !== undefined) next.sla = clamp(next.sla, 0, 100);
  if (next.failoverSla !== undefined) next.failoverSla = clamp(next.failoverSla, 0, 100);
  if (next.failoverTime !== undefined) next.failoverTime = Math.max(0, next.failoverTime);
  if (next.mttr !== undefined) next.mttr = Math.max(1, next.mttr);
  if (next.rto !== undefined) next.rto = Math.max(0, next.rto);
  if (next.rpo !== undefined) next.rpo = Math.max(0, next.rpo);
  if (next.downtimeValue !== undefined) next.downtimeValue = Math.max(0, next.downtimeValue);

  const replicas = clamp(Math.floor(next.replicas || 1), 1, MAX_REPLICAS);
  if (next.replicas !== undefined) next.replicas = replicas;
  if (next.commonCause !== undefined) next.commonCause = clamp(next.commonCause, 0, 100);
  if (next.minReplicasRequired !== undefined) {
    next.minReplicasRequired = clamp(Math.floor(next.minReplicasRequired), 1, replicas);
  }
  if (next.failedReplicas !== undefined) {
    next.failedReplicas = clamp(Math.floor(next.failedReplicas), 0, replicas);
  }
  if (next.minChildrenRequired !== undefined) {
    const childCount = Math.max(1, next.children?.length || 0);
    next.minChildrenRequired = clamp(Math.floor(next.minChildrenRequired), 1, childCount);
  }

  return next;
};
