/**
 * HelpButton — Question mark icon with popover menu
 * Links: Documentation, Keyboard shortcuts, Release notes, Support
 */

import { useState } from 'react';

import { BookOpen, FileText, HelpCircle, Keyboard, Mail } from 'lucide-react';

export function HelpButton(): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = (): void => {
    setIsOpen(!isOpen);
  };

  const handleItemClick = (_action: string): void => {
    setIsOpen(false);
    // Help destinations are not yet wired to secured docs routes.
  };

  return (
    <div className="ha-help-menu">
      <button
        onClick={handleToggle}
        type="button"
        aria-label="Help"
        aria-expanded={isOpen}
        className="ha-masthead-icon-button"
      >
        <HelpCircle size={20} strokeWidth={2} />
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            className="ha-help-menu__scrim"
            aria-label="Close help menu"
            onClick={(): void => setIsOpen(false)}
          />
          <div className="ha-help-menu__popover">
            {[
              { icon: BookOpen, label: 'Documentation', action: 'docs' },
              { icon: Keyboard, label: 'Keyboard shortcuts', action: 'shortcuts' },
              { icon: FileText, label: 'Release notes', action: 'releases' },
              { icon: Mail, label: 'Support', action: 'support' },
            ].map((item) => (
              <button
                key={item.action}
                type="button"
                onClick={(): void => handleItemClick(item.action)}
              >
                <item.icon size={16} strokeWidth={2} />
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
