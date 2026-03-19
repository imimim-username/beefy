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
import "../interfaces/IBalancerV3Router.sol";

/**
 * @title  StrategyAuraLP
 * @notice Deposits a Balancer Pool Token (BPT) into Aura Finance, harvests
 *         BAL + AURA rewards, swaps them to native/WETH, charges Beefy fees,
 *         and re-enters the Balancer pool before re-staking in Aura.
 *
 * Supports both Balancer v2 and Balancer v3 pools:
 *   - v2: re-joins via IBalancerVault.joinPool (bytes32 poolId)
 *   - v3: re-joins via IBalancerV3Router.addLiquidityUnbalanced (pool address)
 *
 * The pool version is auto-detected at initialize() time by probing getPoolId()
 * via a low-level static call. No manual version flag is required.
 *
 * Harvest flow:
 *   1. rewardPool.getReward()            -- claim BAL + AURA + extras
 *   2. swap BAL  --> native              -- via Uniswap-V2 style router
 *   3. swap AURA --> native              -- auto-detected secondary reward
 *   4. charge Beefy / strategist fees
 *   5. join Balancer pool with native    -- v2: joinPool / v3: addLiquidityUnbalanced
 *   6. booster.deposit(pid, bptBal, true)-- restake in Aura
 */
contract StrategyAuraLP is StratFeeManager, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;

    address public want;       // Balancer Pool Token (BPT)
    address public output;     // Primary reward: BAL
    address public native;     // Wrapped native (WETH) -- used as join token
    address public aura;       // Secondary reward: AURA (address(0) if undetected)

    address public booster;    // Aura Booster
    address public rewardPool; // Aura BaseRewardPool (BaseRewardPool4626)
    uint256 public pid;        // Aura pool ID

    // v2-specific
    bytes32 public balancerPoolId;
    // v3-specific
    address public balancerV3Vault;
    address public balancerV3Router;
    // 2 = Balancer v2, 3 = Balancer v3
    uint8   public balancerVersion;

    address[] public outputToNativeRoute; // [BAL, ..., WETH]

    bool private initialized;
    bool public paused;

    event Deposit(uint256 tvl);
    event Withdraw(uint256 tvl);
    event Harvest(address indexed harvester, uint256 wantHarvested, uint256 tvl);
    event Paused();
    event Unpaused();

    /**
     * @param _want               Balancer Pool Token address
     * @param _booster            Aura Booster address
     * @param _pid                Aura pool ID
     * @param _outputToNativeRoute [BAL, ..., WETH]
     * @param _balancerV3Router   Balancer v3 Router; pass address(0) for v2 pools.
     * @param _commonAddresses    {vault, unirouter, keeper, strategist, feeRecipient, feeConfig}
     */
    function initialize(
        address _want,
        address _booster,
        uint256 _pid,
        address[] calldata _outputToNativeRoute,
        address _balancerV3Router,
        CommonAddresses calldata _commonAddresses
    ) external onlyOwner {
        require(!initialized, "already initialized");
        initialized = true;

        want    = _want;
        booster = _booster;
        pid     = _pid;

        require(_outputToNativeRoute.length >= 2, "bad native route");
        output = _outputToNativeRoute[0];
        native = _outputToNativeRoute[_outputToNativeRoute.length - 1];
        outputToNativeRoute = _outputToNativeRoute;

        // Fetch rewardPool from booster
        (,,, address _rewardPool,,) = IAuraBooster(_booster).poolInfo(_pid);
        rewardPool = _rewardPool;

        // Auto-detect AURA as the first extra reward token
        if (IAuraRewardPool(_rewardPool).extraRewardsLength() > 0) {
            address extraPool = IAuraRewardPool(_rewardPool).extraRewards(0);
            aura = IAuraRewardPool(extraPool).rewardToken();
        }

        // Auto-detect Balancer v2 vs v3 by probing getPoolId()
        (bool v2ok, bytes memory v2data) = _want.staticcall(
            abi.encodeWithSignature("getPoolId()")
        );
        if (v2ok && v2data.length == 32) {
            balancerVersion = 2;
            balancerPoolId  = abi.decode(v2data, (bytes32));
        } else {
            require(_balancerV3Router != address(0), "balancerV3Router required for v3 pool");
            (bool vaultOk, bytes memory vaultData) = _want.staticcall(
                abi.encodeWithSignature("getVault()")
            );
            require(vaultOk && vaultData.length == 32, "not a recognized Balancer BPT");
            balancerVersion  = 3;
            balancerV3Vault  = abi.decode(vaultData, (address));
            balancerV3Router = _balancerV3Router;
        }

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
        uint256 fee = (wantBal * withdrawFee) / DIVISOR;
        IERC20(want).safeTransfer(beefyFeeRecipient, fee);
        IERC20(want).safeTransfer(vault, wantBal - fee);
        emit Withdraw(balanceOf());
    }

    function balanceOf()     public view returns (uint256) { return balanceOfWant() + balanceOfPool(); }
    function balanceOfWant() public view returns (uint256) { return IERC20(want).balanceOf(address(this)); }
    function balanceOfPool() public view returns (uint256) { return IAuraRewardPool(rewardPool).balanceOf(address(this)); }

    // ── Harvest ───────────────────────────────────────────────────────────────

    function harvest() external { _harvest(tx.origin); }
    function harvestWithCallFee(address _callFeeRecipient) external { _harvest(_callFeeRecipient); }

    function _harvest(address _callFeeRecipient) internal {
        IAuraRewardPool(rewardPool).getReward();

        uint256 outputBal = IERC20(output).balanceOf(address(this));
        if (outputBal > 0) {
            IUniswapRouterETH(unirouter).swapExactTokensForTokens(
                outputBal, 0, outputToNativeRoute, address(this), block.timestamp
            );
        }

        if (aura != address(0) && aura != native) {
            uint256 auraBal = IERC20(aura).balanceOf(address(this));
            if (auraBal > 0) {
                address[] memory auraRoute = new address[](2);
                auraRoute[0] = aura;
                auraRoute[1] = native;
                try IUniswapRouterETH(unirouter).swapExactTokensForTokens(
                    auraBal, 0, auraRoute, address(this), block.timestamp
                ) {} catch {}
            }
        }

        uint256 nativeBal = IERC20(native).balanceOf(address(this));
        if (nativeBal > 0) {
            _chargeFees(_callFeeRecipient);
            uint256 wantBefore = balanceOfWant();
            _joinBalancerPool();
            _deposit();
            emit Harvest(_callFeeRecipient, balanceOfWant() - wantBefore, balanceOf());
            lastHarvest = block.timestamp;
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

    function _joinBalancerPool() internal {
        uint256 nativeBal = IERC20(native).balanceOf(address(this));
        if (nativeBal == 0) return;
        if (balancerVersion == 2) {
            _joinBalancerV2(nativeBal);
        } else {
            _joinBalancerV3(nativeBal);
        }
    }

    function _joinBalancerV2(uint256 nativeBal) internal {
        (address[] memory poolTokens,,) = IBalancerVault(BALANCER_VAULT).getPoolTokens(balancerPoolId);
        uint256 nativeIdx = _findNativeIdx(poolTokens);
        uint256[] memory amounts = new uint256[](poolTokens.length);
        amounts[nativeIdx] = nativeBal;
        bytes memory userData = abi.encode(uint256(1), amounts, uint256(1));
        IBalancerVault.JoinPoolRequest memory req = IBalancerVault.JoinPoolRequest({
            assets:              poolTokens,
            maxAmountsIn:        amounts,
            userData:            userData,
            fromInternalBalance: false
        });
        IBalancerVault(BALANCER_VAULT).joinPool(balancerPoolId, address(this), address(this), req);
    }

    function _joinBalancerV3(uint256 nativeBal) internal {
        address[] memory poolTokens = IBalancerV3Vault(balancerV3Vault).getPoolTokens(want);
        uint256 nativeIdx = _findNativeIdx(poolTokens);
        uint256[] memory amounts = new uint256[](poolTokens.length);
        amounts[nativeIdx] = nativeBal;
        IBalancerV3Router(balancerV3Router).addLiquidityUnbalanced(
            want, amounts, 0, false, ""
        );
    }

    function _findNativeIdx(address[] memory tokens) internal view returns (uint256) {
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == native) return i;
        }
        revert("native not in pool");
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

    function inCaseTokensGetStuck(address _token) external onlyManager {
        require(_token != want, "!want");
        IERC20(_token).safeTransfer(msg.sender, IERC20(_token).balanceOf(address(this)));
    }

    // ── Allowances ────────────────────────────────────────────────────────────

    function _giveAllowances() internal {
        IERC20(want).approve(booster, type(uint256).max);
        IERC20(output).approve(unirouter, type(uint256).max);
        address balancerEntry = balancerVersion == 2 ? BALANCER_VAULT : balancerV3Router;
        IERC20(native).approve(balancerEntry, type(uint256).max);
        if (aura != address(0)) IERC20(aura).approve(unirouter, type(uint256).max);
    }

    function _removeAllowances() internal {
        IERC20(want).approve(booster, 0);
        IERC20(output).approve(unirouter, 0);
        address balancerEntry = balancerVersion == 2 ? BALANCER_VAULT : balancerV3Router;
        IERC20(native).approve(balancerEntry, 0);
        if (aura != address(0)) IERC20(aura).approve(unirouter, 0);
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
