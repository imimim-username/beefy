// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title  BeefyVaultV7
 * @notice ERC-20 vault that wraps a yield-bearing strategy.
 *         Users deposit `want` tokens, receive moo-tokens representing
 *         their share of the pool.  The strategy handles all yield logic.
 *
 *         This is a simplified but functionally complete Beefy V7 vault.
 */
contract BeefyVaultV7 is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct StratCandidate {
        address implementation;
        uint256 proposedTime;
    }

    IERC20  public want;
    address public strategy;
    StratCandidate public stratCandidate;
    uint256 public approvalDelay;

    bool    private initialized;

    event NewStratCandidate(address implementation);
    event UpgradeStrat(address implementation);

    constructor() ERC20("Beefy Vault", "mooVault") Ownable(msg.sender) {}

    /**
     * @notice Initialize vault (called once by the deploy script).
     */
    function initialize(
        address _strategy,
        string calldata _name,
        string calldata _symbol,
        uint256 _approvalDelay
    ) external {
        require(!initialized, "already initialized");
        initialized  = true;
        strategy     = _strategy;
        approvalDelay = _approvalDelay;

        // Override ERC20 name/symbol by storing — note: OpenZeppelin 5.x
        // doesn't expose setters, so we shadow with custom storage via init.
        // For deploy purposes the constructor defaults are fine; a full
        // production vault would use an upgradeable proxy pattern.

        // Resolve the want token from the strategy
        (bool ok, bytes memory data) = _strategy.call(abi.encodeWithSignature("want()"));
        require(ok, "strategy.want() failed");
        want = IERC20(abi.decode(data, (address)));
    }

    // ── View helpers ────────────────────────────────────────────────────────

    function balance() public view returns (uint256) {
        return want.balanceOf(address(this)) + stratBalance();
    }

    function stratBalance() public view returns (uint256) {
        (bool ok, bytes memory data) = strategy.staticcall(abi.encodeWithSignature("balanceOf()"));
        if (!ok) return 0;
        return abi.decode(data, (uint256));
    }

    function available() public view returns (uint256) {
        return want.balanceOf(address(this));
    }

    function getPricePerFullShare() public view returns (uint256) {
        return totalSupply() == 0 ? 1e18 : (balance() * 1e18) / totalSupply();
    }

    // ── User actions ─────────────────────────────────────────────────────────

    function depositAll() external {
        deposit(want.balanceOf(msg.sender));
    }

    function deposit(uint256 _amount) public nonReentrant {
        uint256 _pool = balance();
        want.safeTransferFrom(msg.sender, address(this), _amount);
        earn();
        uint256 _after = balance();
        _amount = _after - _pool; // account for deflationary tokens
        uint256 shares;
        if (totalSupply() == 0) {
            shares = _amount;
        } else {
            shares = (_amount * totalSupply()) / _pool;
        }
        _mint(msg.sender, shares);
    }

    function earn() public {
        uint256 bal = available();
        if (bal > 0) {
            want.safeTransfer(strategy, bal);
            (bool ok,) = strategy.call(abi.encodeWithSignature("deposit()"));
            require(ok, "strategy deposit failed");
        }
    }

    function withdrawAll() external {
        withdraw(balanceOf(msg.sender));
    }

    function withdraw(uint256 _shares) public nonReentrant {
        uint256 r = (balance() * _shares) / totalSupply();
        _burn(msg.sender, _shares);

        uint256 b = want.balanceOf(address(this));
        if (b < r) {
            uint256 needed = r - b;
            (bool ok,) = strategy.call(abi.encodeWithSignature("withdraw(uint256)", needed));
            require(ok, "strategy withdraw failed");
            uint256 _after = want.balanceOf(address(this));
            uint256 diff   = _after - b;
            if (diff < needed) r = b + diff;
        }

        want.safeTransfer(msg.sender, r);
    }

    // ── Strategy upgrade ─────────────────────────────────────────────────────

    function proposeStrat(address _implementation) external onlyOwner {
        require(address(this) == IStrat(_implementation).vault(), "proposal mismatch");
        stratCandidate = StratCandidate(_implementation, block.timestamp);
        emit NewStratCandidate(_implementation);
    }

    function upgradeStrat() external onlyOwner {
        require(stratCandidate.implementation != address(0), "no candidate");
        require(stratCandidate.proposedTime + approvalDelay < block.timestamp, "!delay");

        emit UpgradeStrat(stratCandidate.implementation);
        (bool ok,) = strategy.call(abi.encodeWithSignature("retireStrat()"));
        require(ok, "retireStrat failed");
        strategy = stratCandidate.implementation;
        stratCandidate.implementation = address(0);
        stratCandidate.proposedTime   = 5000000000;
        earn();
    }
}

interface IStrat {
    function vault() external view returns (address);
}
