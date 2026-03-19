// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IConvexRewardPool {
    function getReward() external;
    function getReward(address account, bool claimExtras) external;
    function withdrawAndUnwrap(uint256 amount, bool claim) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function earned(address account) external view returns (uint256);
    function periodFinish() external view returns (uint256);
    function rewardToken() external view returns (address);
    function extraRewardsLength() external view returns (uint256);
    function extraRewards(uint256 index) external view returns (address);
}
