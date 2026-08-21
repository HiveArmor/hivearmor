/**
 * TextRenderer — Markdown/text block renderer for dashboard widgets
 * Session S33 — Dashboard Studio widget renderers (§8, DSH-03)
 */

import type React from 'react';

export interface TextRendererProps {
  config: TextWidgetConfig;
}

export interface TextWidgetConfig {
  content: string;
  fontSize: 'small' | 'medium' | 'large';
}

export function TextRenderer({ config }: TextRendererProps): React.JSX.Element {
  const fontSizeMap = {
    small: 'var(--ha-text-sm)',
    medium: 'var(--ha-text-base)',
    large: 'var(--ha-text-md)',
  };

  // Basic markdown-to-HTML rendering (simplified)
  // Full markdown parsing would require a library like react-markdown
  // For now, support basic formatting only
  const renderContent = (content: string): React.JSX.Element => {
    const lines = content.split('\n');

    return (
      <div style={{ fontSize: fontSizeMap[config.fontSize], color: 'var(--ha-text-primary)', lineHeight: 1.6 }}>
        {lines.map((line, index) => {
          // Heading
          if (line.startsWith('# ')) {
            return (
              <h1
                key={index}
                style={{
                  fontSize: 'var(--ha-text-xl)',
                  fontWeight: 'var(--ha-weight-semibold)',
                  marginBottom: '8px',
                  color: 'var(--ha-text-primary)',
                }}
              >
                {line.slice(2)}
              </h1>
            );
          }
          if (line.startsWith('## ')) {
            return (
              <h2
                key={index}
                style={{
                  fontSize: 'var(--ha-text-lg)',
                  fontWeight: 'var(--ha-weight-medium)',
                  marginBottom: '6px',
                  color: 'var(--ha-text-primary)',
                }}
              >
                {line.slice(3)}
              </h2>
            );
          }

          // List item
          if (line.startsWith('- ') || line.startsWith('* ')) {
            return (
              <li key={index} style={{ marginLeft: '20px', marginBottom: '4px' }}>
                {line.slice(2)}
              </li>
            );
          }

          // Empty line
          if (line.trim() === '') {
            return <br key={index} />;
          }

          // Regular paragraph
          return (
            <p key={index} style={{ marginBottom: '8px' }}>
              {renderInlineFormatting(line)}
            </p>
          );
        })}
      </div>
    );
  };

  // Render inline formatting (bold, italic, code)
  const renderInlineFormatting = (text: string): (string | React.JSX.Element)[] | string => {
    const parts: (string | React.JSX.Element)[] = [];
    let current = '';
    let i = 0;

    while (i < text.length) {
      // Bold **text**
      if (text[i] === '*' && text[i + 1] === '*') {
        if (current) parts.push(current);
        current = '';
        i += 2;
        let boldText = '';
        while (i < text.length && !(text[i] === '*' && text[i + 1] === '*')) {
          boldText += text[i];
          i++;
        }
        parts.push(
          <strong key={parts.length} style={{ fontWeight: 'var(--ha-weight-semibold)' }}>
            {boldText}
          </strong>
        );
        i += 2;
        continue;
      }

      // Code `text`
      if (text[i] === '`') {
        if (current) parts.push(current);
        current = '';
        i++;
        let codeText = '';
        while (i < text.length && text[i] !== '`') {
          codeText += text[i];
          i++;
        }
        parts.push(
          <code
            key={parts.length}
            style={{
              fontFamily: 'var(--ha-font-mono)',
              fontSize: '0.9em',
              backgroundColor: 'var(--ha-surface-raised)',
              padding: '2px 4px',
              borderRadius: '2px',
              color: 'var(--ha-primary)',
            }}
          >
            {codeText}
          </code>
        );
        i++;
        continue;
      }

      current += text[i];
      i++;
    }

    if (current) parts.push(current);
    return parts.length > 0 ? parts : text;
  };

  return (
    <div
      style={{
        padding: '12px',
        height: '100%',
        overflow: 'auto',
      }}
    >
      {renderContent(config.content)}
    </div>
  );
}
