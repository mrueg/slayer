// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileMenu from './FileMenu';

afterEach(cleanup);

const setup = () => {
  const handlers = { onImport: vi.fn(), onExport: vi.fn(), onReset: vi.fn(), onClear: vi.fn() };
  render(<FileMenu {...handlers} />);
  return { user: userEvent.setup(), handlers, trigger: screen.getByRole('button', { name: /file/i }) };
};

describe('FileMenu', () => {
  it('is closed until the trigger is clicked', async () => {
    const { user, trigger } = setup();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('offers every export format', async () => {
    const { user, trigger, handlers } = setup();
    const formats = [
      ['Configuration (JSON)', 'json'],
      ['Markdown (.md)', 'markdown'],
      ['PDF (print dialog)', 'pdf'],
      ['SVG image', 'svg'],
      ['PNG image', 'png'],
    ];
    for (const [label, format] of formats) {
      await user.click(trigger);
      await user.click(screen.getByRole('menuitem', { name: label }));
      expect(handlers.onExport).toHaveBeenLastCalledWith(format);
    }
    expect(handlers.onExport).toHaveBeenCalledTimes(formats.length);
  });

  it.each([
    ['Import JSON…', 'onImport'],
    ['Reset to default example', 'onReset'],
    ['Clear all components', 'onClear'],
  ] as const)('%s calls %s once and closes the menu', async (label, handler) => {
    const { user, trigger, handlers } = setup();
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: label }));
    expect(handlers[handler]).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape and on a click outside', async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(trigger);
    await user.click(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
