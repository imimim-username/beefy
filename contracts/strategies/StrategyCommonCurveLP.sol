// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../utils/StratFeeManager.sol";
import "../interfaces/IUniswapRouterETH.sol";
import "../interfaces/ICurveLiquidityGauge.sol";
import "../interfaces/ICurvePool.sol";

/**
 * @title  StrategyCommonCurveLP
 * @notice Deposits a Curve LP token into a Curve LiquidityGauge (native Curve
 *         gauge or StakeDAO gauge), harvests CRV and extra rewards, swaps them
 *         to a chosen Curve pool coin, re-adds liquidity, and re-stakes.
 *
 * Supports 2-coin and 3-coin Curve pools.
 *
 * minterEnabled flag controls the reward-claim path:
 *   true  → Curve native gauge: calls ICurveMinter.mint(gauge) for CRV, then
 *            ICurveLiquidityGauge.claim_rewards() for extra rewards.
 *   false → StakeDAO / other gauges: calls claim_rewards(address(this)) which
 *            already distributes CRV + SDT + extras in one call (no Minter).
 *
 * Harvest flow:
 *   1. claim CRV (+ extras) from gauge
 *   2. swap output (CRV) → native (WETH) via outputToNativeRoute
 *   3. charge Beefy / strategist fees from native
 *   4. swap remaining native → coin via outputToCoinRoute
 *   5. single-sided add_liquidity into Curve pool
 *   6. deposit new LP back into gauge
 */
contract StrategyCommonCurveLP is StratFeeManager, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── State ────────────────────────────────────────────────────────────────

    address public want;     // Curve LP token
    address public gauge;    // Curve or StakeDAO gauge contract
    address public output;   // Primary reward: CRV
    address public native;   // Wrapped native (WETH)
    address public coin;     // Curve pool token we compound into

    address public curvePool;  // Curve pool contract (for add_liquidity)
    uint256 public coinIndex;  // Index of `coin` in the pool (0-based)
    uint256 public nCoins;     // Number of pool coins (2 or 3)

    /// @notice When true, call ICurveMinter.mint() + claim_rewards() (Curve native gauge).
    ///         When false, call claim_rewards(address) which distributes CRV too (StakeDAO).
    bool    public minterEnabled;
    address public minter;  // CRV Minter; only used when minterEnabled = true

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
     * @param _gauge              Curve or StakeDAO gauge contract
     * @param _curvePool          Curve pool contract (for add_liquidity)
     * @param _coinIndex          Index of the coin to compound into (0-based)
     * @param _nCoins             Number of coins in the pool (2 or 3)
     * @param _minterEnabled      True for Curve native gauges; false for StakeDAO
     * @param _minter             CRV Minter address (pass address(0) if !minterEnabled)
     * @param _outputToNativeRoute [CRV, ..., WETH]
     * @param _outputToCoinRoute  [WETH, ..., coin]
     * @param _commonAddresses    { vault, unirouter, keeper, strategist, feeRecipient, feeConfig }
     */
    function initialize(
        address _want,
        address _gauge,
        address _curvePool,
        uint256 _coinIndex,
        uint256 _nCoins,
        bool    _minterEnabled,
        address _minter,
        address[] calldata _outputToNativeRoute,
        address[] calldata _outputToCoinRoute,
        CommonAddresses calldata _commonAddresses
    ) external onlyOwner {
        require(!initialized, "already initialized");
        initialized = true;

        want      = _want;
        gauge     = _gauge;
        curvePool = _curvePool;
        coinIndex = _coinIndex;

        require(_nCoins == 2 || _nCoins == 3, "nCoins must be 2 or 3");
        nCoins = _nCoins;

        minterEnabled = _minterEnabled;
        minter        = _minter;

        require(_outputToNativeRoute.length >= 2, "bad native route");
        output = _outputToNativeRoute[0];
        native = _outputToNativeRoute[_outputToNativeRoute.length - 1];
        outputToNativeRoute = _outputToNativeRoute;

        require(_outputToCoinRoute.length >= 1, "bad coin route");
        outputToCoinRoute = _outputToCoinRoute;
        coin = _outputToCoinRoute[_outputToCoinRoute.length - 1];

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
            ICurveLiquidityGauge(gauge).deposit(wantBal);
            emit Deposit(balanceOf());
        }
    }

    function withdraw(uint256 _amount) external nonReentrant {
        require(msg.sender == vault, "!vault");

        uint256 wantBal = IERC20(want).balanceOf(address(this));
        if (wantBal < _amount) {
            ICurveLiquidityGauge(gauge).withdraw(_amount - wantBal);
            wantBal = IERC20(want).balanceOf(address(this));
        }
        if (wantBal > _amount) wantBal = _amount;

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
        return ICurveLiquidityGauge(gauge).balanceOf(address(this));
    }

    // ── Harvest ───────────────────────────────────────────────────────────────

    /// @notice Permissionless harvest; call-fee goes to tx.origin.
    function harvest() external { _harvest(tx.origin); }
    function harvestWithCallFee(address _callFeeRecipient) external { _harvest(_callFeeRecipient); }

    function _harvest(address _callFeeRecipient) internal {
        _claimRewards();

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

    /**
     * @dev Claim CRV (and extras) from the gauge.
     *      Curve native gauge: Minter.mint() for CRV + claim_rewards() for extras.
     *      StakeDAO gauge:     claim_rewards(this) handles CRV + SDT + extras.
     */
    function _claimRewards() internal {
        if (minterEnabled) {
            // Mint CRV emissions accrued in the gauge for this strategy
            ICurveMinter(minter).mint(gauge);
            // Claim any extra reward tokens (e.g., LDO, CVX)
            try ICurveLiquidityGauge(gauge).claim_rewards() {} catch {}
        } else {
            // StakeDAO / L2 gauges: single call distributes CRV + SDT + extras
            ICurveLiquidityGauge(gauge).claim_rewards(address(this));
        }
    }

    function _chargeFees(address _callFeeRecipient) internal {
        IFeeConfig.FeeCategory memory fees = getFees();
        uint256 nativeBal     = IERC20(native).balanceOf(address(this));
        uint256 feePortion    = (nativeBal * fees.total) / DIVISOR;
        uint256 callAmt       = (feePortion * fees.call)       / DIVISOR;
        uint256 strategistAmt = (feePortion * fees.strategist) / DIVISOR;
        uint256 beefyAmt      = feePortion - callAmt - strategistAmt;
        if (callAmt > 0)       IERC20(native).safeTransfer(_callFeeRecipient, callAmt);
        if (strategistAmt > 0) IERC20(native).safeTransfer(strategist, strategistAmt);
        if (beefyAmt > 0)      IERC20(native).safeTransfer(beefyFeeRecipient, beefyAmt);
    }

    function _addLiquidity() internal {
        uint256 nativeBal = IERC20(native).balanceOf(address(this));
        if (nativeBal == 0) return;

        if (coin != native) {
            IUniswapRouterETH(unirouter).swapExactTokensForTokens(
                nativeBal, 0, outputToCoinRoute, address(this), block.timestamp
            );
        }

        uint256 coinBal = IERC20(coin).balanceOf(address(this));
        if (coinBal == 0) return;

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
        ICurveLiquidityGauge(gauge).withdraw(balanceOfPool());
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
        ICurveLiquidityGauge(gauge).withdraw(balanceOfPool());
        IERC20(want).safeTransfer(vault, IERC20(want).balanceOf(address(this)));
    }

    function inCaseTokensGetStuck(address _token) external onlyManager {
        require(_token != want, "!want");
        IERC20(_token).safeTransfer(msg.sender, IERC20(_token).balanceOf(address(this)));
    }

    // ── Allowances ────────────────────────────────────────────────────────────

    function _giveAllowances() internal {
        IERC20(want).approve(gauge, type(uint256).max);
        IERC20(output).approve(unirouter, type(uint256).max);
        IERC20(native).approve(unirouter, type(uint256).max);
        IERC20(coin).approve(curvePool, type(uint256).max);
    }

    function _removeAllowances() internal {
        IERC20(want).approve(gauge, 0);
        IERC20(output).approve(unirouter, 0);
        IERC20(native).approve(unirouter, 0);
        IERC20(coin).approve(curvePool, 0);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    function outputToNativeRouteLength() external view returns (uint256) {
        return outputToNativeRoute.length;
    }

    function outputToCoinRouteLength() external view returns (uint256) {
        return outputToCoinRoute.length;
    }
}
