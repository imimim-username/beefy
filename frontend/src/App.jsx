import React, { useEffect, useRef, useState } from 'react';
import { WizardSteps } from './components/PixelBox.jsx';
import { HelpModal }    from './components/HelpModal.jsx';
import { Step1Network }  from './components/Step1Network.jsx';
import { Step2LP }       from './components/Step2LP.jsx';
import { Step3Staking }  from './components/Step3Staking.jsx';
import { Step4Rewards }  from './components/Step4Rewards.jsx';
import { Step5Routes }   from './components/Step5Routes.jsx';
import { Step6VaultName} from './components/Step6VaultName.jsx';
import { Step7Review }   from './components/Step7Review.jsx';
import { StepDeploy }    from './components/StepDeploy.jsx';

const STEP_LABELS = [
  'NETWORK',
  'LP TOKEN',
  'STAKING',
  'REWARDS',
  'ROUTES',
  'VAULT NAME',
  'REVIEW',
  'DEPLOY',
];

const INITIAL_FORM = {};

// Increment this when form schema changes incompatibly so stale saved state
// is discarded automatically rather than causing confusing errors.
const STORAGE_VERSION = 4;
const STORAGE_KEY = 'beefy_wizard_v' + STORAGE_VERSION;
const STORAGE_STEP_KEY = 'beefy_wizard_step_v' + STORAGE_VERSION;

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_FORM;
    return JSON.parse(raw);
  } catch {
    return INITIAL_FORM;
  }
}

function loadSavedStep() {
  try {
    const raw = localStorage.getItem(STORAGE_STEP_KEY);
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    return isNaN(n) ? 0 : Math.min(n, STEP_LABELS.length - 2); // don't restore to Deploy step
  } catch {
    return 0;
  }
}

export default function App() {
  const [step,  setStep]  = useState(() => loadSavedStep());
  const [form,  setForm]  = useState(() => loadSaved());
  const [showHelp, setShowHelp] = useState(false);

  // Close help on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setShowHelp(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Persist form + step to localStorage on every change.
  // Use a ref so the effect doesn't re-run on its own writes.
  const persistTimer = useRef(null);
  useEffect(() => {
    // Debounce slightly so rapid keystrokes don't thrash localStorage
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
        localStorage.setItem(STORAGE_STEP_KEY, String(step));
      } catch { /* storage full or private mode — ignore */ }
    }, 300);
  }, [form, step]);

  const next  = () => setStep(s => Math.min(s + 1, STEP_LABELS.length - 1));
  const back  = () => setStep(s => Math.max(s - 1, 0));
  const reset = () => {
    setForm(INITIAL_FORM);
    setStep(0);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_STEP_KEY);
    } catch {}
  };

  return (
    <div className="app-wrap">
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      {/* Header */}
      <div className="app-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="app-title">🐮 BEEFYFINAL</div>
          <div className="app-subtitle">BEEFY VAULT DEPLOYER</div>
        </div>
        <button
          onClick={() => setShowHelp(true)}
          title="Help &amp; Guide"
          style={{
            background: 'none',
            border: '2px solid var(--gold)',
            color: 'var(--gold)',
            fontFamily: 'var(--font)',
            fontSize: '9px',
            cursor: 'pointer',
            padding: '5px 9px',
            lineHeight: 1,
          }}
        >
          ❓
        </button>
      </div>

      {/* Step indicator */}
      <WizardSteps steps={STEP_LABELS} current={step} />

      {/* Restore banner — shown when a saved session is resumed */}
      {(step > 0 || Object.keys(form).length > 0) && (
        <div style={{
          fontSize: '6px',
          color: 'var(--border)',
          textAlign: 'right',
          padding: '2px 4px',
          marginBottom: '2px',
        }}>
          Session auto-saved ·{' '}
          <button
            onClick={reset}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--red)', fontSize: '6px', padding: 0,
            }}
          >
            ✕ clear &amp; restart
          </button>
        </div>
      )}

      {/* Step panels */}
      <div style={{ marginTop: '4px' }}>
        {step === 0 && (
          <Step1Network form={form} setForm={setForm} onNext={next} />
        )}
        {step === 1 && (
          <Step2LP form={form} setForm={setForm} onNext={next} onBack={back} />
        )}
        {step === 2 && (
          <Step3Staking form={form} setForm={setForm} onNext={next} onBack={back} />
        )}
        {step === 3 && (
          <Step4Rewards form={form} setForm={setForm} onNext={next} onBack={back} />
        )}
        {step === 4 && (
          <Step5Routes form={form} setForm={setForm} onNext={next} onBack={back} />
        )}
        {step === 5 && (
          <Step6VaultName form={form} setForm={setForm} onNext={next} onBack={back} />
        )}
        {step === 6 && (
          <Step7Review form={form} onDryRun={next} onBack={back} onJumpTo={setStep} />
        )}
        {step === 7 && (
          <StepDeploy form={form} onBack={back} onReset={reset} />
        )}
      </div>

      {/* Footer */}
      <div className="app-footer">
        <div>BEEFY VAULT DEPLOYER v1.0 — FOR EDUCATIONAL USE</div>
        <div style={{ marginTop: '6px' }}>
          Always verify Beefy addresses on{' '}
          <a href="https://github.com/beefyfinance/beefy-contracts" target="_blank" rel="noreferrer"
             style={{ color: 'var(--cyan)' }}>
            github.com/beefyfinance/beefy-contracts
          </a>
          {' '}before deploying on mainnet.
        </div>
      </div>
    </div>
  );
}
