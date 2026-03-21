import React, { useState } from 'react';
import { api } from '../api/client.js';
import { PixelBox, Spinner } from './PixelBox.jsx';
import { CHAINS_INFO } from '../chainInfo.js';

// Network shortname used in beefy-v2's src/config/vault/{network}.json
const NETWORK_SHORTNAME = {
  1: 'ethereum', 56: 'bsc', 137: 'polygon', 42161: 'arbitrum',
  10: 'optimism', 8453: 'base', 43114: 'avax', 250: 'fantom',
};

// Strategy type → Solidity file base name (for flatten command)
// Note: Aura vaults use the official StrategyBalancerV3 via StrategyFactory —
// no manual Etherscan verification is required (it auto-verifies as a proxy).
const STRAT_FILE = {
  aura:       null,  // factory clone — auto-verifies as proxy, no flatten needed
  chef:       'StrategyCommonChefLP',
  gauge:      'StrategyCommonGaugeLP',
  convex:     'StrategyCurveConvexLP',
  curvegauge: 'StrategyCommonCurveLP',
  stakedao:   'StrategyCommonCurveLP',
};

// Strategy type → beefy-v2 platformId
const PLATFORM_ID = {
  aura:       'aura',
  convex:     'convex',
  stakedao:   'stakedao',
  curvegauge: 'curve',
  chef:       'TODO-platform-id',
  gauge:      'TODO-platform-id',
};

// Strategy type → tokenProviderId (who issued the LP token)
const TOKEN_PROVIDER = {
  aura:       'balancer',
  convex:     'curve',
  curvegauge: 'curve',
  stakedao:   'curve',
  chef:       'TODO-provider-id',
  gauge:      'TODO-provider-id',
};

// ─── small helpers ────────────────────────────────────────────────────────────

function Code({ children }) {
  return (
    <code style={{
      display: 'block',
      background: 'rgba(0,0,0,0.45)',
      border: '1px solid var(--border)',
      padding: '6px 8px',
      margin: '5px 0',
      fontFamily: 'monospace',
      fontSize: '7px',
      color: 'var(--cyan)',
      whiteSpace: 'pre',
      overflowX: 'auto',
      lineHeight: 1.6,
    }}>{children}</code>
  );
}

function Inline({ children }) {
  return (
    <code style={{ color: 'var(--cyan)', fontFamily: 'monospace', fontSize: '7px' }}>
      {children}
    </code>
  );
}

function CheckStep({ num, title, children }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{
        color: 'var(--gold)',
        fontSize: '8px',
        fontWeight: 'bold',
        marginBottom: '7px',
        borderBottom: '1px solid var(--border)',
        paddingBottom: '4px',
      }}>
        [{num}] {title}
      </div>
      <div style={{ fontSize: '7px', color: '#ccc', lineHeight: '1.75' }}>
        {children}
      </div>
    </div>
  );
}

// ─── result table (shown after both dry-run and live deploy) ─────────────────

function ResultTable({ result }) {
  const chain = CHAINS_INFO[result.chainId];
  const explorer = chain?.blockExplorer || '';

  function explorerLink(addr, type = 'address') {
    if (!explorer || !addr) return null;
    return `${explorer}/${type}/${addr}`;
  }

  return (
    <div className="result-card pixel-box pixel-box--green">
      {[
        { key: 'Vault',     val: result.vaultAddress,    link: explorerLink(result.vaultAddress) },
        { key: 'Strategy',  val: result.strategyAddress, link: explorerLink(result.strategyAddress) },
        { key: 'Tx Hash',   val: result.txHash,          link: explorerLink(result.txHash, 'tx') },
        { key: 'Network',   val: result.network },
        { key: 'Deployer',  val: result.deployerAddress, link: explorerLink(result.deployerAddress) },
      ].map(({ key, val, link }) => (
        <div className="result-card__row" key={key}>
          <div className="result-card__key">{key}</div>
          <div className="result-card__value addr">
            {link ? (
              <a href={link} target="_blank" rel="noreferrer" style={{ color: 'var(--green)' }}>
                {val}
              </a>
            ) : val || '—'}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── post-deploy checklist ────────────────────────────────────────────────────

function PostDeployChecklist({ result, form }) {
  const chain          = CHAINS_INFO[form.chainId] || {};
  const explorer       = chain.blockExplorer || '';
  const network        = NETWORK_SHORTNAME[form.chainId] || 'TODO-network';
  const stratOwner     = chain.beefyAddresses?.strategyOwner || 'TODO-multisig';
  const isAura         = form.strategyType === 'aura';
  const stratFile      = STRAT_FILE[form.strategyType]      || 'StrategyTODO';
  const flatFile       = stratFile ? `solPatch/${stratFile}_flat.sol` : null;
  const contractFile   = stratFile ? `contracts/strategies/${stratFile}.sol` : null;
  const platformId     = PLATFORM_ID[form.strategyType]     || 'TODO-platform-id';
  const tokenProvider  = TOKEN_PROVIDER[form.strategyType]  || 'TODO-provider-id';

  const vaultJson = JSON.stringify({
    id:                  `TODO-${network}-pool-name`,
    name:                'TODO: e.g. "80ALCX/20WETH V3"',
    type:                'standard',
    token:               'TODO: same as name',
    tokenAddress:         form.want,
    tokenDecimals:        18,
    tokenProviderId:      tokenProvider,
    earnContractAddress:  result.vaultAddress,
    earnedToken:          form.vaultSymbol,
    earnedTokenAddress:   result.vaultAddress,
    oracle:              'lps',
    oracleId:            `TODO-${network}-pool-name`,
    status:              'active',
    createdAt:            Math.floor(Date.now() / 1000),
    platformId,
    assets:              ['TODO_TOKEN0', 'TODO_TOKEN1'],
    risks: {
      complex:          false,
      curated:          false,
      notAudited:       false,
      notBattleTested:  true,
      notCorrelated:    true,
      notTimelocked:    false,
      notVerified:      false,
      synthAsset:       false,
    },
    strategyTypeId:      'lp',
    addLiquidityUrl:     'TODO: pool add-liquidity page URL',
    network,
  }, null, 2);

  return (
    <PixelBox variant="cyan" style={{ padding: '16px', marginTop: '24px' }}>
      <div style={{ color: 'var(--cyan)', fontSize: '9px', marginBottom: '16px' }}>
        ▶ NEXT STEPS — COMPLETE ALL FOUR BEFORE SUBMITTING TO BEEFY
      </div>

      {/* ── Step 1: Etherscan verification ─────────────────────────────── */}
      {isAura ? (
        <CheckStep num="1" title="VERIFY STRATEGY ON ETHERSCAN (AUTO)">
          <p>
            Because the strategy was created by Beefy's <Inline>StrategyFactory</Inline>,
            it is a <strong style={{ color: 'var(--gold)' }}>beacon proxy</strong> pointing to
            Beefy's audited <Inline>StrategyBalancerV3</Inline> implementation. Etherscan
            auto-detects this and shows{' '}
            <strong style={{ color: 'var(--gold)' }}>"Read as Proxy" / "Write as Proxy"</strong>{' '}
            — no manual source submission is needed.
          </p>
          {explorer ? (
            <a
              href={`${explorer}/address/${result.strategyAddress}#code`}
              target="_blank" rel="noreferrer"
              style={{ color: 'var(--green)', display: 'block', margin: '6px 0' }}
            >
              → {explorer}/address/{result.strategyAddress}#code
            </a>
          ) : (
            <Code>{`{blockExplorer}/address/${result.strategyAddress}#code`}</Code>
          )}
          <p style={{ color: '#aaa', marginTop: '4px' }}>
            ℹ If the proxy implementation link does not appear immediately, wait a few minutes
            for Etherscan to process the contract. If it still shows "Contract Source Code Not
            Verified", you can manually submit the proxy verification request through Etherscan's
            proxy detection form — but this is usually automatic.
          </p>
        </CheckStep>
      ) : (
        <CheckStep num="1" title="VERIFY STRATEGY ON ETHERSCAN">
          <p style={{ marginBottom: '4px' }}>
            Generate a flattened single-file contract and submit it to Etherscan for source verification.
            Run this from the project root:
          </p>
          <Code>{`npx hardhat flatten ${contractFile} > ${flatFile}`}</Code>
          <p style={{ marginBottom: '4px' }}>
            Then open the strategy contract on the block explorer:
          </p>
          {explorer ? (
            <a
              href={`${explorer}/address/${result.strategyAddress}#code`}
              target="_blank" rel="noreferrer"
              style={{ color: 'var(--green)', display: 'block', marginBottom: '4px' }}
            >
              → {explorer}/address/{result.strategyAddress}#code
            </a>
          ) : (
            <Code>{`{blockExplorer}/address/${result.strategyAddress}#code`}</Code>
          )}
          <p>
            Click <strong style={{ color: 'var(--gold)' }}>"Verify and Publish"</strong> → choose{' '}
            <strong style={{ color: 'var(--gold)' }}>Solidity (Single file)</strong>, then set:
          </p>
          <Code>{`Compiler version : v0.8.28+...
EVM version      : paris         ← CRITICAL — bytecode will not match if wrong
Optimization     : Yes, 200 runs
License          : MIT (3)`}</Code>
          <p>
            Paste the full contents of <Inline>{flatFile}</Inline> into the source code field.
            Leave <strong>Constructor Arguments</strong> blank — the strategy uses{' '}
            <Inline>initialize()</Inline>, not a constructor.
          </p>
          <p style={{ color: '#aaa', marginTop: '6px' }}>
            ℹ If Etherscan shows a bytecode mismatch, double-check the EVM version is set to{' '}
            <Inline>paris</Inline> (not the default Shanghai/Cancun). The PUSH0 opcode difference
            causes an exact byte-for-byte mismatch.
          </p>
        </CheckStep>
      )}

      {/* ── Step 2: Test deposit ────────────────────────────────────────── */}
      <CheckStep num="2" title="MAKE A SMALL TEST DEPOSIT INTO THE VAULT">
        <p>
          Beefy requires at least one real deposit to prove the vault accepts funds correctly.
          Open the vault on the block explorer:
        </p>
        {explorer ? (
          <a
            href={`${explorer}/address/${result.vaultAddress}#writeContract`}
            target="_blank" rel="noreferrer"
            style={{ color: 'var(--green)', display: 'block', margin: '4px 0' }}
          >
            → {explorer}/address/{result.vaultAddress}#writeContract
          </a>
        ) : (
          <Code>{`{blockExplorer}/address/${result.vaultAddress}#writeContract`}</Code>
        )}
        <p>
          Connect your wallet, approve the LP token, then call{' '}
          <Inline>deposit(amount)</Inline> with a small amount (a few dollars worth is enough).
        </p>
        <p style={{ color: '#f99', marginTop: '6px' }}>
          ⚠ If the deposit reverts, stop — the strategy has a bug. Use Tenderly to trace the
          revert and fix it before proceeding. Common cause: <Inline>beforeDeposit()</Inline>{' '}
          missing from the strategy (required by Beefy's vault factory).
        </p>
      </CheckStep>

      {/* ── Step 3: Transfer ownership ──────────────────────────────────── */}
      <CheckStep num="3" title="TRANSFER STRATEGY OWNERSHIP TO BEEFY'S MULTISIG">
        <p>
          Beefy's CI validator checks that strategy ownership has been transferred from your
          deployer to their strategist multisig. The PR will fail until this is done.
        </p>
        {explorer ? (
          <a
            href={`${explorer}/address/${result.strategyAddress}#writeContract`}
            target="_blank" rel="noreferrer"
            style={{ color: 'var(--green)', display: 'block', margin: '4px 0' }}
          >
            → {explorer}/address/{result.strategyAddress}#writeContract
          </a>
        ) : (
          <Code>{`{blockExplorer}/address/${result.strategyAddress}#writeContract`}</Code>
        )}
        <p>
          Connect your deployer wallet and call{' '}
          <Inline>transferOwnership(newOwner)</Inline> with:
        </p>
        <Code>{`newOwner: ${stratOwner}`}</Code>
        <p style={{ color: '#f99', marginTop: '4px' }}>
          ⚠ Do this AFTER verifying the vault works — once transferred you cannot call
          admin functions (e.g. panic, unpause) from your own wallet.
        </p>
        <p style={{ color: '#aaa', marginTop: '4px' }}>
          ℹ If the Netlify CI build fails with "should update strat owner", this is the fix.
        </p>
      </CheckStep>

      {/* ── Step 4: Submit PR ───────────────────────────────────────────── */}
      <CheckStep num="4" title="SUBMIT A LISTING PR TO BEEFY-V2">
        <p>
          Fork{' '}
          <a
            href="https://github.com/beefyfinance/beefy-v2"
            target="_blank" rel="noreferrer"
            style={{ color: 'var(--green)' }}
          >
            github.com/beefyfinance/beefy-v2
          </a>{' '}
          and add your vault entry to the <strong style={{ color: 'var(--gold)' }}>top</strong>{' '}
          of the array in{' '}
          <Inline>src/config/vault/{network}.json</Inline>.
        </p>
        <p style={{ marginTop: '6px', marginBottom: '4px' }}>
          The template below has several fields pre-filled. Replace every{' '}
          <span style={{ color: '#f88' }}>TODO</span> value:
        </p>
        <Code>{vaultJson}</Code>
        <p style={{ marginTop: '6px', marginBottom: '4px' }}>
          Fields to fill in manually:
        </p>
        <ul style={{ marginLeft: '14px', lineHeight: '2' }}>
          <li>
            <Inline>id</Inline> / <Inline>oracleId</Inline> — lowercase kebab-case, e.g.{' '}
            <Inline>balancerv3-ethereum-80alcx-20weth</Inline>
          </li>
          <li>
            <Inline>name</Inline> / <Inline>token</Inline> — human-readable pool name, e.g.{' '}
            <Inline>80ALCX/20WETH V3</Inline>
          </li>
          <li>
            <Inline>assets</Inline> — symbol array, e.g. <Inline>["ALCX", "WETH"]</Inline>
          </li>
          <li>
            <Inline>addLiquidityUrl</Inline> — the pool's add-liquidity page on its DEX UI
          </li>
          <li>
            <Inline>notCorrelated</Inline> — <Inline>true</Inline> if assets are unpegged
            (e.g. ALCX/WETH); <Inline>false</Inline> if pegged (e.g. USDC/USDT)
          </li>
          <li>
            <Inline>tokenDecimals</Inline> — almost always 18, but check on-chain if unsure
          </li>
        </ul>
        <p style={{ marginTop: '8px' }}>
          PR title convention:{' '}
          <Inline>feat({network}): add [Pool Name] via [Platform]</Inline>
        </p>
        <p style={{ color: '#aaa', marginTop: '6px' }}>
          ℹ Beefy's Netlify CI runs a validator on every PR. If it fails, the error message
          will tell you exactly which field is wrong. Common failures:{' '}
          <Inline>should update strat owner</Inline> (→ Step 3 above) or a missing/invalid
          field in the JSON entry.
        </p>
        <p style={{ color: '#aaa', marginTop: '4px' }}>
          ℹ Dry-run deployments (fork mode) are isolated to a temporary Hardhat fork and are
          discarded after the run completes — they do not create real contracts or use real funds.
        </p>
      </CheckStep>

      {/* ── Step 5: beefy-api PR ────────────────────────────────────────── */}
      <CheckStep num="5" title="SUBMIT A SECOND PR TO BEEFY-API">
        <p>
          The beefy-v2 UI PR (Step 4) is only for the frontend. Beefy's oracle/pricing system
          also requires a PR to{' '}
          <a
            href="https://github.com/beefyfinance/beefy-api"
            target="_blank" rel="noreferrer"
            style={{ color: 'var(--green)' }}
          >
            github.com/beefyfinance/beefy-api
          </a>
          {' '}before the vault can go live in production.
        </p>
        <p style={{ marginTop: '6px' }}>
          The beefy-api PR adds oracle pricing config so Beefy knows how to value the LP token.
          Look at the most recently merged Balancer vault entry in{' '}
          <Inline>packages/address-book/src/address-book/{network}/</Inline>{' '}
          and model your entry on it.
        </p>
        <p style={{ marginTop: '6px', color: '#f99' }}>
          ⚠ Without the beefy-api PR, the vault will show $0 TVL and be non-functional in the
          UI even after the beefy-v2 PR is merged.
        </p>
        <p style={{ marginTop: '6px', color: '#aaa' }}>
          ℹ The Beefy team may help with this PR if you ask nicely in their Discord — especially
          for Balancer V3 pools where the pricing setup is non-trivial.
        </p>
      </CheckStep>
    </PixelBox>
  );
}

// ─── main deploy step ─────────────────────────────────────────────────────────

export function StepDeploy({ form, dryResult, onBack, onReset }) {
  const [phase,   setPhase]   = useState(dryResult ? 'dry_done' : 'idle');
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(dryResult || null);
  const [error,   setError]   = useState('');

  function buildPayload(isDryRun) {
    const chain = CHAINS_INFO[form.chainId];
    return {
      chainId:      form.chainId,
      strategyType: form.strategyType,
      want:         form.want,
      staking:      form.staking,
      poolId:       form.poolId,
      rewardTokens: (form.rewardTokens || []).map(t => t.address),
      rewardTokenMeta: form.rewardTokens || [],
      outputToNativeRoute: form.routes?.outputToNativeRoute,
      outputToLp0Route:    form.routes?.outputToLp0Route,
      outputToLp1Route:    form.routes?.outputToLp1Route,
      outputToCoinRoute:   form.routes?.outputToCoinRoute,
      vaultName:    form.vaultName,
      vaultSymbol:  form.vaultSymbol,
      unirouter:    form.unirouter,
      strategist:   form.strategist,
      isStable:     form.isStable,
      pendingRewardsFunctionName: form.pendingRewardsFunctionName,
      // Convex / CurveGauge / StakeDAO
      curvePool:    form.curvePool,
      coinIndex:    form.coinIndex,
      nCoins:       form.nCoins,
      // CurveGauge
      minterEnabled: form.minterEnabled,
      minter:        form.minter,
      // Aura: depositToken replaces manual swap routes
      depositToken:     form.depositToken,
      harvestOnDeposit: form.harvestOnDeposit ?? false,
      beefyAddresses: chain?.beefyAddresses,
    };
  }

  async function runDryRun() {
    setLoading(true); setError(''); setPhase('dry_running');
    const res = await api.dryRun(buildPayload(true)).catch(e => ({ ok: false, error: e.message }));
    setLoading(false);
    if (!res.ok) { setError(res.error || 'Dry-run failed'); setPhase('idle'); return; }
    setResult(res.result);
    setPhase('dry_done');
  }

  async function runExecute() {
    setLoading(true); setError(''); setPhase('executing');
    const res = await api.execute(buildPayload(false)).catch(e => ({ ok: false, error: e.message }));
    setLoading(false);
    if (!res.ok) { setError(res.error || 'Deploy failed'); setPhase('dry_done'); return; }
    setResult(res.result);
    setPhase('live_done');
  }

  return (
    <PixelBox variant="cyan" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ color: 'var(--cyan)', fontSize: '11px', marginBottom: '8px' }}>
          {phase === 'live_done' ? '🎉 DEPLOY COMPLETE!' : '▶ DEPLOY'}
        </div>
      </div>

      {/* Phase: idle / start dry-run */}
      {phase === 'idle' && (
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn" onClick={onBack}>◀ BACK</button>
          <button className="btn btn--gold" onClick={runDryRun}>🧪 START DRY-RUN</button>
        </div>
      )}

      {/* Phase: running dry-run */}
      {phase === 'dry_running' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--cyan)' }}>
            <Spinner /> Forking chain and deploying…
          </div>
          <div style={{ fontSize: '7px', color: 'var(--border)' }}>
            This may take 30–90 seconds while Hardhat downloads state from the RPC.
          </div>
        </div>
      )}

      {/* Phase: dry-run done */}
      {phase === 'dry_done' && result && (
        <div>
          <PixelBox variant="green" style={{ padding: '12px', marginBottom: '16px' }}>
            <div style={{ fontSize: '8px', color: 'var(--green)' }}>
              ✓ DRY-RUN SUCCEEDED on forked chain
            </div>
            <div style={{ fontSize: '7px', color: '#aaa', marginTop: '4px' }}>
              The fork is temporary — no real contracts or funds were used.
            </div>
          </PixelBox>
          <ResultTable result={result} />
          <div style={{ marginTop: '16px' }}>
            <PixelBox variant="red" style={{ padding: '12px', marginBottom: '12px' }}>
              <div style={{ fontSize: '7px', color: 'var(--red)' }}>
                ⚠ LIVE DEPLOY: This will broadcast real transactions on {CHAINS_INFO[form.chainId]?.name}.<br />
                Ensure your DEPLOYER_PK has enough {CHAINS_INFO[form.chainId]?.nativeSymbol} for gas.
              </div>
            </PixelBox>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn" onClick={onBack}>◀ BACK</button>
              <button className="btn btn--red" onClick={runExecute}>
                🚀 DEPLOY FOR REAL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase: live deploying */}
      {phase === 'executing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--gold)' }}>
            <Spinner /> Broadcasting to {CHAINS_INFO[form.chainId]?.name}…
          </div>
          <div style={{ fontSize: '7px', color: 'var(--border)' }}>
            Waiting for transaction confirmations. Do not close this window.
          </div>
        </div>
      )}

      {/* Phase: live done */}
      {phase === 'live_done' && result && (
        <div>
          <PixelBox variant="green" style={{ padding: '12px', marginBottom: '16px' }}>
            <div style={{ fontSize: '9px', color: 'var(--green)' }}>
              🎉 VAULT DEPLOYED SUCCESSFULLY!
            </div>
          </PixelBox>
          <ResultTable result={{ ...result, dryRun: false }} />

          {/* ── Post-deploy checklist ───────────────────────────────────── */}
          <PostDeployChecklist result={result} form={form} />

          <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
            <button className="btn btn--green" onClick={onReset}>
              + DEPLOY ANOTHER VAULT
            </button>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <PixelBox variant="red" style={{ padding: '12px', marginTop: '12px' }}>
          <div style={{ fontSize: '7px', color: 'var(--red)' }}>
            ✗ {error}
          </div>
          <div style={{ marginTop: '8px' }}>
            <button className="btn btn--sm" onClick={() => { setError(''); setPhase('idle'); }}>
              DISMISS
            </button>
          </div>
        </PixelBox>
      )}
    </PixelBox>
  );
}
