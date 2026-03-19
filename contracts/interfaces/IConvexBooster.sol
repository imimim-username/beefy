// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IConvexBooster {
    function deposit(uint256 pid, uint256 amount, bool stake) external returns (bool);
    function withdraw(uint256 pid, uint256 amount) external returns (bool);
    function earmarkRewards(uint256 pid) external;
    function poolInfo(uint256 pid) external view returns (
        address lptoken,
        address token,
        address gauge,
        address crvRewards,  // BaseRewardPool (IConvexRewardPool)
        address stash,
        bool shutdown
    );
}
