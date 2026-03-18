// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IFeeConfig {
    struct FeeCategory {
        uint256 total;
        uint256 beefy;
        uint256 call;
        uint256 strategist;
        string label;
        bool active;
    }
    function getFees(address strategy) external view returns (FeeCategory memory);
    function totalFee() external view returns (uint256);
}

/**
 * @title  StratFeeManager
 * @notice Manages Beefy fee addresses and provides the fee-split helper.
 *         Strategies inherit this.
 */
contract StratFeeManager is Ownable {
    struct CommonAddresses {
        address vault;
        address unirouter;
        address keeper;
        address strategist;
        address beefyFeeRecipient;
        address beefyFeeConfig;
    }

    address public vault;
    address public unirouter;
    address public keeper;
    address public strategist;
    address public beefyFeeRecipient;
    address public beefyFeeConfig;

    uint256 public constant DIVISOR      = 1 ether;
    uint256 public constant MAX_FEE      = 0.05 ether; // 5% hard cap

    // Withdraw fee (paid by user on withdrawal, not on harvest)
    uint256 public withdrawFee           = 0.001 ether; // 0.1%
    uint256 public constant WITHDRAW_FEE_CAP = 0.005 ether; // 0.5%

    bool    public harvestOnDeposit;
    uint256 public lastHarvest;

    event SetVault(address indexed vault);
    event SetUnirouter(address indexed unirouter);
    event SetKeeper(address indexed keeper);
    event SetStrategist(address indexed strategist);
    event SetBeefyFeeRecipient(address indexed recipient);
    event SetBeefyFeeConfig(address indexed config);
    event SetWithdrawFee(uint256 fee);
    event SetHarvestOnDeposit(bool enabled);

    constructor() Ownable(msg.sender) {}

    function _initFeeManager(CommonAddresses calldata _common) internal {
        vault             = _common.vault;
        unirouter         = _common.unirouter;
        keeper            = _common.keeper;
        strategist        = _common.strategist;
        beefyFeeRecipient = _common.beefyFeeRecipient;
        beefyFeeConfig    = _common.beefyFeeConfig;
    }

    function getFees() internal view returns (IFeeConfig.FeeCategory memory) {
        return IFeeConfig(beefyFeeConfig).getFees(address(this));
    }

    modifier onlyManager() {
        require(msg.sender == owner() || msg.sender == keeper, "!manager");
        _;
    }

    function setKeeper(address _keeper) external onlyManager {
        keeper = _keeper;
        emit SetKeeper(_keeper);
    }

    function setStrategist(address _strategist) external {
        require(msg.sender == strategist, "!strategist");
        strategist = _strategist;
        emit SetStrategist(_strategist);
    }

    function setUnirouter(address _unirouter) external onlyOwner {
        unirouter = _unirouter;
        emit SetUnirouter(_unirouter);
    }

    function setBeefyFeeRecipient(address _recipient) external onlyOwner {
        beefyFeeRecipient = _recipient;
        emit SetBeefyFeeRecipient(_recipient);
    }

    function setBeefyFeeConfig(address _config) external onlyOwner {
        beefyFeeConfig = _config;
        emit SetBeefyFeeConfig(_config);
    }

    function setWithdrawFee(uint256 _fee) external onlyManager {
        require(_fee <= WITHDRAW_FEE_CAP, "fee too high");
        withdrawFee = _fee;
        emit SetWithdrawFee(_fee);
    }

    function setHarvestOnDeposit(bool _enabled) external onlyManager {
        harvestOnDeposit = _enabled;
        emit SetHarvestOnDeposit(_enabled);
    }
}
