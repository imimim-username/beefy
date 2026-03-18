import React, { useState } from 'react';
import { WizardSteps } from './components/PixelBox.jsx';
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

export default function App() {
  const [step,  setStep]  = useState(0);
  const [form,  setForm]  = useState(INITIAL_FORM);

  const next = () => setStep(s => Math.min(s + 1, STEP_LABELS.length - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));
  const reset = () => { setForm(INITIAL_FORM); setStep(0); };

  return (
    <div className="app-wrap">
      {/* Header */}
      <div className="app-header">
        <div className="app-title">🐮 BEEFYFINAL</div>
        <div className="app-subtitle">BEEFY VAULT DEPLOYER</div>
      </div>

      {/* Step indicator */}
      <WizardSteps steps={STEP_LABELS} current={step} />

      {/* Step panels */}
      <div style={{ marginTop: '8px' }}>
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
          <Step7Review form={form} onDryRun={next} onBack={back} />
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
