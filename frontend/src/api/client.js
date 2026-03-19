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
  curveCoin:          (chainId, pool, idx)    => req('GET',  `/curve-coin?chainId=${chainId}&curvePool=${pool}&coinIndex=${idx}`),
  suggestRoutes:  (body)              => req('POST', '/suggest-routes', body),
  resolveToken:   (chainId, address)  => req('GET',  `/resolve-token?chainId=${chainId}&address=${address}`),
  getTokens:      (chainId)           => req('GET',  `/tokens/${chainId}`),
  addToken:       (chainId, token)    => req('POST', `/tokens/${chainId}`, token),
  removeToken:    (chainId, address)  => req('DELETE',`/tokens/${chainId}/${address}`),
  dryRun:         (body)              => req('POST', '/deploy/dryrun', body),
  execute:        (body)              => req('POST', '/deploy/execute', body),
};
