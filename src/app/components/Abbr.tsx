import React from 'react';

export const ABBREVIATIONS: Record<string, string> = {
  SLA: 'Service Level Agreement',
  SLAs: 'Service Level Agreements',
  MTTR: 'Mean Time To Recovery',
  RTO: 'Recovery Time Objective',
  RPO: 'Recovery Point Objective',
  DR: 'Disaster Recovery',
  CI: 'Confidence Interval',
  P95: '95th Percentile',
};

// Longest first, so "SLAs" wins over "SLA"
const PATTERN = new RegExp(
  `\\b(${Object.keys(ABBREVIATIONS).sort((a, b) => b.length - a.length).join('|')})\\b`,
  'g',
);

/** An abbreviation that shows its full name when hovered. */
export const Abbr: React.FC<{ children: string }> = ({ children }) => (
  <abbr title={ABBREVIATIONS[children]} className="cursor-help underline decoration-dotted underline-offset-2">
    {children}
  </abbr>
);

/** Renders text with every known abbreviation wrapped in an Abbr. */
export const AbbrText: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(PATTERN).map((part, i) =>
      i % 2 === 1 ? <Abbr key={i}>{part}</Abbr> : part,
    )}
  </>
);
