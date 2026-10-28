// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { AbbrText } from './Abbr';

describe('AbbrText', () => {
  it('explains every known abbreviation and leaves other text alone', () => {
    const { container } = render(<AbbrText text="SLAs, MTTR and RTO/RPO of the SLAM" />);
    const titles = [...container.querySelectorAll('abbr')].map(el => [el.textContent, el.title]);
    expect(titles).toEqual([
      ['SLAs', 'Service Level Agreements'],
      ['MTTR', 'Mean Time To Recovery'],
      ['RTO', 'Recovery Time Objective'],
      ['RPO', 'Recovery Point Objective'],
    ]);
    expect(container.textContent).toBe('SLAs, MTTR and RTO/RPO of the SLAM');
  });
});
