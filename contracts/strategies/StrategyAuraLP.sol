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
 *         BAL + AURA rewards, swaps them to native/WETH, charges Beefy fees,
 *         and re-enters the Balancer pool via a single-asset join before
 *         re-staking in Aura.
 *
 * Balancer Vault: 0xBA12222222228d8Ba445958a75a0704d566BF2C8 (all chains)
 *
 * Harvest flow:
 *   1. rewardPool.getReward()            -- claim BAL + AURA
 *   2. swap BAL  --> native              -- via Uniswap-V2 style router
 *   3. swap AURA --> native              -- auto-detected; simple [AURA,native] path
 *   4. charge Beefy / strategist fees
 *   5. joinPool with remaining native    -- single-asset join; index resolved dynamically
 *   6. booster.deposit(pid, bptBal, true)-- restake in Aura
 *
 * Fix log vs prior version:
 *   - nativeIndex removed; _joinBalancerPool() finds native token index at runtime
 *     so a wrong index can never silently deposit zero.
 *   - AURA secondary reward is auto-detected at init and swept on every harvest.
 *   - harvest() is now permissionless (consistent with Beefy open-harvest model).
 */
contract StrategyAuraLP is StratFeeManager, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;

    address public want;       // Balancer Pool Token (BPT)
    address public output;     // Primary reward: BAL
    address public native;     // Wrapped native (WETH) -- Balancer join token
    address public aura;       // Secondary reward: AURA (address(0) if undetected)

    address public booster;    // Aura Booster
    address public rewardPool; // Aura BaseRewardPool
    uint256 public pid;        // Aura pool ID

    bytes32 public balancerPoolId;        // from BPT.getPoolId()
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
     * @param _commonAddresses    {vault, unirouter, keeper, strategist, feeRecipient, feeConfig}
     *
     * Note: nativeIndex is NOT a parameter -- it is resolved dynamically at join time.
     */
    function initialize(
        address _want,
        address _booster,
        uint256 _pid,
        address[] calldata _outputToNativeRoute,
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

        balancerPoolId = IBalancerPool(_want).getPoolId();

        _initFeeManager(_commonAddresses);
        _giveAllowances();
    }

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

    // Permissionless harvest; call-fee goes to tx.origin
    function harvest() external { _harvest(tx.origin); }
    function harvestWithCallFee(address _callFeeRecipient) external { _harvest(_callFeeRecipient); }

    function _harvest(address _callFeeRecipient) internal {
        IAuraRewardPool(rewardPool).getReward();

        // Swap BAL -> native
        uint256 outputBal = IERC20(output).balanceOf(address(this));
        if (outputBal > 0) {
            IUniswapRouterETH(unirouter).swapExactTokensForTokens(
                outputBal, 0, outputToNativeRoute, address(this), block.timestamp
            );
        }

        // Swap AURA -> native (try/catch: pool may not exist on this router)
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

    /**
     * @dev Single-asset Balancer join (EXACT_TOKENS_IN_FOR_BPT_OUT, joinKind=1).
     *      Native token index is resolved at runtime from the pool token list.
     */
    function _joinBalancerPool() internal {
        uint256 nativeBal = IERC20(native).balanceOf(address(this));
        if (nativeBal == 0) return;

        (address[] memory poolTokens,,) = IBalancerVault(BALANCER_VAULT).getPoolTokens(balancerPoolId);

        uint256 nativeIdx = type(uint256).max;
        for (uint256 i = 0; i < poolTokens.length; i++) {
            if (poolTokens[i] == native) { nativeIdx = i; break; }
        }
        require(nativeIdx != type(uint256).max, "native not in pool");

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

    function _giveAllowances() internal {
        IERC20(want).approve(booster, type(uint256).max);
        IERC20(output).approve(unirouter, type(uint256).max);
        IERC20(native).approve(BALANCER_VAULT, type(uint256).max);
        if (aura != address(0)) IERC20(aura).approve(unirouter, type(uint256).max);
    }

    function _removeAllowances() internal {
        IERC20(want).approve(booster, 0);
        IERC20(output).approve(unirouter, 0);
        IERC20(native).approve(BALANCER_VAULT, 0);
        if (aura != address(0)) IERC20(aura).approve(unirouter, 0);
    }

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
