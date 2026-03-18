// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../utils/StratFeeManager.sol";
import "../interfaces/IUniswapRouterETH.sol";
import "../interfaces/IMasterChef.sol";

/**
 * @title  StrategyCommonChefLP
 * @notice Deposits a Uniswap-V2-style LP token into any MasterChef/Chef fork,
 *         harvests reward tokens, swaps them back to more LP, and re-stakes.
 *
 * Supports any chef that follows the standard:
 *   deposit(pid, amount) / withdraw(pid, amount) / emergencyWithdraw(pid)
 *
 * Swap routes are passed at initialize() time and govern how rewards are
 * converted back to the two underlying tokens.
 */
contract StrategyCommonChefLP is StratFeeManager, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── State ────────────────────────────────────────────────────────────────

    address public want;       // the LP token being farmed
    address public output;     // primary reward token (index 0 of outputToNativeRoute)
    address public native;     // wrapped native (e.g. WBNB)
    address public lpToken0;
    address public lpToken1;

    address public chef;
    uint256 public poolId;

    address[] public outputToNativeRoute;
    address[] public outputToLp0Route;
    address[] public outputToLp1Route;

    bool     private initialized;
    bool     public paused;

    // ── Events ───────────────────────────────────────────────────────────────

    event Deposit(uint256 tvl);
    event Withdraw(uint256 tvl);
    event Harvest(address indexed harvester, uint256 wantHarvested, uint256 tvl);
    event Paused();
    event Unpaused();

    // ── Init ─────────────────────────────────────────────────────────────────

    /**
     * @param _want               LP token address
     * @param _poolId             MasterChef pool id
     * @param _chef               MasterChef address
     * @param _outputToNativeRoute  [output, ..., native]
     * @param _outputToLp0Route     [output, ..., token0]
     * @param _outputToLp1Route     [output, ..., token1]
     * @param _commonAddresses    struct { vault, unirouter, keeper, strategist, feeRecipient, feeConfig }
     */
    function initialize(
        address _want,
        uint256 _poolId,
        address _chef,
        address[] calldata _outputToNativeRoute,
        address[] calldata _outputToLp0Route,
        address[] calldata _outputToLp1Route,
        CommonAddresses calldata _commonAddresses
    ) external onlyOwner {
        require(!initialized, "already initialized");
        initialized = true;

        want   = _want;
        poolId = _poolId;
        chef   = _chef;

        require(_outputToNativeRoute.length >= 2, "bad native route");
        require(_outputToLp0Route.length >= 1,   "bad lp0 route");
        require(_outputToLp1Route.length >= 1,   "bad lp1 route");

        output = _outputToNativeRoute[0];
        native = _outputToNativeRoute[_outputToNativeRoute.length - 1];
        outputToNativeRoute = _outputToNativeRoute;
        outputToLp0Route    = _outputToLp0Route;
        outputToLp1Route    = _outputToLp1Route;

        // Derive lpToken0/lpToken1 from the want LP
        (bool ok0, bytes memory d0) = _want.staticcall(abi.encodeWithSignature("token0()"));
        (bool ok1, bytes memory d1) = _want.staticcall(abi.encodeWithSignature("token1()"));
        require(ok0 && ok1, "not a valid LP token");
        lpToken0 = abi.decode(d0, (address));
        lpToken1 = abi.decode(d1, (address));

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
            IMasterChef(chef).deposit(poolId, wantBal);
            emit Deposit(balanceOf());
        }
    }

    function withdraw(uint256 _amount) external nonReentrant {
        require(msg.sender == vault, "!vault");

        uint256 wantBal = IERC20(want).balanceOf(address(this));
        if (wantBal < _amount) {
            IMasterChef(chef).withdraw(poolId, _amount - wantBal);
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
        (uint256 amount,) = IMasterChef(chef).userInfo(poolId, address(this));
        return amount;
    }

    // ── Harvest ───────────────────────────────────────────────────────────────

    function harvest() external onlyManager {
        _harvest(msg.sender);
    }

    function harvestWithCallFee(address _callFeeRecipient) external {
        _harvest(_callFeeRecipient);
    }

    function _harvest(address _callFeeRecipient) internal {
        // Claim rewards by depositing 0
        IMasterChef(chef).deposit(poolId, 0);

        uint256 outputBal = IERC20(output).balanceOf(address(this));
        if (outputBal > 0) {
            _chargeFees(_callFeeRecipient);
            _addLiquidity();
            uint256 wantHarvested = balanceOfWant();
            _deposit();
            lastHarvest = block.timestamp;
            emit Harvest(_callFeeRecipient, wantHarvested, balanceOf());
        }
    }

    function _chargeFees(address _callFeeRecipient) internal {
        IFeeConfig.FeeCategory memory fees = getFees();
        uint256 outputBal = IERC20(output).balanceOf(address(this));
        uint256 toNative  = (outputBal * fees.total) / DIVISOR;

        // Swap output → native
        if (output != native) {
            IUniswapRouterETH(unirouter).swapExactTokensForTokens(
                toNative, 0, outputToNativeRoute, address(this), block.timestamp
            );
        }

        uint256 nativeBal = IERC20(native).balanceOf(address(this));

        uint256 callAmt       = (nativeBal * fees.call)       / DIVISOR;
        uint256 strategistAmt = (nativeBal * fees.strategist) / DIVISOR;
        uint256 beefyAmt      = nativeBal - callAmt - strategistAmt;

        if (callAmt > 0)       IERC20(native).safeTransfer(_callFeeRecipient, callAmt);
        if (strategistAmt > 0) IERC20(native).safeTransfer(strategist, strategistAmt);
        if (beefyAmt > 0)      IERC20(native).safeTransfer(beefyFeeRecipient, beefyAmt);
    }

    function _addLiquidity() internal {
        uint256 outputBal = IERC20(output).balanceOf(address(this));
        uint256 half      = outputBal / 2;

        // Swap half → token0
        if (lpToken0 != output) {
            IUniswapRouterETH(unirouter).swapExactTokensForTokens(
                half, 0, outputToLp0Route, address(this), block.timestamp
            );
        }

        // Swap other half → token1
        if (lpToken1 != output) {
            IUniswapRouterETH(unirouter).swapExactTokensForTokens(
                outputBal - half, 0, outputToLp1Route, address(this), block.timestamp
            );
        }

        uint256 lp0Bal = IERC20(lpToken0).balanceOf(address(this));
        uint256 lp1Bal = IERC20(lpToken1).balanceOf(address(this));

        IUniswapRouterETH(unirouter).addLiquidity(
            lpToken0, lpToken1, lp0Bal, lp1Bal, 1, 1, address(this), block.timestamp
        );
    }

    // ── Emergency ─────────────────────────────────────────────────────────────

    function panic() external onlyManager {
        paused = true;
        IMasterChef(chef).emergencyWithdraw(poolId);
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
        IMasterChef(chef).emergencyWithdraw(poolId);
        IERC20(want).safeTransfer(vault, IERC20(want).balanceOf(address(this)));
    }

    // ── Allowances ────────────────────────────────────────────────────────────

    function _giveAllowances() internal {
        IERC20(want).approve(chef, type(uint256).max);
        IERC20(output).approve(unirouter, type(uint256).max);
        IERC20(lpToken0).approve(unirouter, type(uint256).max);
        IERC20(lpToken1).approve(unirouter, type(uint256).max);
    }

    function _removeAllowances() internal {
        IERC20(want).approve(chef, 0);
        IERC20(output).approve(unirouter, 0);
        IERC20(lpToken0).approve(unirouter, 0);
        IERC20(lpToken1).approve(unirouter, 0);
    }
}
