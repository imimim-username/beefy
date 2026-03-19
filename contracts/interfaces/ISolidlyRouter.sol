// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @notice Subset of the Solidly/Velodrome/Aerodrome router interface used by strategies.
 *
 * Solidly-style routers differ from Uniswap V2 in two ways:
 *  1. `addLiquidity` takes an extra `stable` boolean (before the amounts).
 *  2. `swapExactTokensForTokens` uses a Route[] struct rather than address[].
 *
 * For swap routing we still accept a plain address[] and rely on the fact that
 * all Solidly forks also expose a compatible `swapExactTokensForTokens` overload
 * that accepts an address[].  If the target router does not, the deployer should
 * supply an intermediate Uniswap-V2-compatible router for swaps and only use
 * this interface for liquidity.
 */
interface ISolidlyRouter {
    function addLiquidity(
        address tokenA,
        address tokenB,
        bool    stable,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external view returns (uint256[] memory amounts);
}
