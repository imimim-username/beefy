// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @notice Balancer v3 Router — used for adding/removing liquidity.
 *         Unlike v2, liquidity operations go through the Router (not the Vault directly).
 *
 *         Mainnet Router: 0x5C6fb490BDFD3246EB0bB062c168DeCAF4bD9FDd
 */
interface IBalancerV3Router {
    /**
     * @notice Add liquidity with arbitrary token amounts (replaces v2's joinPool).
     * @param pool              BPT pool contract address (the want token)
     * @param exactAmountsIn    Token amounts in pool-token order (from getPoolTokens)
     * @param minBptAmountOut   Minimum BPT to receive; 0 = no slippage protection
     * @param wethIsEth         True to send/receive raw ETH; false to use WETH
     * @param userData          Additional calldata (pass "" for standard joins)
     * @return bptAmountOut     Amount of BPT minted
     */
    function addLiquidityUnbalanced(
        address pool,
        uint256[] memory exactAmountsIn,
        uint256 minBptAmountOut,
        bool wethIsEth,
        bytes memory userData
    ) external payable returns (uint256 bptAmountOut);
}

/**
 * @notice Balancer v3 Vault — subset used by strategies.
 *         Unlike v2, getPoolTokens takes the pool address, not a bytes32 poolId.
 *
 *         Mainnet Vault: 0xbA1333333333a1BA1108E8412f11850A5C319bA9
 */
interface IBalancerV3Vault {
    /**
     * @notice Returns the tokens registered for a pool.
     *         Does NOT include the BPT itself (v3 does not pre-mint BPT in the pool).
     */
    function getPoolTokens(address pool) external view returns (address[] memory tokens);
}
