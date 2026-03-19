// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Curve 2-coin pool
interface ICurvePool2 {
    function add_liquidity(uint256[2] calldata amounts, uint256 minMintAmount) external returns (uint256);
    function remove_liquidity_one_coin(uint256 amount, int128 i, uint256 minAmount) external returns (uint256);
    function coins(uint256 i) external view returns (address);
    function get_virtual_price() external view returns (uint256);
}

// Curve 3-coin pool
interface ICurvePool3 {
    function add_liquidity(uint256[3] calldata amounts, uint256 minMintAmount) external returns (uint256);
    function remove_liquidity_one_coin(uint256 amount, int128 i, uint256 minAmount) external returns (uint256);
    function coins(uint256 i) external view returns (address);
    function get_virtual_price() external view returns (uint256);
}
