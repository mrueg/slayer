// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReliabilityAnalysisPanel from './ReliabilityAnalysisPanel';
import type { MonteCarloResult } from '@/lib/sla-calculator';

afterEach(cleanup);

type Props = React.ComponentProps<typeof ReliabilityAnalysisPanel>;

const setup = (overrides: {
  simulation?: Partial<Props['simulation']>;
  dr?: Partial<Props['dr']>;
  errorBudget?: Partial<Props['errorBudget']>;
} = {}) => {
  const props: Props = {
    compositeSla: 99.9,
    simulation: {
      result: null,
      isRunning: false,
      autoRun: false,
      onAutoRunChange: vi.fn(),
      targetSlaOverride: null,
      onTargetSlaOverrideChange: vi.fn(),
      onRun: vi.fn(),
      onShowDistribution: vi.fn(),
      ...overrides.simulation,
    },
    dr: {
      targetRto: 60,
      targetRpo: 15,
      onTargetRtoChange: vi.fn(),
      onTargetRpoChange: vi.fn(),
      ...overrides.dr,
    },
    errorBudget: {
      consumedSeconds: 0,
      onConsumedSecondsChange: vi.fn(),
      period: 'month',
      onPeriodChange: vi.fn(),
      remainingSeconds: 2592,
      totalBudgetSeconds: 2592,
      isBreached: false,
      ...overrides.errorBudget,
    },
  };
  render(<ReliabilityAnalysisPanel {...props} />);
  return { user: userEvent.setup(), props };
};

const objective = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

describe('ReliabilityAnalysisPanel', () => {
  describe('simulation', () => {
    it('shows the run button only when auto-run is off', async () => {
      const { user, props } = setup();
      await user.click(screen.getByRole('button', { name: /run yearly simulation/i }));
      expect(props.simulation.onRun).toHaveBeenCalledTimes(1);

      cleanup();
      setup({ simulation: { autoRun: true } });
      expect(screen.queryByRole('button', { name: /run yearly simulation/i })).toBeNull();
    });

    it('disables the run button while a run is in progress', () => {
      setup({ simulation: { isRunning: true } });
      expect(screen.getByRole('button', { name: /run yearly simulation/i }).hasAttribute('disabled')).toBe(true);
    });

    it('toggles auto-run through the switch', async () => {
      const { user, props } = setup();
      const toggle = screen.getByRole('switch');
      expect(toggle.getAttribute('aria-checked')).toBe('false');
      await user.click(toggle);
      expect(props.simulation.onAutoRunChange).toHaveBeenCalledWith(true);
    });

    it('defaults the target to the composite SLA and offers a reset once overridden', async () => {
      setup();
      expect((screen.getByRole('spinbutton', { name: /target sla/i }) as HTMLInputElement).value).toBe('99.9');
      expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();

      cleanup();
      const { user, props } = setup({ simulation: { targetSlaOverride: 99.5 } });
      expect((screen.getByRole('spinbutton', { name: /target sla/i }) as HTMLInputElement).value).toBe('99.5');
      await user.click(screen.getByRole('button', { name: 'Reset' }));
      expect(props.simulation.onTargetSlaOverrideChange).toHaveBeenCalledWith(null);
    });

    it('shows the results and opens the distribution', async () => {
      const result = {
        iterations: 2500, breachProbability: 12.345, monthlyBreachProbability: 64.2, breachedMonthsPerYear: 1.25, medianDowntime: 90, p95Downtime: 600,
      } as MonteCarloResult;
      const { user, props } = setup({ simulation: { result } });
      expect(screen.getByText('12.35%')).toBeTruthy();
      expect(screen.getByText('64.20%')).toBeTruthy();
      expect(screen.getByText('1.3 of 12 months per year on average')).toBeTruthy();
      expect(screen.getByText('2,500 simulated years')).toBeTruthy();
      expect(screen.getByText('1h 30m')).toBeTruthy();
      expect(screen.getByText('10h')).toBeTruthy();
      await user.click(screen.getByRole('button', { name: /view distribution/i }));
      expect(props.simulation.onShowDistribution).toHaveBeenCalledTimes(1);
    });
  });

  describe('DR goals', () => {
    it('labels the targets in minutes', () => {
      setup();
      expect(screen.getByRole('spinbutton', { name: 'Target RTO (min)' })).toBeTruthy();
      expect(screen.getByRole('spinbutton', { name: 'Target RPO (min)' })).toBeTruthy();
    });

    it('marks objectives as met, missed or not set', () => {
      setup({ dr: { rto: 30, rpo: 20 } });
      expect(objective('System RTO:')).toBe('30m ✓');
      expect(objective('System RPO:')).toBe('20m !!');

      cleanup();
      setup();
      expect(objective('System RTO:')).toBe('not set');
      expect(objective('System RPO:')).toBe('not set');
    });

    it('reports target changes as whole minutes, treating an empty field as 0', () => {
      const { props } = setup();
      const rto = screen.getByRole('spinbutton', { name: 'Target RTO (min)' });
      fireEvent.change(rto, { target: { value: '45' } });
      expect(props.dr.onTargetRtoChange).toHaveBeenLastCalledWith(45);
      fireEvent.change(rto, { target: { value: '' } });
      expect(props.dr.onTargetRtoChange).toHaveBeenLastCalledWith(0);
    });
  });

  describe('error budget', () => {
    it('shows the remaining budget, converting seconds for display', () => {
      setup({ errorBudget: { remainingSeconds: 1800 } });
      expect(screen.getByText('30m')).toBeTruthy();
    });

    it('shows BREACHED once the budget is used up', () => {
      setup({ errorBudget: { remainingSeconds: 0, isBreached: true } });
      expect(screen.getByText('BREACHED')).toBeTruthy();
    });

    it('reports consumed downtime in seconds and period changes', async () => {
      const { user, props } = setup();
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Consumed (sec)' }), { target: { value: '120.5' } });
      expect(props.errorBudget.onConsumedSecondsChange).toHaveBeenLastCalledWith(120.5);
      await user.selectOptions(screen.getByRole('combobox', { name: 'Period' }), 'year');
      expect(props.errorBudget.onPeriodChange).toHaveBeenCalledWith('year');
    });
  });
});
