import React, { useState } from 'react';
import { api } from '../api/client.js';
import { PixelBox, Spinner } from './PixelBox.jsx';
import { CHAINS_INFO } from '../chainInfo.js';

// Network shortname used in beefy-v2's src/config/vault/{network}.json
const NETWORK_SHORTNAME = {
  1: 'ethereum', 56: 'bsc', 137: 'polygon', 42161: 'arbitrum',
  10: 'optimism', 8453: 'base', 43114: 'avax', 250: 'fantom',
};

// Strategy type → Solidity file base name (for flatten command).
// Factory strategies (aura, gauge, convex, curvegauge, stakedao) are beacon proxies
// cloned from StrategyFactory — Etherscan auto-detects and verifies them as proxies.
// No manual source submission is needed; null signals "auto-verify as proxy".
const STRAT_FILE = {
  aura:       null,  // StrategyBalancerV3 via StrategyFactory — auto-verifies as proxy
  gauge:      null,  // StrategyVelodrome via StrategyFactory — auto-verifies as proxy
  convex:     null,  // StrategyCurveConvexFactory via StrategyFactory — auto-verifies as proxy
  curvegauge: null,  // StrategyCurveConvexFactory (pure Curve) via StrategyFactory — auto-verifies
  stakedao:   null,  // StrategyStakeDaoV2 via StrategyFactory — auto-verifies as proxy
  chef:       'StrategyCommonChefLP',  // custom contract — manual verification required
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

// Chain-specific Solidly/Gauge DEX for addLiquidityUrl and platformId
const GAUGE_DEX_BY_CHAIN = {
  10:   { platform: 'velodrome', provider: 'velodrome', liqUrl: (lp) => `https://velodrome.finance/liquidity/manage?address=${lp}` },
  8453: { platform: 'aerodrome', provider: 'aerodrome', liqUrl: (lp) => `https://aerodrome.finance/liquidity/manage?address=${lp}` },
};

// Chain-specific Chef DEX hints (just for display — user must verify)
const CHEF_DEX_BY_CHAIN = {
  56:    { platform: 'pancakeswap', provider: 'pancakeswap' },
  137:   { platform: 'quickswap',   provider: 'quickswap'   },
  42161: { platform: 'sushiswap',   provider: 'sushiswap'   },
  10:    { platform: 'velodrome',   provider: 'velodrome'   },
};

// Beefy vault JSON id prefix by strategy type (for auto-ID generation)
const ID_PREFIX = {
  aura:       'balancerv3',
  convex:     'convex',
  curvegauge: 'curve',
  stakedao:   'stakedao',
  // gauge and chef: resolved dynamically from chain
};

// Build a copy-to-clipboard helper (no external deps)
function useCopyToClipboard() {
  const [copied, setCopied] = React.useState(false);
  function copy(text) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }
  return [copied, copy];
}

// ─── actionable error parser ──────────────────────────────────────────────────
// Maps common deploy revert reasons to human-readable guidance + the wizard step to fix it.
const ERROR_HINTS = [
  {
    patterns: [/ProxyCreated event not found/i, /strategy address/i],
    hint: 'The StrategyFactory transaction succeeded but the proxy address could not be read. This is usually an RPC issue — try again.',
    step: null,
  },
  {
    patterns: [/wrong lp/i, /lp token/i, /lptoken mismatch/i, /stakingToken/i],
    hint: 'The staking contract LP token does not match the LP you entered in Step 2. Go back to Step 3 and verify the staking address and pool ID.',
    step: 2,
  },
  {
    patterns: [/invalid pool/i, /pool not found/i, /poolInfo/i],
    hint: 'The pool ID does not exist in this staking contract. Go back to Step 3 and check the pool ID.',
    step: 2,
  },
  {
    patterns: [/DEPLOYER_PK/i, /private key/i, /signer/i],
    hint: 'No deployer private key configured. Set DEPLOYER_PK in your .env file and restart the backend.',
    step: null,
  },
  {
    patterns: [/insufficient funds/i, /gas/i],
    hint: 'Deployer wallet has insufficient funds for gas. Top up your deployer wallet and try again.',
    step: null,
  },
  {
    patterns: [/nonce/i, /replacement fee too low/i],
    hint: 'Transaction nonce conflict. Wait a moment and try again, or reset the nonce in your wallet.',
    step: null,
  },
  {
    // PriceFailed is thrown by BeefySwapper when getFreshPrice(token) fails because
    // the token has no sub-oracle registered in BeefyOracle.  For Convex/CurveGauge
    // strategies this almost always means the LP (want) token is not in BeefyOracle.
    patterns: [/PriceFailed/i, /getFreshPrice/i, /price.*failed/i, /oracle.*lp/i, /lp.*oracle/i],
    hint: 'BeefyOracle has no price feed for the LP token. StrategyCurveConvexFactory needs getFreshPrice(lpToken) to compute slippage when swapping depositToken → LP. Ask the Beefy team to register a Curve virtual-price oracle for this LP token and a BeefySwapper add_liquidity route. As a workaround, use the StakeDAO strategy type — it handles LP conversion internally without needing an LP oracle.',
    step: null,
  },
  {
    patterns: [/route/i, /swap/i, /BeefySwapper/i, /NoSwapData/i],
    hint: 'A swap route is not configured in BeefySwapper. Go back to Step 5 and choose a deposit token with a registered route, or ask the Beefy team to add the route.',
    step: 4,
  },
  {
    patterns: [/coin/i, /coinIndex/i, /nCoins/i],
    hint: 'Curve coin index or pool coin count is wrong. Go back to Step 3 and verify the coin index and nCoins values.',
    step: 2,
  },
  {
    patterns: [/harvest/i, /compound/i],
    hint: 'The harvest simulation failed. Check your reward token and route configuration in Steps 4 and 5.',
    step: 3,
  },
  {
    patterns: [/vault factory/i, /strategyFactory/i, /factory/i],
    hint: 'StrategyFactory contract call failed. This chain may not support this strategy type, or the factory address is wrong.',
    step: null,
  },
];

function parseDeployError(errorMsg) {
  if (!errorMsg) return null;
  for (const { patterns, hint, step } of ERROR_HINTS) {
    if (patterns.some(p => p.test(errorMsg))) {
      return { hint, step };
    }
  }
  return null;
}

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
  const [jsonCopied, copyJson] = useCopyToClipboard();

  const chain          = CHAINS_INFO[form.chainId] || {};
  const explorer       = chain.blockExplorer || '';
  const network        = NETWORK_SHORTNAME[form.chainId] || 'TODO-network';
  const stratOwner     = chain.beefyAddresses?.strategyOwner || 'TODO-multisig';
  const isAura         = form.strategyType === 'aura';
  const stratFile      = STRAT_FILE[form.strategyType] ?? null;
  const isFactoryProxy = stratFile === null; // all factory strategies auto-verify as proxy
  const flatFile       = stratFile ? `solPatch/${stratFile}_flat.sol` : null;
  const contractFile   = stratFile ? `contracts/strategies/${stratFile}.sol` : null;

  // ── Auto-compute vault JSON fields ──────────────────────────────────────────
  const lp      = form.lpInfo || {};
  const tokSyms = [lp.token0?.symbol, lp.token1?.symbol, lp.token2?.symbol].filter(Boolean);
  const assets  = tokSyms.length > 0 ? tokSyms : ['TODO_TOKEN0', 'TODO_TOKEN1'];

  // Pool slug for id/oracleId: lowercased token symbols joined with dash
  const poolSlug = tokSyms.map(s => s.toLowerCase()).join('-') || 'pool-name';

  // Platform-specific id prefix
  const gaugeDex  = GAUGE_DEX_BY_CHAIN[form.chainId];
  const chefDex   = CHEF_DEX_BY_CHAIN[form.chainId];
  const idPrefixRaw = form.strategyType === 'gauge'
    ? (gaugeDex?.platform || 'TODO-platform')
    : form.strategyType === 'chef'
    ? (chefDex?.platform || 'TODO-platform')
    : (ID_PREFIX[form.strategyType] || 'TODO-platform');
  const autoId   = `${idPrefixRaw}-${network}-${poolSlug}`;

  // Pool display name: from LP symbol if available, else token0-token1
  const poolName  = lp.lpSymbol || tokSyms.join('-') || 'TODO Pool Name';

  // platformId and tokenProviderId
  const platformId    = form.strategyType === 'gauge'
    ? (gaugeDex?.platform    || PLATFORM_ID[form.strategyType]    || 'TODO-platform-id')
    : form.strategyType === 'chef'
    ? (chefDex?.platform     || PLATFORM_ID[form.strategyType]    || 'TODO-platform-id')
    : (PLATFORM_ID[form.strategyType]    || 'TODO-platform-id');
  const tokenProvider = form.strategyType === 'gauge'
    ? (gaugeDex?.provider    || TOKEN_PROVIDER[form.strategyType] || 'TODO-provider-id')
    : form.strategyType === 'chef'
    ? (chefDex?.provider     || TOKEN_PROVIDER[form.strategyType] || 'TODO-provider-id')
    : (TOKEN_PROVIDER[form.strategyType] || 'TODO-provider-id');

  // notCorrelated: false for stable/pegged pairs, true for volatile pairs
  const notCorrelated = lp.isStable === true ? false : true;

  const createdAt = result.blockTimestamp || Math.floor(Date.now() / 1000);

  // addLiquidityUrl: best-effort from known DEX patterns
  let addLiqUrl;
  if (isAura) {
    addLiqUrl = `https://balancer.fi/pools/${network}/v3/${(form.want || '').toLowerCase()}/add-liquidity`;
  } else if (form.strategyType === 'convex' || form.strategyType === 'curvegauge' || form.strategyType === 'stakedao') {
    // Use the Curve pool address if available for a more specific link
    const poolAddr = form.curvePool || form.staking;
    addLiqUrl = poolAddr
      ? `https://curve.fi/#/${network}/pools/${poolAddr.toLowerCase()}/deposit`
      : `https://curve.fi/#/${network}/pools/TODO-pool-slug/deposit`;
  } else if (form.strategyType === 'gauge' && gaugeDex) {
    addLiqUrl = gaugeDex.liqUrl(form.want || '');
  } else {
    addLiqUrl = 'TODO: pool add-liquidity page URL';
  }

  // strategyTypeId: 'multi-lp' for multi-token pools (Aura/Convex/Curve), 'lp' for standard pairs
  const strategyTypeId = (isAura || form.strategyType === 'convex' || form.strategyType === 'curvegauge' || form.strategyType === 'stakedao')
    ? 'multi-lp' : 'lp';

  const vaultJson = JSON.stringify({
    id:                  autoId,
    name:                poolName,
    type:                'standard',
    token:               poolName,
    tokenAddress:         form.want,
    tokenDecimals:        18,
    tokenProviderId:      tokenProvider,
    earnContractAddress:  result.vaultAddress,
    earnedToken:          form.vaultSymbol,
    earnedTokenAddress:   result.vaultAddress,
    oracle:              'lps',
    oracleId:            autoId,
    status:              'active',
    createdAt,
    platformId,
    assets,
    risks: {
      complex:          false,
      curated:          false,
      notAudited:       false,
      notBattleTested:  true,   // always true for new vaults — Beefy team updates after review
      notCorrelated,
      notTimelocked:    false,
      notVerified:      false,
      synthAsset:       false,
    },
    strategyTypeId,
    addLiquidityUrl:     addLiqUrl,
    network,
  }, null, 2);

  return (
    <PixelBox variant="cyan" style={{ padding: '16px', marginTop: '24px' }}>
      <div style={{ color: 'var(--cyan)', fontSize: '9px', marginBottom: '16px' }}>
        ▶ NEXT STEPS — COMPLETE ALL FIVE BEFORE VAULT GOES LIVE
      </div>

      {/* ── Step 1: Etherscan verification ─────────────────────────────── */}
      {isFactoryProxy ? (
        <CheckStep num="1" title="VERIFY STRATEGY ON ETHERSCAN (AUTO)">
          <p>
            Because the strategy was created by Beefy's <Inline>StrategyFactory</Inline>,
            it is a <strong style={{ color: 'var(--gold)' }}>beacon proxy</strong> pointing to
            Beefy's audited implementation. Etherscan auto-detects this and shows{' '}
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
      <CheckStep num="2" title="TEST THE VAULT THOROUGHLY (BEFORE OWNERSHIP TRANSFER)">
        <p>
          Beefy requires proper testing before you transfer ownership — after transfer, any
          fixes require timelocked multisig transactions, which are slow and costly. Follow
          Beefy's full testing procedure:
        </p>
        <a
          href="https://docs.beefy.finance/safety/beefy-safu-practices#vault-testing-procedure"
          target="_blank" rel="noreferrer"
          style={{ color: 'var(--green)', display: 'block', margin: '6px 0' }}
        >
          → docs.beefy.finance — Vault Testing Procedure
        </a>
        <p style={{ marginTop: '4px', marginBottom: '4px' }}>
          From your deployer wallet while you still own the strategy:
        </p>
        <ol style={{ marginLeft: '14px', lineHeight: '2.2' }}>
          <li>
            <strong style={{ color: 'var(--gold)' }}>Deposit</strong> a small amount into the vault
            {explorer && result.vaultAddress && (
              <> — <a href={`${explorer}/address/${result.vaultAddress}#writeContract`} target="_blank" rel="noreferrer" style={{ color: 'var(--green)' }}>Vault write contract →</a></>
            )}
          </li>
          <li>
            <strong style={{ color: 'var(--gold)' }}>Harvest</strong> — call{' '}
            <Inline>harvest()</Inline> on the <strong>strategy</strong> and verify it succeeds.
            Then check that <Inline>pricePerFullShare</Inline> on the vault increased.
            {explorer && result.strategyAddress && (
              <> — <a href={`${explorer}/address/${result.strategyAddress}#writeContract`} target="_blank" rel="noreferrer" style={{ color: 'var(--green)' }}>Strategy write contract →</a></>
            )}
          </li>
          <li>
            <strong style={{ color: 'var(--gold)' }}>Withdraw</strong> — call{' '}
            <Inline>withdraw(amount)</Inline> on the vault and confirm your LP is returned.
          </li>
        </ol>
        <p style={{ marginTop: '6px' }}>
          Also check a recently deployed vault of the same type on the block explorer to see
          what calls the strategist made between initialization and ownership transfer — some
          platforms require additional setup calls before harvest works correctly.
        </p>
        <p style={{ color: '#f99', marginTop: '6px' }}>
          ⚠ If any call reverts, stop and fix before transferring ownership. Use{' '}
          <a href="https://dashboard.tenderly.co" target="_blank" rel="noreferrer" style={{ color: 'var(--green)' }}>Tenderly</a>{' '}
          to trace reverts and identify the failing selector.
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

      {/* ── Step 5: beefy-v2 listing PR (only after Step 4 API PR is merged) */}
      <CheckStep num="5" title="SUBMIT A LISTING PR TO BEEFY-V2">
        <p style={{ color: '#f99', marginBottom: '6px' }}>
          ⚠ Only submit this after the beefy-api PR (Step 4) has been <strong>merged</strong>.
          The beefy-v2 PR will be blocked by CI until the API PR is live in production.
        </p>
        <p>
          Fork{' '}
          <a
            href="https://github.com/beefyfinance/beefy-v2"
            target="_blank" rel="noreferrer"
            style={{ color: 'var(--green)' }}
          >
            github.com/beefyfinance/beefy-v2
          </a>{' '}
          and add your vault entry to the <strong style={{ color: 'var(--gold)' }}>end</strong>{' '}
          of the array in{' '}
          <Inline>src/config/vault/{network}.json</Inline> (file is ordered oldest → newest).
        </p>
        <p style={{ marginTop: '6px', marginBottom: '4px' }}>
          Most fields below are <strong style={{ color: 'var(--green)' }}>auto-populated</strong> from your deploy.
          Review each value — especially <Inline>id</Inline>, <Inline>name</Inline>, and <Inline>addLiquidityUrl</Inline> —
          then adjust any that look wrong.
        </p>
        <div style={{ position: 'relative' }}>
          <Code>{vaultJson}</Code>
          <button
            onClick={() => copyJson(vaultJson)}
            style={{
              position: 'absolute', top: '8px', right: '8px',
              background: jsonCopied ? 'var(--green)' : 'rgba(0,0,0,0.6)',
              border: `1px solid ${jsonCopied ? 'var(--green)' : 'var(--border)'}`,
              color: jsonCopied ? '#000' : 'var(--cyan)',
              cursor: 'pointer', padding: '2px 8px', fontSize: '6px',
              fontFamily: 'monospace',
            }}
          >
            {jsonCopied ? '✓ COPIED' : 'COPY'}
          </button>
        </div>
        <p style={{ marginTop: '6px', marginBottom: '4px' }}>
          What to double-check before submitting:
        </p>
        <ul style={{ marginLeft: '14px', lineHeight: '2' }}>
          <li>
            <Inline>id</Inline> / <Inline>oracleId</Inline> — must be lowercase kebab-case, no token
            weights (e.g. use <Inline>alcx-weth</Inline> not <Inline>80alcx-20weth</Inline>)
          </li>
          <li>
            <Inline>name</Inline> / <Inline>token</Inline> — match the display name shown in the DEX UI
          </li>
          {addLiqUrl.includes('TODO') && (
            <li>
              <Inline>addLiquidityUrl</Inline> — fill in the pool's add-liquidity page URL
            </li>
          )}
          <li>
            <Inline>notCorrelated</Inline> — auto-set to <Inline>{String(!notCorrelated)}</Inline> based on LP stable flag;
            verify this is correct ({!notCorrelated ? 'stable/pegged pair' : 'volatile pair'})
          </li>
          <li>
            <Inline>tokenDecimals</Inline> — almost always 18, but verify on-chain for unusual tokens
          </li>
          {(platformId.includes('TODO') || tokenProvider.includes('TODO')) && (
            <li>
              <Inline>platformId</Inline> / <Inline>tokenProviderId</Inline> — fill in the correct DEX/platform names
            </li>
          )}
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

      {/* ── Step 4: beefy-api PR — must be MERGED before beefy-v2 PR ────── */}
      <CheckStep num="4" title="SUBMIT BEEFY-API PR AND WAIT FOR IT TO MERGE">
        <p>
          The beefy-v2 PR (Step 5) <strong style={{ color: 'var(--gold)' }}>cannot merge</strong>{' '}
          until this beefy-api PR is merged first. Submit this PR, wait for Beefy team approval,
          then proceed to Step 5.
        </p>
        <p style={{ marginTop: '4px' }}>
          Fork{' '}
          <a
            href="https://github.com/beefyfinance/beefy-api"
            target="_blank" rel="noreferrer"
            style={{ color: 'var(--green)' }}
          >
            github.com/beefyfinance/beefy-api
          </a>
          {' '}and add an entry to the appropriate data file (see template below).
        </p>
        <p style={{ color: '#f99', marginTop: '4px', marginBottom: '6px' }}>
          ⚠ If your tokens are not already in Beefy's oracle system, you may also need to run
          the <Inline>setOracle</Inline> and <Inline>setSwapInfo</Inline> scripts from the{' '}
          <a
            href="https://github.com/beefyfinance/beefy-contracts"
            target="_blank" rel="noreferrer"
            style={{ color: 'var(--green)' }}
          >
            beefy-contracts
          </a>{' '}
          repo to register the token's price oracle and swap route on-chain. Ask in the{' '}
          <strong>#-development</strong> Discord channel — these scripts are not publicly documented.
        </p>
        {isAura && (
          <>
            <p style={{ marginTop: '8px', marginBottom: '4px' }}>
              For Balancer V3 + Aura vaults on {network}, append this entry to{' '}
              <Inline>src/data/{network}/balancerV3pools.json</Inline>:
            </p>
            <Code>{JSON.stringify({
              name:     `TODO-${network}-pool-name`,
              address:  form.want,
              gauge:    result.crvRewards    || 'TODO-crvRewards-address',
              decimals: '1e18',
              rewards: [{
                rewardGauge: result.auraRewardGauge || 'TODO-auraRewardGauge-address',
                oracleId:    'AURA',
                decimals:    '1e18',
              }],
              tokens: [
                { address: 'TODO-token0-address', oracleId: 'TODO-TOKEN0-SYMBOL', decimals: '1e18' },
                { address: 'TODO-token1-address', oracleId: 'TODO-TOKEN1-SYMBOL', decimals: '1e18' },
              ],
            }, null, 2)}</Code>
            <ul style={{ marginLeft: '14px', lineHeight: '2', marginTop: '4px' }}>
              <li>
                <Inline>name</Inline> — must exactly match the <Inline>oracleId</Inline> in the beefy-v2 entry
              </li>
              <li>
                <Inline>gauge</Inline> — the Aura crvRewards (reward pool) address{result.crvRewards ? ' — pre-filled from deploy ✓' : ' — look up: booster.poolInfo(pid)[3]'}
              </li>
              <li>
                <Inline>rewards[].rewardGauge</Inline> — the AURA stash wrapper{result.auraRewardGauge ? ' — pre-filled from deploy ✓' : ' — look up: crvRewards.extraRewards(0)'}
              </li>
              <li>
                <Inline>tokens[]</Inline> — each pool token: its checksummed address and its beefy oracleId symbol
              </li>
            </ul>
          </>
        )}
        {/* ── Convex ── */}
        {form.strategyType === 'convex' && (
          <>
            <p style={{ marginTop: '8px', marginBottom: '4px' }}>
              Append this entry to{' '}
              <Inline>src/data/{network}/convexPools.json</Inline>:
            </p>
            <Code>{JSON.stringify({
              name:       `TODO-convex-pool-name`,
              pool:       form.curvePool || 'TODO-curve-pool-address',
              token:      form.want,
              rewardPool: 'TODO-convex-base-reward-pool-address',
              tokens: [
                { oracle: 'tokens', oracleId: 'TODO-TOKEN0', decimals: '1e18' },
                { oracle: 'tokens', oracleId: 'TODO-TOKEN1', decimals: '1e18' },
              ],
            }, null, 2)}</Code>
            <ul style={{ marginLeft: '14px', lineHeight: '2', marginTop: '4px' }}>
              <li><Inline>pool</Inline> — the Curve pool contract (pre-filled from Step 3)</li>
              <li><Inline>token</Inline> — the LP token address (pre-filled from Step 2 ✓)</li>
              <li><Inline>rewardPool</Inline> — Convex BaseRewardPool: look up <Inline>booster.poolInfo(pid).crvRewards</Inline></li>
              <li><Inline>tokens[].oracleId</Inline> — must match a symbol in Beefy's price oracle</li>
            </ul>
          </>
        )}

        {/* ── StakeDAO ── */}
        {form.strategyType === 'stakedao' && (
          <>
            <p style={{ marginTop: '8px', marginBottom: '4px' }}>
              Append this entry to{' '}
              <Inline>src/data/{network}/convexPools.json</Inline>{' '}
              (StakeDAO shares the file with Convex — distinguished by <Inline>stakeDao: true</Inline>):
            </p>
            <Code>{JSON.stringify({
              name:     `TODO-curve-pool-name`,
              pool:     form.curvePool || 'TODO-curve-pool-address',
              gauge:    form.staking   || 'TODO-curve-gauge-address',
              stakeDao: true,
              tokens: [
                { oracle: 'tokens', oracleId: 'TODO-TOKEN0', decimals: '1e18' },
                { oracle: 'tokens', oracleId: 'TODO-TOKEN1', decimals: '1e18' },
              ],
            }, null, 2)}</Code>
            <ul style={{ marginLeft: '14px', lineHeight: '2', marginTop: '4px' }}>
              <li><Inline>pool</Inline> — the Curve pool contract (pre-filled from Step 3)</li>
              <li><Inline>gauge</Inline> — the Curve gauge address (pre-filled from Step 3 ✓)</li>
              <li><Inline>tokens[].oracleId</Inline> — must match a symbol in Beefy's price oracle</li>
            </ul>
          </>
        )}

        {/* ── CurveGauge ── */}
        {form.strategyType === 'curvegauge' && (
          <>
            <p style={{ marginTop: '8px', marginBottom: '4px' }}>
              Append this entry to{' '}
              <Inline>src/data/{network}/curvePools.json</Inline>:
            </p>
            <Code>{JSON.stringify({
              name:  `TODO-curve-pool-name`,
              pool:  form.curvePool || 'TODO-curve-pool-address',
              gauge: form.staking   || 'TODO-curve-gauge-address',
              tokens: [
                { oracle: 'tokens', oracleId: 'TODO-TOKEN0', decimals: '1e18' },
                { oracle: 'tokens', oracleId: 'TODO-TOKEN1', decimals: '1e18' },
              ],
            }, null, 2)}</Code>
            <ul style={{ marginLeft: '14px', lineHeight: '2', marginTop: '4px' }}>
              <li><Inline>pool</Inline> — the Curve pool contract (pre-filled from Step 3)</li>
              <li><Inline>gauge</Inline> — the Curve native gauge (pre-filled from Step 3 ✓)</li>
              <li><Inline>tokens[].oracleId</Inline> — must match a symbol in Beefy's price oracle</li>
              <li>Add a <Inline>rewards[]</Inline> array if the gauge distributes extra tokens beyond CRV</li>
            </ul>
          </>
        )}

        {/* ── Chef ── */}
        {form.strategyType === 'chef' && (
          <>
            <p style={{ marginTop: '8px', marginBottom: '4px' }}>
              Append this entry to the platform's LP pool file in{' '}
              <Inline>src/data/{network}/{'<platform>'}LpPools.json</Inline>
              {' '}(filename matches the DEX/farm name, e.g. <Inline>sushiLpPools.json</Inline>):
            </p>
            <Code>{JSON.stringify({
              name:     `TODO-platform-token0-token1`,
              address:  form.want,
              decimals: '1e18',
              poolId:   form.poolId != null ? Number(form.poolId) : 'TODO-pool-id',
              chainId:  form.chainId,
              beefyFee: 0.095,
              lp0: { address: 'TODO-token0-address', oracle: 'tokens', oracleId: 'TODO-TOKEN0', decimals: '1e18' },
              lp1: { address: 'TODO-token1-address', oracle: 'tokens', oracleId: 'TODO-TOKEN1', decimals: '1e18' },
            }, null, 2)}</Code>
            <ul style={{ marginLeft: '14px', lineHeight: '2', marginTop: '4px' }}>
              <li><Inline>address</Inline> — LP pair address (pre-filled ✓)</li>
              <li><Inline>poolId</Inline> — MasterChef pool index (pre-filled ✓)</li>
              <li><Inline>lp0/lp1.address</Inline> — call <Inline>token0()</Inline> / <Inline>token1()</Inline> on the LP pair</li>
              <li><Inline>lp0/lp1.oracleId</Inline> — must match a symbol in Beefy's price oracle</li>
              <li><Inline>lp0/lp1.decimals</Inline> — check each token contract</li>
            </ul>
          </>
        )}

        {/* ── Solidly Gauge ── */}
        {form.strategyType === 'gauge' && (
          <>
            <p style={{ marginTop: '8px', marginBottom: '4px' }}>
              Append this entry to the platform's LP pool file in{' '}
              <Inline>src/data/{network}/{'<platform>'}LpPools.json</Inline>
              {' '}(e.g. <Inline>velodromeLpPools.json</Inline>, <Inline>aerodromeStableLpPools.json</Inline>):
            </p>
            <Code>{JSON.stringify({
              name:     `TODO-platform-token0-token1`,
              address:  form.want,
              gauge:    form.staking || 'TODO-gauge-address',
              decimals: '1e18',
              chainId:  form.chainId,
              beefyFee: 0.095,
              lp0: { address: 'TODO-token0-address', oracle: 'tokens', oracleId: 'TODO-TOKEN0', decimals: '1e18' },
              lp1: { address: 'TODO-token1-address', oracle: 'tokens', oracleId: 'TODO-TOKEN1', decimals: '1e18' },
            }, null, 2)}</Code>
            <ul style={{ marginLeft: '14px', lineHeight: '2', marginTop: '4px' }}>
              <li><Inline>address</Inline> — LP pair address (pre-filled ✓)</li>
              <li><Inline>gauge</Inline> — gauge contract (pre-filled from Step 3 ✓)</li>
              <li><Inline>lp0/lp1.address</Inline> — call <Inline>token0()</Inline> / <Inline>token1()</Inline> on the LP pair</li>
              <li><Inline>lp0/lp1.oracleId</Inline> — must match a symbol in Beefy's price oracle</li>
              <li><Inline>lp0/lp1.decimals</Inline> — check each token contract</li>
            </ul>
          </>
        )}
        <p style={{ marginTop: '6px', color: '#aaa' }}>
          ℹ Ask in Beefy's <strong>#-development</strong> Discord channel if you need help
          with the API entry format or the setOracle/setSwapInfo scripts.
        </p>
      </CheckStep>
    </PixelBox>
  );
}

// Strategy types where the LP (want) token must have a BeefyOracle sub-oracle.
// StrategyCurveConvexFactory routes depositToken→LP through BeefySwapper which calls
// getFreshPrice(lpToken) — without an LP oracle every harvest reverts PriceFailed.
const NEEDS_LP_ORACLE_PREFLIGHT = new Set(['convex', 'curvegauge']);

// ─── main deploy step ─────────────────────────────────────────────────────────

export function StepDeploy({ form, dryResult, onBack, onReset }) {
  const [phase,   setPhase]   = useState(dryResult ? 'dry_done' : 'idle');
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(dryResult || null);
  const [error,   setError]   = useState('');

  // Pre-flight: LP oracle check for Convex/CurveGauge strategies
  const needsLpPreflight = NEEDS_LP_ORACLE_PREFLIGHT.has(form.strategyType);
  const [lpPreflight, setLpPreflight] = React.useState(null); // null | { configured, subOracleAddr, reason }

  React.useEffect(() => {
    if (!needsLpPreflight || !form.want || !form.chainId) return;
    api.checkBeefyOracle(form.chainId, form.want)
      .then(res => { if (res.ok !== false) setLpPreflight(res); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsLpPreflight, form.want, form.chainId]);

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* ── LP Oracle pre-flight warning (Convex / CurveGauge only) ───────── */}
          {needsLpPreflight && lpPreflight && lpPreflight.configured === false && (
            <PixelBox variant="red" style={{ padding: '12px' }}>
              <div style={{ fontSize: '8px', color: 'var(--red)', fontWeight: 'bold', marginBottom: '6px' }}>
                ⛔ PRE-FLIGHT FAILURE — Harvest will revert after deployment
              </div>
              <div style={{ fontSize: '7px', color: '#f88', lineHeight: '1.8' }}>
                <strong>BeefyOracle has no price feed for the LP (want) token.</strong>
                <br />
                <code style={{ fontFamily: 'monospace', color: 'var(--gold)', fontSize: '6px' }}>{form.want}</code>
                <br /><br />
                <strong>StrategyCurveConvexFactory</strong> uses BeefySwapper to convert{' '}
                <code style={{ fontFamily: 'monospace', color: 'var(--cyan)' }}>depositToken → LP</code> on every harvest.
                BeefySwapper calls <code style={{ fontFamily: 'monospace', color: 'var(--cyan)' }}>getFreshPrice(lpToken)</code>{' '}
                to compute slippage — but this LP token has no registered sub-oracle.
                Harvest will always revert with{' '}
                <code style={{ fontFamily: 'monospace', color: 'var(--gold)' }}>PriceFailed(lpToken)</code>.
                <br /><br />
                <strong style={{ color: 'var(--gold)' }}>You can still deploy the vault and strategy contracts,</strong>{' '}
                but no one will be able to harvest until the Beefy team registers:
                <br />
                1. A Curve virtual-price oracle for the LP token in BeefyOracle
                <br />
                2. A Curve <code style={{ fontFamily: 'monospace', color: 'var(--cyan)' }}>add_liquidity</code> route in BeefySwapper
                <br /><br />
                <strong>Recommended action:</strong> Contact the Beefy team in Discord{' '}
                <code style={{ fontFamily: 'monospace', color: 'var(--cyan)' }}>#🏭-beefy-factories</code>{' '}
                before deploying, or switch to the <strong>StakeDAO</strong> strategy type
                (it handles LP conversion internally without needing an LP oracle).
              </div>
            </PixelBox>
          )}

          {needsLpPreflight && lpPreflight && lpPreflight.configured === true && (
            <PixelBox variant="green" style={{ padding: '8px 12px' }}>
              <div style={{ fontSize: '7px', color: 'var(--green)' }}>
                ✓ <strong>Pre-flight passed</strong> — BeefyOracle has a price feed for the LP token. Harvest should work.
              </div>
            </PixelBox>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn" onClick={onBack}>◀ BACK</button>
            <button className="btn btn--gold" onClick={runDryRun}>🧪 START DRY-RUN</button>
          </div>
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

      {/* Error display — with actionable hint where possible */}
      {error && (() => {
        const parsed = parseDeployError(error);
        return (
          <PixelBox variant="red" style={{ padding: '12px', marginTop: '12px' }}>
            <div style={{ fontSize: '7px', color: 'var(--red)', marginBottom: '6px' }}>
              ✗ {error}
            </div>
            {parsed && (
              <div style={{ fontSize: '7px', color: 'var(--gold)', borderTop: '1px solid var(--border)', paddingTop: '6px', marginTop: '4px', lineHeight: '1.7' }}>
                💡 <strong>What to do:</strong> {parsed.hint}
                {parsed.step != null && (
                  <span style={{ marginLeft: '6px', color: 'var(--cyan)', border: '1px solid var(--cyan)', padding: '0 4px', fontSize: '6px' }}>
                    → Step {parsed.step + 1}
                  </span>
                )}
              </div>
            )}
            <div style={{ marginTop: '8px' }}>
              <button className="btn btn--sm" onClick={() => { setError(''); setPhase('idle'); }}>
                DISMISS
              </button>
            </div>
          </PixelBox>
        );
      })()}
    </PixelBox>
  );
}
