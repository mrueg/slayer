import type { FailureDomain } from './sla-calculator';

/** The lowest "Zone N" not in use yet, so names stay unique after deletions. */
export const nextDomainName = (domains: FailureDomain[], prefix = 'Zone'): string => {
  const taken = new Set(domains.map(domain => domain.name.trim().toLowerCase()));
  let n = 1;
  while (taken.has(`${prefix} ${n}`.toLowerCase())) n++;
  return `${prefix} ${n}`;
};
