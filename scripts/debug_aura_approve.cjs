'use strict';
/**
 * debug_aura_approve.cjs
 * Run with:  FORK_URL=<eth-rpc> npx hardhat run scripts/debug_aura_approve.cjs --network hardhat
 *
 * Simulates every approve() call that StrategyAuraLP._giveAllowances() would make
 * for the 80ALCX-20WETH Balancer v3 pool, so we can pinpoint exactly which one reverts.
 */

const { ethers } = require('hardhat');

// ── Known addresses ───────────────────────────────────────────────────────────
const WANT          = '0x1535D7CA00323Aa32BD62AEDdf7ca651e4b95966'; // 80ALCX-20WETH v3 BPT
const AURA_BOOSTER  = '0x7818A1DA7BD1E64c199029E86Ba244a9798eEE10';
const AURA_GAUGE    = '0x39b2b74b817f0A10a5fA67a3EDCf5705A750c43C'; // BaseRewardPool4626
const BAL           = '0xba100000625a3754423978a60c9317c58a424e3D';
const WETH          = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const V3_ROUTER     = '0x5C6fb490BDFD3246EB0bB062c168DeCAF4bD9FDd';
const UNIROUTER     = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
];

const REWARD_POOL_ABI = [
  'function extraRewardsLength() view returns (uint256)',
  'function extraRewards(uint256 i) view returns (address)',
  'function rewardToken() view returns (address)',
];

async function tryApprove(signer, tokenAddr, spender, label) {
  let symbol = '?';
  try {
    const t = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
    symbol = await t.symbol().catch(() => tokenAddr.slice(0, 10));
    await t.approve(spender, ethers.MaxUint256);
    console.log(`  ✓  ${label}: ${symbol} (${tokenAddr}) → ${spender}`);
    return true;
  } catch (e) {
    console.log(`  ✗  ${label}: ${symbol} (${tokenAddr}) → ${spender}`);
    console.log(`       Error: ${e.message?.split('\n')[0]}`);
    return false;
  }
}

async function main() {
  const [signer] = await ethers.getSigners();
  console.log(`\nDebug runner: ${signer.address}`);

  // ── Step 1: find the AURA token via the same logic as StrategyAuraLP ─────────
  console.log('\n[1] Auto-detecting AURA token via extraRewards…');
  const rewardPool = new ethers.Contract(AURA_GAUGE, REWARD_POOL_ABI, signer);
  let auraToken = null;

  const extraLen = await rewardPool.extraRewardsLength().catch(() => 0n);
  console.log(`    extraRewardsLength = ${extraLen}`);

  for (let i = 0; i < Number(extraLen); i++) {
    const extraPool = await rewardPool.extraRewards(i);
    const rt = await new ethers.Contract(extraPool, REWARD_POOL_ABI, signer).rewardToken().catch(() => null);
    let sym = '?';
    if (rt) {
      sym = await new ethers.Contract(rt, ERC20_ABI, signer).symbol().catch(() => rt.slice(0, 10));
    }
    console.log(`    extraRewards(${i}) = ${extraPool}  →  rewardToken = ${rt} (${sym})`);
    if (i === 0 && rt) auraToken = rt;
  }

  if (!auraToken) console.log('    (no extra rewards detected — aura stays address(0))');

  // ── Step 2: test each approve individually ────────────────────────────────────
  console.log('\n[2] Testing each approve() individually…\n');
  await tryApprove(signer, WANT,  AURA_BOOSTER, 'want  → booster');
  await tryApprove(signer, BAL,   UNIROUTER,    'BAL   → unirouter');
  await tryApprove(signer, WETH,  V3_ROUTER,    'WETH  → v3 router');
  if (auraToken) {
    await tryApprove(signer, auraToken, UNIROUTER, 'aura  → unirouter');
  }

  // ── Step 3: check if the v3 BPT has a standard approve ───────────────────────
  console.log('\n[3] BPT contract code size (0 = EOA or empty):');
  const code = await ethers.provider.getCode(WANT);
  console.log(`    ${WANT} codeSize = ${(code.length - 2) / 2} bytes`);

  console.log('\nDone.\n');
}

main().catch(e => { console.error(e); process.exit(1); });
