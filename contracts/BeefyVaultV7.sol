// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title  BeefyVaultV7
 * @notice ERC-20 vault that wraps a yield-bearing strategy.
 *         Users deposit `want` tokens and receive moo-tokens (shares).
 *
 * This is a simplified but functionally complete Beefy V7 vault intended
 * for direct deployment (not proxy/clone).  It stores vault name and symbol
 * in custom storage slots so initialize() can set them correctly even though
 * OpenZeppelin 5.x ERC20 initialises them in the constructor.
 *
 * Fix log:
 *   - _vaultName / _vaultSymbol storage overrides so each vault has its own
 *     name and symbol rather than the constructor default "Beefy Vault"/"mooVault".
 *   - proposeStrat() validates that the candidate strategy's want token matches
 *     the vault's want token, preventing accidental strategy swaps.
 */
contract BeefyVaultV7 is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct StratCandidate {
        address implementation;
        uint256 proposedTime;
    }

    // Custom name/symbol storage — override ERC20's constructor-locked values
    string private _vaultName;
    string private _vaultSymbol;

    IERC20  public want;
    address public strategy;
    StratCandidate public stratCandidate;
    uint256 public approvalDelay;

    bool private initialized;

    event NewStratCandidate(address implementation);
    event UpgradeStrat(address implementation);

    constructor() ERC20("Beefy Vault", "mooVault") Ownable(msg.sender) {}

    // ── ERC20 name/symbol overrides ──────────────────────────────────────────

    function name()   public view override returns (string memory) {
        return bytes(_vaultName).length > 0 ? _vaultName   : super.name();
    }

    function symbol() public view override returns (string memory) {
        return bytes(_vaultSymbol).length > 0 ? _vaultSymbol : super.symbol();
    }

    // ── Initializer ──────────────────────────────────────────────────────────

    /**
     * @notice Called once by the deploy script after deployment.
     *         Equivalent to what BeefyVaultV7Factory would call on a fresh clone.
     */
    function initialize(
        address _strategy,
        string calldata _name,
        string calldata _symbol,
        uint256 _approvalDelay
    ) external {
        require(!initialized, "already initialized");
        initialized   = true;
        strategy      = _strategy;
        approvalDelay = _approvalDelay;
        _vaultName    = _name;
        _vaultSymbol  = _symbol;

        // Resolve the want token from the strategy
        (bool ok, bytes memory data) = _strategy.call(abi.encodeWithSignature("want()"));
        require(ok, "strategy.want() failed");
        want = IERC20(abi.decode(data, (address)));
    }

    // ── View helpers ─────────────────────────────────────────────────────────

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
        _amount = _after - _pool;
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
        // Vault reference must match
        require(address(this) == IStrat(_implementation).vault(), "proposal mismatch");
        // Want token must match to prevent deploying a strategy for a different asset
        (bool ok, bytes memory data) = _implementation.staticcall(abi.encodeWithSignature("want()"));
        require(ok, "candidate want() failed");
        require(abi.decode(data, (address)) == address(want), "different want");
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
