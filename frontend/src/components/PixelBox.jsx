import React from 'react';

export function PixelBox({ children, variant = '', className = '', style = {} }) {
  return (
    <div
      className={`pixel-box ${variant ? `pixel-box--${variant}` : ''} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

export function Field({ label, hint, hintType = '', children }) {
  return (
    <div className="field">
      {label && <label className="pixel-label">{label}</label>}
      {children}
      {hint && <span className={`hint ${hintType}`}>{hint}</span>}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" />;
}

export function WizardSteps({ steps, current }) {
  return (
    <div className="wizard-steps">
      {steps.map((s, i) => (
        <div
          key={i}
          className={`wizard-step ${i === current ? 'active' : ''} ${i < current ? 'done' : ''}`}
        >
          {i < current ? '✓ ' : `${i + 1}. `}{s}
        </div>
      ))}
    </div>
  );
}

export function RouteDisplay({ route, tokens = {} }) {
  if (!route || route.length === 0) return <span className="hint">—</span>;
  return (
    <span style={{ fontSize: '7px', wordBreak: 'break-all' }}>
      {route.map((addr, i) => (
        <React.Fragment key={addr}>
          {i > 0 && <span className="route-arrow">→</span>}
          <span className="tag--cyan" title={addr}>
            {tokens[addr.toLowerCase()]?.symbol || addr.slice(0, 8) + '…'}
          </span>
        </React.Fragment>
      ))}
    </span>
  );
}
