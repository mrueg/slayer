import { describe, expect, it } from 'vitest';
import { TEMPLATES } from './templates';
import { parseConfig } from '../lib/config';
import { getModelWarnings } from '../lib/warnings';
import { calculateSLA, getDomainImpact, getSensitivityRanking } from '../lib/sla-calculator';

describe('templates', () => {
  it.each(Object.entries(TEMPLATES))('%s survives import validation unchanged', (_, template) => {
    expect(parseConfig(template.data)).toEqual(template.data);
  });

  it.each(Object.entries(TEMPLATES))('%s has no model warnings beyond intended ones', (key, template) => {
    const warnings = getModelWarnings(template.data).filter(w => w.severity === 'warning');
    // The concert deliberately has both guitarists eat the same shrimp and requires all six strings
    expect(warnings.map(w => w.itemId)).toEqual(key === 'concert' ? ['guitars', 'strings'] : []);
  });

  it('concert: the strings and the drummer are the biggest risks', () => {
    const show = TEMPLATES.concert.data;
    const components = getSensitivityRanking(show).filter(entry => entry.type === 'component');
    expect(components.slice(0, 2).map(entry => entry.id)).toEqual(['strings', 'drums']);
    expect(calculateSLA(show)).toBeGreaterThan(97);
    expect(calculateSLA(show)).toBeLessThan(99);
  });

  it('concert: the shared catering costs more than either guitarist', () => {
    const show = TEMPLATES.concert.data;
    const catering = getDomainImpact(show).find(d => d.id === 'catering')!;
    expect(catering.itemCount).toBe(4);
    expect(catering.slaWhileDown).toBe(0);
    const guitarist = getSensitivityRanking(show).find(e => e.id === 'guitar-a')!;
    expect(catering.downtimePerYear).toBeGreaterThan(guitarist.downtimeSavedPerYear * 5);
  });
});
