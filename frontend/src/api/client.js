const BASE = '/api';

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export const api = {
  chains:         ()                  => req('GET',  '/chains'),
  resolveLp:      (chainId, lp)       => req('GET',  `/resolve-lp?chainId=${chainId}&lp=${lp}`),
  validateChef:   (chainId, chef, pid)      => req('GET',  `/validate-chef?chainId=${chainId}&chef=${chef}&poolId=${pid}`),
  validateGauge:  (chainId, gauge)          => req('GET',  `/validate-gauge?chainId=${chainId}&gauge=${gauge}`),
  validateAura:       (chainId, booster, pid) => req('GET',  `/validate-aura?chainId=${chainId}&booster=${booster}&pid=${pid}`),
  validateConvex:     (chainId, booster, pid) => req('GET',  `/validate-convex?chainId=${chainId}&booster=${booster}&pid=${pid}`),
  validateCurveGauge: (chainId, gauge)        => req('GET',  `/validate-curvegauge?chainId=${chainId}&gauge=${gauge}`),
  validateStakeDao:   (chainId, gauge)        => req('GET',  `/validate-stakedao?chainId=${chainId}&gauge=${gauge}`),
  validateERC4626:    (chainId, vault, want)  => req('GET',  `/validate-erc4626?chainId=${chainId}&vault=${vault}${want ? `&want=${want}` : ''}`),
  validateAave:       (chainId, aToken, want) => req('GET',  `/validate-aave?chainId=${chainId}&aToken=${aToken}${want ? `&want=${want}` : ''}`),
  validateCompound:   (chainId, comet, want)  => req('GET',  `/validate-compound?chainId=${chainId}&comet=${comet}${want ? `&want=${want}` : ''}`),
  validateSiloV2:     (chainId, silo, want)   => req('GET',  `/validate-silov2?chainId=${chainId}&silo=${silo}${want ? `&want=${want}` : ''}`),
  validateTokemak:    (chainId, rewarder)     => req('GET',  `/validate-tokemak?chainId=${chainId}&rewarder=${rewarder}`),
  curveCoin:          (chainId, pool, idx)    => req('GET',  `/curve-coin?chainId=${chainId}&curvePool=${pool}&coinIndex=${idx}`),
  findPoolId:         (chainId, booster, lp)  => req('GET',  `/find-pool-id?chainId=${chainId}&booster=${booster}&lp=${lp}`),
  rewardTokens:       (chainId, stratType, staking, rewardPool) =>
    req('GET', `/reward-tokens?chainId=${chainId}&stratType=${stratType}&staking=${staking}${rewardPool ? `&rewardPool=${rewardPool}` : ''}`),
  suggestRoutes:  (body)              => req('POST', '/suggest-routes', body),
  resolveToken:   (chainId, address)  => req('GET',  `/resolve-token?chainId=${chainId}&address=${address}`),
  getTokens:      (chainId)           => req('GET',  `/tokens/${chainId}`),
  addToken:       (chainId, token)    => req('POST', `/tokens/${chainId}`, token),
  removeToken:    (chainId, address)  => req('DELETE',`/tokens/${chainId}/${address}`),
  checkExistingVault: (chainId, lp)          => req('GET', `/check-existing-vault?chainId=${chainId}&lp=${lp}`),
  curveCoins:         (chainId, curvePool)    => req('GET', `/curve-coins?chainId=${chainId}&curvePool=${curvePool}`),
  checkSwapperRoute:  (chainId, depositToken) => req('GET', `/check-swapper-route?chainId=${chainId}&depositToken=${depositToken}`),
  checkBeefyOracle:   (chainId, token)        => req('GET', `/check-beefy-oracle?chainId=${chainId}&token=${token}`),
  dryRun:         (body)              => req('POST', '/deploy/dryrun', body),
  execute:        (body)              => req('POST', '/deploy/execute', body),
};
