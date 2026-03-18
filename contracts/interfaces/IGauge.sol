// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IGauge {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function getReward(address account, address[] calldata tokens) external;
    function getReward() external;
    function earned(address token, address account) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function rewardToken() external view returns (address);
    // Velodrome / Aerodrome
    function stake() external view returns (address);
    function stakingToken() external view returns (address);
}
