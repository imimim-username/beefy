// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../utils/StratFeeManager.sol";
import "../interfaces/IUniswapRouterETH.sol";
import "../interfaces/IConvexBooster.sol";
import "../interfaces/IConvexRewardPool.sol";
import "../interfaces/ICurvePool.sol";

/**
 * @title  StrategyCurveConvexLP
 * @notice Deposits a Curve LP token into Convex Finance, harvests CRV + CVX
 *         rewards, swaps them to an underlying Curve pool token, re-adds
 *         liquidity, and re-stakes on Convex.
 *
 * Supports 2-coin and 3-coin Curve pools (set nCoins at initialize time).
 *
 * Harvest flow:
 *   1. rewardPool.getReward(this, true)  — claim CRV + CVX + extras
 *   2. swap output (CRV) → native (WETH) via outputToNativeRoute
 *   3. charge Beefy / strategist fees from native
 *   4. swap remaining native → coin (outputToCoinRoute)
 *   5. add_liquidity to Curve pool at coinIndex
 *   6. booster.deposit(pid, lpBal, true) — restake on Convex
 */
contract StrategyCurveConvexLP is StratFeeManager, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── State ────────────────────────────────────────────────────────────────

    address public want;     // Curve LP token
    address public output;   // Primary reward: CRV
    address public native;   // Wrapped native (WETH)
    address public coin;     // The Curve pool token we re-add liquidity as

    address public booster;    // Convex Booster
    address public rewardPool; // Convex BaseRewardPool (from booster.poolInfo)
    uint256 public pid;        // Convex pool ID

    address public curvePool;  // Curve pool contract
    uint256 public coinIndex;  // Index of `coin` in the pool (0-based)
    uint256 public nCoins;     // Number of coins in the pool (2 or 3)

    address[] public outputToNativeRoute; // [CRV, ..., WETH]
    address[] public outputToCoinRoute;   // [WETH, ..., coin]

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
     * @param _want               Curve LP token address
     * @param _booster            Convex Booster address
     * @param _pid                Convex pool ID
     * @param _curvePool          Curve pool contract (for add_liquidity)
     * @param _coinIndex          Index of the token we compound into (0 or 1, or 2 for 3-coin)
     * @param _nCoins             Number of coins in the pool (2 or 3)
     * @param _outputToNativeRoute [CRV, ..., WETH]
     * @param _outputToCoinRoute  [WETH, ..., coin] — coin must match pool.coins(coinIndex)
     * @param _commonAddresses    { vault, unirouter, keeper, strategist, feeRecipient, feeConfig }
     */
    function initialize(
        address _want,
        address _booster,
        uint256 _pid,
        address _curvePool,
        uint256 _coinIndex,
        uint256 _nCoins,
        address[] calldata _outputToNativeRoute,
        address[] calldata _outputToCoinRoute,
        CommonAddresses calldata _commonAddresses
    ) external onlyOwner {
        require(!initialized, "already initialized");
        initialized = true;

        want      = _want;
        booster   = _booster;
        pid       = _pid;
        curvePool = _curvePool;
        coinIndex = _coinIndex;

        require(_nCoins == 2 || _nCoins == 3, "nCoins must be 2 or 3");
        nCoins = _nCoins;

        require(_outputToNativeRoute.length >= 2, "bad native route");
        output = _outputToNativeRoute[0];
        native = _outputToNativeRoute[_outputToNativeRoute.length - 1];
        outputToNativeRoute = _outputToNativeRoute;

        require(_outputToCoinRoute.length >= 1, "bad coin route");
        outputToCoinRoute = _outputToCoinRoute;
        coin = _outputToCoinRoute[_outputToCoinRoute.length - 1];

        // Fetch rewardPool from Convex booster
        (,,, address _rewardPool,,) = IConvexBooster(_booster).poolInfo(_pid);
        rewardPool = _rewardPool;

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
            IConvexBooster(booster).deposit(pid, wantBal, true);
            emit Deposit(balanceOf());
        }
    }

    function withdraw(uint256 _amount) external nonReentrant {
        require(msg.sender == vault, "!vault");

        uint256 wantBal = IERC20(want).balanceOf(address(this));
        if (wantBal < _amount) {
            IConvexRewardPool(rewardPool).withdrawAndUnwrap(_amount - wantBal, false);
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
        return IConvexRewardPool(rewardPool).balanceOf(address(this));
    }

    // ── Harvest ───────────────────────────────────────────────────────────────

    function harvest() external onlyManager {
        _harvest(msg.sender);
    }

    function harvestWithCallFee(address _callFeeRecipient) external {
        _harvest(_callFeeRecipient);
    }

    function _harvest(address _callFeeRecipient) internal {
        // Claim CRV + CVX + any extra rewards
        IConvexRewardPool(rewardPool).getReward(address(this), true);

        // Swap primary output (CRV) → native (WETH)
        uint256 outputBal = IERC20(output).balanceOf(address(this));
        if (outputBal > 0 && output != native) {
            IUniswapRouterETH(unirouter).swapExactTokensForTokens(
                outputBal, 0, outputToNativeRoute, address(this), block.timestamp
            );
        }

        uint256 nativeBal = IERC20(native).balanceOf(address(this));
        if (nativeBal > 0) {
            _chargeFees(_callFeeRecipient);
            uint256 wantBefore = balanceOfWant();
            _addLiquidity();
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
     * @dev Swap remaining native → coin, then single-sided add_liquidity into the Curve pool.
     */
    function _addLiquidity() internal {
        uint256 nativeBal = IERC20(native).balanceOf(address(this));
        if (nativeBal == 0) return;

        // Swap native → coin (unless native IS the coin)
        if (coin != native) {
            IUniswapRouterETH(unirouter).swapExactTokensForTokens(
                nativeBal, 0, outputToCoinRoute, address(this), block.timestamp
            );
        }

        uint256 coinBal = IERC20(coin).balanceOf(address(this));
        if (coinBal == 0) return;

        // Single-sided add_liquidity — branch on nCoins
        if (nCoins == 2) {
            uint256[2] memory amounts;
            amounts[coinIndex] = coinBal;
            ICurvePool2(curvePool).add_liquidity(amounts, 0);
        } else {
            uint256[3] memory amounts;
            amounts[coinIndex] = coinBal;
            ICurvePool3(curvePool).add_liquidity(amounts, 0);
        }
    }

    // ── Emergency ─────────────────────────────────────────────────────────────

    function panic() external onlyManager {
        paused = true;
        IConvexRewardPool(rewardPool).withdrawAndUnwrap(balanceOfPool(), false);
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
        IConvexRewardPool(rewardPool).withdrawAndUnwrap(balanceOfPool(), false);
        IERC20(want).safeTransfer(vault, IERC20(want).balanceOf(address(this)));
    }

    // Rescue stuck tokens (e.g., CVX bonus rewards)
    function inCaseTokensGetStuck(address _token) external onlyManager {
        require(_token != want, "!want");
        uint256 bal = IERC20(_token).balanceOf(address(this));
        IERC20(_token).safeTransfer(msg.sender, bal);
    }

    // ── Allowances ────────────────────────────────────────────────────────────

    function _giveAllowances() internal {
        IERC20(want).approve(booster, type(uint256).max);
        IERC20(output).approve(unirouter, type(uint256).max);
        IERC20(native).approve(unirouter, type(uint256).max);
        IERC20(coin).approve(curvePool, type(uint256).max);
    }

    function _removeAllowances() internal {
        IERC20(want).approve(booster, 0);
        IERC20(output).approve(unirouter, 0);
        IERC20(native).approve(unirouter, 0);
        IERC20(coin).approve(curvePool, 0);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    function rewardsAvailable() public view returns (uint256) {
        return IConvexRewardPool(rewardPool).earned(address(this));
    }

    function callReward() external view returns (uint256) {
        IFeeConfig.FeeCategory memory fees = getFees();
        return rewardsAvailable() * fees.total / DIVISOR * fees.call / DIVISOR;
    }

    function outputToNativeRouteLength() external view returns (uint256) {
        return outputToNativeRoute.length;
    }

    function outputToCoinRouteLength() external view returns (uint256) {
        return outputToCoinRoute.length;
    }
}
