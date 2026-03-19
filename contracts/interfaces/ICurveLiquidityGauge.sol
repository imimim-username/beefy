// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @notice Curve LiquidityGauge interface (V2/V3/V4/V5 + factory gauges).
 *
 * IMPORTANT: claim_rewards() claims only extra rewards (NOT CRV).
 * CRV emissions must be claimed separately via ICurveMinter.mint(gauge).
 *
 * Exception: StakeDAO gauges — they expose the same interface but their
 * claim_rewards(address) also distributes CRV (no external Minter call needed).
 */
interface ICurveLiquidityGauge {
    // ── Deposit / Withdraw ───────────────────────────────────────────────────

    /// @notice Stake LP tokens into the gauge.
    function deposit(uint256 _value) external;

    /// @notice Unstake LP tokens from the gauge.
    function withdraw(uint256 _value) external;

    // ── Reward Claiming ──────────────────────────────────────────────────────

    /// @notice Claim extra reward tokens for msg.sender (does NOT mint CRV).
    function claim_rewards() external;

    /// @notice Claim extra reward tokens for a specific address (V3+ / factory).
    ///         StakeDAO gauges: also distributes CRV via this call.
    function claim_rewards(address _addr) external;

    // ── View: Extra Rewards ──────────────────────────────────────────────────

    /// @notice Extra reward token at index _i (0-based).
    ///         Returns address(0) once all reward tokens are exhausted (max 8).
    function reward_tokens(uint256 _i) external view returns (address);

    /// @notice Pending extra reward amount for a user.
    function claimable_reward(address _user, address _reward_token) external view returns (uint256);

    // ── View: State ──────────────────────────────────────────────────────────

    function balanceOf(address _addr) external view returns (uint256);
    function totalSupply() external view returns (uint256);

    /// @notice The LP token staked in this gauge.
    function lp_token() external view returns (address);
}

/**
 * @notice CRV Minter — mint CRV emissions accrued in a Curve gauge.
 *
 *         Mainnet: 0xd061D61a4d941c39E5453435B6345Dc261C2fcE0
 *
 * Note: L2 Curve gauges typically do NOT use the Minter — CRV is streamed
 * as a reward token and claimed via claim_rewards() instead.
 */
interface ICurveMinter {
    /// @notice Mint all pending CRV for msg.sender from a single gauge.
    function mint(address gauge_addr) external;

    /// @notice CRV token address.
    function token() external view returns (address);
}
