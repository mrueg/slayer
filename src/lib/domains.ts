import type { FailureDomain } from './sla-calculator';

/**
 * Domains shared across branches are evaluated for every combination of up
 * and down, so the work doubles with each one; this keeps it bounded.
 */
export const MAX_FAILURE_DOMAINS = 10;

/** The lowest "Zone N" not in use yet, so names stay unique after deletions. */
export const nextDomainName = (domains: FailureDomain[], prefix = 'Zone'): string => {
  const taken = new Set(domains.map(domain => domain.name.trim().toLowerCase()));
  let n = 1;
  while (taken.has(`${prefix} ${n}`.toLowerCase())) n++;
  return `${prefix} ${n}`;
};
