/**
 * chainInfo.js — static chain metadata for the frontend.
 * Mirrors backend/chains.js but lives in the browser bundle.
 * Keep in sync with chains.js if you add networks.
 *
 * Addresses verified against beefyfinance/beefy-v2 address-book (2026-04)
 */
export const CHAINS_INFO = {
  1: {
    id: 1, name: 'Ethereum', nativeSymbol: 'ETH',
    nativeToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    // nativeToken IS WETH on ETH chains — no separate WETH entry needed
    commonTokens: [
      { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
    ],
    blockExplorer: 'https://etherscan.io',
    beefyAddresses: {
      vaultFactory:      '0xC551dDCE8e5E657503Cd67A39713c06F2c0d2e97',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0x65f2145693bE3E75B8cfB2E318A3a74D057e6c7B', // ETH-specific
      beefyFeeConfig:    '0x3d38BA27974410679afF73abD096D7Ba58870EAd',
      vaultOwner:        '0x5B6C5363851EC9ED29CB7220C39B44E1dd443992',
      strategyOwner:     '0x1c9270ac5C42E51611d7b97b1004313D52c80293',
      unirouter:         '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      auraBooster:       '0xA57b8d98dAE62B26Ec3bcC4a365338157060B234',
      convexBooster:     '0xF403C135812408BFbE8713b5A23a04b3D48AAE31',
      balancerVault:     '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
      // Balancer v3 (mainnet only)
      balancerV3Router:  '0x5C6fb490BDFD3246EB0bB062c168DeCAF4bD9FDd',
      // CRV Minter — only on mainnet; L2 Curve gauges stream CRV as a reward token
      crvMinter:         '0xd061D61a4d941c39E5453435B6345Dc261C2fcE0',
      // Required for Aura vaults: StrategyFactory clones audited StrategyBalancerV3
      strategyFactory:   '0x52941De3eDE234ae6B8608597440Ac3394C64Ae8',
      beefySwapper:      '0x0000830DF56616D58976A12D19d283B40e25BEEF',
    },
  },
  56: {
    id: 56, name: 'BNB Chain', nativeSymbol: 'BNB',
    nativeToken: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    commonTokens: [
      { symbol: 'WETH', address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8' },
      { symbol: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' },
    ],
    blockExplorer: 'https://bscscan.com',
    beefyAddresses: {
      vaultFactory:      '0xe596eC590DE52C09c8D1C7A1294B32F957A7c94e',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0x02Ae4716B9D5d48Db1445814b0eDE39f5c28264B',
      beefyFeeConfig:    '0x97F86f2dC863D98e423E288938dF257D1b6e1553',
      vaultOwner:        '0xA2E6391486670D2f1519461bcc915E4818aD1c9a',
      strategyOwner:     '0x65CF7E8C0d431f59787D07Fa1A9f8725bbC33F7E',
      unirouter:         '0x10ED43C718714eb63d5aA57B78B54704E256024E',
      balancerVault:     '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
      strategyFactory:   '0x8B93779aa8613d9542bCD5e153d536ba5B9039f2',
      beefySwapper:      '0x4362FE9aC48e7c5ea85a359418bBd7471979F5C2',
    },
  },
  137: {
    id: 137, name: 'Polygon', nativeSymbol: 'MATIC',
    nativeToken: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    commonTokens: [
      { symbol: 'WETH',  address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619' },
      { symbol: 'USDC',  address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' },
    ],
    blockExplorer: 'https://polygonscan.com',
    beefyAddresses: {
      vaultFactory:      '0x5a7Bdd60d6004aaED4C06cA16434f4b657d76C3D',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0x02Ae4716B9D5d48Db1445814b0eDE39f5c28264B',
      beefyFeeConfig:    '0x8E98004FE65A2eAdA63AD1DE0F5ff76d845f14E7',
      vaultOwner:        '0x94A9D4d38385C7bD5715A2068D69B87FF81F4BF3',
      strategyOwner:     '0x6fd13191539e0e13B381e1a3770F28D96705ce91',
      unirouter:         '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
      auraBooster:       '0x98Ef32edd24e2c92525E59afc4523041a2aed806',
      balancerVault:     '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
      strategyFactory:   '0x5f04211F4604bB39F3Ae4E58c3652f7B46022058',
      beefySwapper:      '0xDd27227Dba7Ea8F5869466A10A8E36Bb2D709b35',
    },
  },
  42161: {
    id: 42161, name: 'Arbitrum', nativeSymbol: 'ETH',
    nativeToken: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    commonTokens: [
      { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
    ],
    blockExplorer: 'https://arbiscan.io',
    beefyAddresses: {
      vaultFactory:      '0x8396f3d25d07531a80770Ce3DEA025932C4953f7',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0x02Ae4716B9D5d48Db1445814b0eDE39f5c28264B',
      beefyFeeConfig:    '0xDC1dC2abC8775561A6065D0EE27E8fDCa8c4f7ED',
      vaultOwner:        '0x9A94784264AaAE397441c1e47fA132BE4e61BdaD',
      strategyOwner:     '0x6d28afD25a1FBC5409B1BeFFf6AEfEEe2902D89F',
      unirouter:         '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
      auraBooster:       '0x98Ef32edd24e2c92525E59afc4523041a2aed806',
      convexBooster:     '0xF403C135812408BFbE8713b5A23a04b3D48AAE31',
      balancerVault:     '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
      strategyFactory:   '0xeF7746F16e511242e25Ad4FF9732bb5fC35EAB50',
      beefySwapper:      '0xCee843CD04E3758dDC5BCFf08647DddB117151D0',
    },
  },
  10: {
    id: 10, name: 'Optimism', nativeSymbol: 'ETH',
    nativeToken: '0x4200000000000000000000000000000000000006',
    commonTokens: [
      { symbol: 'USDC', address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' },
    ],
    blockExplorer: 'https://optimistic.etherscan.io',
    beefyAddresses: {
      vaultFactory:      '0xA6D3769faC465FC0415e7E9F16dcdC96B83C240B',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0x02Ae4716B9D5d48Db1445814b0eDE39f5c28264B',
      beefyFeeConfig:    '0x216EEE15D1e3fAAD34181f66dd0B665f556a638d',
      vaultOwner:        '0xd08575F5F4DE7212123731088980D069CB75873D',
      strategyOwner:     '0x979a73011e7AB17363d38bee7CF0e4B5032C793e',
      unirouter:         '0x9c12939390052919aF3155f41Bf4160Fd3666A6f',
      auraBooster:       '0x98Ef32edd24e2c92525E59afc4523041a2aed806',
      balancerVault:     '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
      strategyFactory:   '0x6e206FE9C629c37e34C49D31796807254F87AE58',
      beefySwapper:      '0x4ebdf703948ddcea3b11f675b4d1fba9d2414a14',
    },
  },
  8453: {
    id: 8453, name: 'Base', nativeSymbol: 'ETH',
    nativeToken: '0x4200000000000000000000000000000000000006',
    commonTokens: [
      { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
    ],
    blockExplorer: 'https://basescan.org',
    beefyAddresses: {
      vaultFactory:      '0xBC4a342B0c057501E081484A2d24e576E854F823',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0x02Ae4716B9D5d48Db1445814b0eDE39f5c28264B',
      beefyFeeConfig:    '0xfc69704cC3cAac545cC7577009Ea4AA04F1a61Eb',
      vaultOwner:        '0x09D19184F46A32213DF06b981122e06882B61309',
      strategyOwner:     '0x3B60F7f25b09E71356cdFFC6475c222A466a2AC9',
      unirouter:         '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
      auraBooster:       '0x98Ef32edd24e2c92525E59afc4523041a2aed806',
      balancerVault:     '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
      strategyFactory:   '0x705A3168F2c48263B1249A11940E6602A4f22a9A',
      beefySwapper:      '0x9F8c6a094434C6E6f5F2792088Bb4d2D5971DdCc',
    },
  },
  43114: {
    id: 43114, name: 'Avalanche', nativeSymbol: 'AVAX',
    nativeToken: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    commonTokens: [
      { symbol: 'WETH.e', address: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB' },
      { symbol: 'USDC',   address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E' },
    ],
    blockExplorer: 'https://snowtrace.io',
    beefyAddresses: {
      vaultFactory:      '0xee78529E158E82AC54c89608A9664F5597050526',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0x02Ae4716B9D5d48Db1445814b0eDE39f5c28264B',
      beefyFeeConfig:    '0xBb0c0A821D1F9bC7405f5370DE5f9D2F11975073',
      vaultOwner:        '0x690216f462615b749bEEB5AA3f1d89a2BEc45Ecf',
      strategyOwner:     '0x37DC61A76113E7840d4A8F1c1B799cC9ac5Aa854',
      unirouter:         '0x60aE616a2155Ee3d9A68541Ba4544862310933d4',
      strategyFactory:   '0x9710FAd814B26f736f0F06E977E9136BBa352227',
      beefySwapper:      '0x4eAac8F5BB8Fd65cf47F1E57B7aF7c93eA92a78e',
    },
  },
  250: {
    id: 250, name: 'Fantom', nativeSymbol: 'FTM',
    nativeToken: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
    commonTokens: [
      { symbol: 'USDC', address: '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75' },
    ],
    blockExplorer: 'https://ftmscan.com',
    beefyAddresses: {
      vaultFactory:      '0x740CE0674aF6eEC113A435fAa53B297536A3e89B',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0x02Ae4716B9D5d48Db1445814b0eDE39f5c28264B',
      beefyFeeConfig:    '0x3b282a104794c5d256D285B4ba9ed27375c0b359',
      vaultOwner:        '0x4560a83b7eED32EB78C48A5bedE9B608F3184df0',
      strategyOwner:     '0x847298aC8C28A9D66859E750456b92C2A67b876D',
      unirouter:         '0xF491e7B69E4244ad4002BC14e878a34207E38c29',
    },
  },
};
