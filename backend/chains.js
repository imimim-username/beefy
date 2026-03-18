'use strict';
/**
 * chains.js — supported networks + Beefy address book per chain.
 *
 * vaultFactory      : BeefyVaultV7Factory — cloneVault() creates a new vault proxy
 * keeper            : Beefy keeper / harvester
 * beefyFeeRecipient : receives Beefy's share of harvests
 * beefyFeeConfig    : on-chain fee-split config contract
 * vaultOwner        : Beefy multisig that owns vaults after init
 * strategyOwner     : Beefy multisig that owns strategies after init
 * unirouter         : default DEX router (can be overridden per vault)
 * nativeToken       : wrapped native (WBNB, WMATIC, etc.)
 *
 * Addresses verified against api.beefy.finance/config/<chain>  (2024-03)
 */
const CHAINS = {
  1: {
    id: 1,
    name: 'Ethereum',
    shortName: 'ethereum',
    rpcEnvKey: 'RPC_ETH',
    rpcFallback: 'https://eth.llamarpc.com',
    nativeSymbol: 'ETH',
    nativeToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    beefyAddresses: {
      vaultFactory:      '0xC551dDCE8e5E657503Cd67A39713c06F2c0d2e97',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0x65f2145693bE3E75B8cfB2E318A3a74D057e6c7B', // ETH-specific
      beefyFeeConfig:    '0x3d38BA27974410679afF73abD096D7Ba58870EAd',
      vaultOwner:        '0x5B6C5363851EC9ED29CB7220C39B44E1dd443992',
      strategyOwner:     '0x1c9270ac5C42E51611d7b97b1004313D52c80293',
      unirouter:         '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // Uniswap V2
    },
    blockExplorer: 'https://etherscan.io',
    hardhatNetwork: 'ethereum',
  },
  56: {
    id: 56,
    name: 'BNB Chain',
    shortName: 'bsc',
    rpcEnvKey: 'RPC_BSC',
    rpcFallback: 'https://bsc-dataseed.binance.org/',
    nativeSymbol: 'BNB',
    nativeToken: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    beefyAddresses: {
      vaultFactory:      '0xe596eC590DE52C09c8D1C7A1294B32F957A7c94e',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0x02Ae4716B9D5d48Db1445814b0eDE39f5c28264B',
      beefyFeeConfig:    '0x97F86f2dC863D98e423E288938dF257D1b6e1553',
      vaultOwner:        '0xA2E6391486670D2f1519461bcc915E4818aD1c9a',
      strategyOwner:     '0x65CF7E8C0d431f59787D07Fa1A9f8725bbC33F7E',
      unirouter:         '0x10ED43C718714eb63d5aA57B78B54704E256024E', // PancakeSwap v2
    },
    blockExplorer: 'https://bscscan.com',
    hardhatNetwork: 'bsc',
  },
  137: {
    id: 137,
    name: 'Polygon',
    shortName: 'polygon',
    rpcEnvKey: 'RPC_POLYGON',
    rpcFallback: 'https://polygon-rpc.com',
    nativeSymbol: 'MATIC',
    nativeToken: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
    beefyAddresses: {
      vaultFactory:      '0x5a7Bdd60d6004aaED4C06cA16434f4b657d76C3D',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0x02Ae4716B9D5d48Db1445814b0eDE39f5c28264B',
      beefyFeeConfig:    '0x8E98004FE65A2eAdA63AD1DE0F5ff76d845f14E7',
      vaultOwner:        '0x94A9D4d38385C7bD5715A2068D69B87FF81F4BF3',
      strategyOwner:     '0x6fd13191539e0e13B381e1a3770F28D96705ce91',
      unirouter:         '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff', // QuickSwap
    },
    blockExplorer: 'https://polygonscan.com',
    hardhatNetwork: 'polygon',
  },
  42161: {
    id: 42161,
    name: 'Arbitrum',
    shortName: 'arbitrum',
    rpcEnvKey: 'RPC_ARBITRUM',
    rpcFallback: 'https://arb1.arbitrum.io/rpc',
    nativeSymbol: 'ETH',
    nativeToken: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
    beefyAddresses: {
      vaultFactory:      '0x8396f3d25d07531a80770Ce3DEA025932C4953f7',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0x02Ae4716B9D5d48Db1445814b0eDE39f5c28264B',
      beefyFeeConfig:    '0xDC1dC2abC8775561A6065D0EE27E8fDCa8c4f7ED',
      vaultOwner:        '0x9A94784264AaAE397441c1e47fA132BE4e61BdaD',
      strategyOwner:     '0x6d28afD25a1FBC5409B1BeFFf6AEfEEe2902D89F',
      unirouter:         '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', // SushiSwap
    },
    blockExplorer: 'https://arbiscan.io',
    hardhatNetwork: 'arbitrum',
  },
  10: {
    id: 10,
    name: 'Optimism',
    shortName: 'optimism',
    rpcEnvKey: 'RPC_OPTIMISM',
    rpcFallback: 'https://mainnet.optimism.io',
    nativeSymbol: 'ETH',
    nativeToken: '0x4200000000000000000000000000000000000006', // WETH
    beefyAddresses: {
      vaultFactory:      '0xA6D3769faC465FC0415e7E9F16dcdC96B83C240B',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0x02Ae4716B9D5d48Db1445814b0eDE39f5c28264B',
      beefyFeeConfig:    '0x216EEE15D1e3fAAD34181f66dd0B665f556a638d',
      vaultOwner:        '0xd08575F5F4DE7212123731088980D069CB75873D',
      strategyOwner:     '0x979a73011e7AB17363d38bee7CF0e4B5032C793e',
      unirouter:         '0x9c12939390052919aF3155f41Bf4160Fd3666A6f', // Velodrome
    },
    blockExplorer: 'https://optimistic.etherscan.io',
    hardhatNetwork: 'optimism',
  },
  8453: {
    id: 8453,
    name: 'Base',
    shortName: 'base',
    rpcEnvKey: 'RPC_BASE',
    rpcFallback: 'https://mainnet.base.org',
    nativeSymbol: 'ETH',
    nativeToken: '0x4200000000000000000000000000000000000006', // WETH
    beefyAddresses: {
      vaultFactory:      '0xBC4a342B0c057501E081484A2d24e576E854F823',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0x02Ae4716B9D5d48Db1445814b0eDE39f5c28264B',
      beefyFeeConfig:    '0xfc69704cC3cAac545cC7577009Ea4AA04F1a61Eb',
      vaultOwner:        '0x09D19184F46A32213DF06b981122e06882B61309',
      strategyOwner:     '0x3B60F7f25b09E71356cdFFC6475c222A466a2AC9',
      unirouter:         '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43', // Aerodrome
    },
    blockExplorer: 'https://basescan.org',
    hardhatNetwork: 'base',
  },
  43114: {
    id: 43114,
    name: 'Avalanche',
    shortName: 'avax',
    rpcEnvKey: 'RPC_AVAX',
    rpcFallback: 'https://api.avax.network/ext/bc/C/rpc',
    nativeSymbol: 'AVAX',
    nativeToken: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', // WAVAX
    beefyAddresses: {
      vaultFactory:      '0xee78529E158E82AC54c89608A9664F5597050526',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0x02Ae4716B9D5d48Db1445814b0eDE39f5c28264B',
      beefyFeeConfig:    '0xBb0c0A821D1F9bC7405f5370DE5f9D2F11975073',
      vaultOwner:        '0x690216f462615b749bEEB5AA3f1d89a2BEc45Ecf',
      strategyOwner:     '0x37DC61A76113E7840d4A8F1c1B799cC9ac5Aa854',
      unirouter:         '0x60aE616a2155Ee3d9A68541Ba4544862310933d4', // TraderJoe
    },
    blockExplorer: 'https://snowtrace.io',
    hardhatNetwork: 'avax',
  },
  250: {
    id: 250,
    name: 'Fantom',
    shortName: 'fantom',
    rpcEnvKey: 'RPC_FANTOM',
    rpcFallback: 'https://rpc.ftm.tools',
    nativeSymbol: 'FTM',
    nativeToken: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83', // WFTM
    beefyAddresses: {
      vaultFactory:      '0x740CE0674aF6eEC113A435fAa53B297536A3e89B',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0x02Ae4716B9D5d48Db1445814b0eDE39f5c28264B',
      beefyFeeConfig:    '0x3b282a104794c5d256D285B4ba9ed27375c0b359',
      vaultOwner:        '0x4560a83b7eED32EB78C48A5bedE9B608F3184df0',
      strategyOwner:     '0x847298aC8C28A9D66859E750456b92C2A67b876D',
      unirouter:         '0xF491e7B69E4244ad4002BC14e878a34207E38c29', // SpookySwap
    },
    blockExplorer: 'https://ftmscan.com',
    hardhatNetwork: 'fantom',
  },
};

module.exports = { CHAINS };
