'use strict';
const { ethers } = require('hardhat');
const WANT = '0x1535D7CA00323Aa32BD62AEDdf7ca651e4b95966'; // 80ALCX-20WETH v3 BPT
const ABI = [
  'function poolLength() view returns (uint256)',
  'function poolInfo(uint256) view returns (address lptoken, address token, address gauge, address crvRewards, address stash, bool shutdown)',
];
const BOOSTERS = {
  'chainInfo (current)': '0x7818A1DA7BD1E64c199029E86Ba244a9798eEE10',
  'standard Aura mainnet': '0xA57b8d98dAE62B26Ec3bcC4a365338157060B234',
};
async function main() {
  const [s] = await ethers.getSigners();
  for (const [label, addr] of Object.entries(BOOSTERS)) {
    console.log(`\n--- ${label}: ${addr} ---`);
    const b = new ethers.Contract(addr, ABI, s);
    const len = await b.poolLength().catch(e => `ERROR: ${e.message.slice(0,80)}`);
    console.log(`  poolLength = ${len}`);
    if (typeof len !== 'bigint') continue;
    let found = false;
    for (let i = Number(len)-1; i >= 0; i--) {
      const info = await b.poolInfo(i).catch(() => null);
      if (!info) continue;
      if (info.lptoken.toLowerCase() === WANT.toLowerCase()) {
        console.log(`  ✓ FOUND at pool ${i}: crvRewards=${info.crvRewards} stash=${info.stash}`);
        found = true; break;
      }
    }
    if (!found) console.log(`  ✗ Not found in this booster`);
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
