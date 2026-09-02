import { fireEvent, screen, within } from '@testing-library/react';

/**
 * Drive a HaCompactSelect (now a token-styled listbox, no longer a native <select>).
 * Opens the dropdown by its accessible name and clicks the option with the given label.
 *
 * Replaces the old `fireEvent.change(getByRole('combobox'), { value })` pattern.
 */
export function selectHaOption(controlName: string | RegExp, optionLabel: string | RegExp): void {
  const trigger = screen.getByRole('button', { name: controlName });
  fireEvent.click(trigger);
  const listbox = screen.getByRole('listbox', { name: controlName });
  fireEvent.click(within(listbox).getByRole('option', { name: optionLabel }));
}
