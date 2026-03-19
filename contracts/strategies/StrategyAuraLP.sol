// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../utils/StratFeeManager.sol";
import "../interfaces/IUniswapRouterETH.sol";
import "../interfaces/IAuraBooster.sol";
import "../interfaces/IAuraRewardPool.sol";
import "../interfaces/IBalancerVault.sol";

/**
 * @title  StrategyAuraLP
 * @notice Deposits a Balancer Pool Token (BPT) into Aura Finance, harvests
 *         BAL + AURA rewards, swaps them to the native/WETH token, charges
 *         Beefy fees, and re-enters the Balancer pool via a single-asset join
 *         before re-staking in Aura.
 *
 *         Balancer Vault is the same address on every chain:
 *         0xBA12222222228d8Ba445958a75a0704d566BF2C8
 *
 * Harvest flow:
 *   1. rewardPool.getReward()          — claim BAL (+ AURA from extra rewards)
 *   2. swap output → native            — via Uniswap-V2 style router
 *   3. charge Beefy / strategist fees
 *   4. joinPool with remaining native  — single-asset join into the Balancer pool
 *   5. booster.deposit(pid, bptBal, true) — restake in Aura
 */
contract StrategyAuraLP is StratFeeManager, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Balancer Vault is same address on all chains
    address public constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;

    // ── State ────────────────────────────────────────────────────────────────

    address public want;        // Balancer Pool Token (BPT)
    address public output;      // Primary reward: BAL
    address public native;      // Wrapped native (WETH) — also the join token

    address public booster;     // Aura Booster
    address public rewardPool;  // Aura BaseRewardPool (fetched from booster.poolInfo)
    uint256 public pid;         // Aura pool ID

    bytes32 public balancerPoolId;  // Balancer poolId (from BPT.getPoolId())
    uint256 public nativeIndex;     // Index of native/WETH inside the pool's token array

    address[] public outputToNativeRoute; // [BAL, ..., WETH]

    bool private initialized;
    bool public paused;

    // ── Events ───────────────────────────────────────────────────────────────

    event Deposit(uint256 tvl);
    event Withdraw(uint256 tvl);
    event Harvest(address indexed harvester, uint256 wantHarvested, uint256 tvl);
    event Paused();
    event Unpaused();

    // ── Init ─────────────────────────────────────────────────────────────────

    /**
     * @param _want               Balancer Pool Token (BPT) address
     * @param _booster            Aura Booster address
     * @param _pid                Aura pool ID (use booster.poolInfo to find it)
     * @param _nativeIndex        Index of WETH inside the Balancer pool's token array
     * @param _outputToNativeRoute Swap path: [BAL, ..., WETH]
     * @param _commonAddresses    { vault, unirouter, keeper, strategist, feeRecipient, feeConfig }
     */
    function initialize(
        address _want,
        address _booster,
        uint256 _pid,
        uint256 _nativeIndex,
        address[] calldata _outputToNativeRoute,
        CommonAddresses calldata _commonAddresses
    ) external onlyOwner {
        require(!initialized, "already initialized");
        initialized = true;

        want       = _want;
        booster    = _booster;
        pid        = _pid;
        nativeIndex = _nativeIndex;

        require(_outputToNativeRoute.length >= 2, "bad native route");
        output = _outputToNativeRoute[0];
        native = _outputToNativeRoute[_outputToNativeRoute.length - 1];
        outputToNativeRoute = _outputToNativeRoute;

        // Fetch rewardPool from booster
        (,,, address _rewardPool,,) = IAuraBooster(_booster).poolInfo(_pid);
        rewardPool = _rewardPool;

        // Fetch Balancer poolId from the BPT
        balancerPoolId = IBalancerPool(_want).getPoolId();

        _initFeeManager(_commonAddresses);
        _giveAllowances();
    }

    // ── Vault interface ───────────────────────────────────────────────────────

    function deposit() external nonReentrant {
        require(!paused, "paused");
        _deposit();
    }

    function _deposit() internal {
        uint256 wantBal = IERC20(want).balanceOf(address(this));
        if (wantBal > 0) {
            IAuraBooster(booster).deposit(pid, wantBal, true);
            emit Deposit(balanceOf());
        }
    }

    function withdraw(uint256 _amount) external nonReentrant {
        require(msg.sender == vault, "!vault");

        uint256 wantBal = IERC20(want).balanceOf(address(this));
        if (wantBal < _amount) {
            IAuraRewardPool(rewardPool).withdrawAndUnwrap(_amount - wantBal, false);
            wantBal = IERC20(want).balanceOf(address(this));
        }
        if (wantBal > _amount) wantBal = _amount;

        // Withdraw fee
        uint256 fee = (wantBal * withdrawFee) / DIVISOR;
        IERC20(want).safeTransfer(beefyFeeRecipient, fee);
        IERC20(want).safeTransfer(vault, wantBal - fee);
        emit Withdraw(balanceOf());
    }

    function balanceOf() public view returns (uint256) {
        return balanceOfWant() + balanceOfPool();
    }

    function balanceOfWant() public view returns (uint256) {
        return IERC20(want).balanceOf(address(this));
    }

    function balanceOfPool() public view returns (uint256) {
        return IAuraRewardPool(rewardPool).balanceOf(address(this));
    }

    // ── Harvest ───────────────────────────────────────────────────────────────

    function harvest() external onlyManager {
        _harvest(msg.sender);
    }

    function harvestWithCallFee(address _callFeeRecipient) external {
        _harvest(_callFeeRecipient);
    }

    function _harvest(address _callFeeRecipient) internal {
        // Claim BAL + any extra rewards (AURA) from Aura's reward pool
        IAuraRewardPool(rewardPool).getReward();

        // Swap primary output (BAL) to native
        uint256 outputBal = IERC20(output).balanceOf(address(this));
        if (outputBal > 0) {
            IUniswapRouterETH(unirouter).swapExactTokensForTokens(
                outputBal, 0, outputToNativeRoute, address(this), block.timestamp
            );
        }

        uint256 nativeBal = IERC20(native).balanceOf(address(this));
        if (nativeBal > 0) {
            _chargeFees(_callFeeRecipient);
            uint256 wantBefore = balanceOfWant();
            _joinBalancerPool();
            _deposit();
            uint256 wantHarvested = balanceOfWant() - wantBefore;
            lastHarvest = block.timestamp;
            emit Harvest(_callFeeRecipient, wantHarvested, balanceOf());
        }
    }

    function _chargeFees(address _callFeeRecipient) internal {
        IFeeConfig.FeeCategory memory fees = getFees();
        uint256 nativeBal    = IERC20(native).balanceOf(address(this));
        uint256 feePortion   = (nativeBal * fees.total) / DIVISOR;

        uint256 callAmt      = (feePortion * fees.call)       / DIVISOR;
        uint256 strategistAmt = (feePortion * fees.strategist) / DIVISOR;
        uint256 beefyAmt     = feePortion - callAmt - strategistAmt;

        if (callAmt > 0)       IERC20(native).safeTransfer(_callFeeRecipient, callAmt);
        if (strategistAmt > 0) IERC20(native).safeTransfer(strategist, strategistAmt);
        if (beefyAmt > 0)      IERC20(native).safeTransfer(beefyFeeRecipient, beefyAmt);
    }

    /**
     * @dev Single-asset join: deposit all remaining native/WETH into the
     *      Balancer pool using EXACT_TOKENS_IN_FOR_BPT_OUT (joinKind = 1).
     */
    function _joinBalancerPool() internal {
        uint256 nativeBal = IERC20(native).balanceOf(address(this));
        if (nativeBal == 0) return;

        (address[] memory poolTokens,,) = IBalancerVault(BALANCER_VAULT)
            .getPoolTokens(balancerPoolId);

        uint256[] memory amounts = new uint256[](poolTokens.length);
        amounts[nativeIndex] = nativeBal;

        // userData: abi.encode(JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT=1, amountsIn, minimumBPT=1)
        bytes memory userData = abi.encode(uint256(1), amounts, uint256(1));

        IBalancerVault.JoinPoolRequest memory request = IBalancerVault.JoinPoolRequest({
            assets:             poolTokens,
            maxAmountsIn:       amounts,
            userData:           userData,
            fromInternalBalance: false
        });

        IBalancerVault(BALANCER_VAULT).joinPool(
            balancerPoolId,
            address(this),
            address(this),
            request
        );
    }

    // ── Emergency ─────────────────────────────────────────────────────────────

    function panic() external onlyManager {
        paused = true;
        IAuraRewardPool(rewardPool).withdrawAndUnwrap(balanceOfPool(), false);
        _removeAllowances();
        emit Paused();
    }

    function pause() external onlyManager {
        paused = true;
        _removeAllowances();
        emit Paused();
    }

    function unpause() external onlyManager {
        paused = false;
        _giveAllowances();
        _deposit();
        emit Unpaused();
    }

    function retireStrat() external {
        require(msg.sender == vault, "!vault");
        IAuraRewardPool(rewardPool).withdrawAndUnwrap(balanceOfPool(), false);
        IERC20(want).safeTransfer(vault, IERC20(want).balanceOf(address(this)));
    }

    // Rescue stuck tokens (e.g., AURA bonus rewards)
    function inCaseTokensGetStuck(address _token) external onlyManager {
        require(_token != want, "!want");
        uint256 bal = IERC20(_token).balanceOf(address(this));
        IERC20(_token).safeTransfer(msg.sender, bal);
    }

    // ── Allowances ────────────────────────────────────────────────────────────

    function _giveAllowances() internal {
        IERC20(want).approve(booster, type(uint256).max);
        IERC20(output).approve(unirouter, type(uint256).max);
        IERC20(native).approve(BALANCER_VAULT, type(uint256).max);
    }

    function _removeAllowances() internal {
        IERC20(want).approve(booster, 0);
        IERC20(output).approve(unirouter, 0);
        IERC20(native).approve(BALANCER_VAULT, 0);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    function rewardsAvailable() public view returns (uint256) {
        return IAuraRewardPool(rewardPool).earned(address(this));
    }

    function callReward() external view returns (uint256) {
        IFeeConfig.FeeCategory memory fees = getFees();
        return rewardsAvailable() * fees.total / DIVISOR * fees.call / DIVISOR;
    }

    function outputToNativeRouteLength() external view returns (uint256) {
        return outputToNativeRoute.length;
    }
}
