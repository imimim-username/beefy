// Sources flattened with hardhat v2.28.6 https://hardhat.org

// SPDX-License-Identifier: MIT

// File @openzeppelin/contracts/utils/Context.sol@v5.6.1

// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

pragma solidity ^0.8.20;

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}


// File @openzeppelin/contracts/access/Ownable.sol@v5.6.1

// OpenZeppelin Contracts (last updated v5.0.0) (access/Ownable.sol)

pragma solidity ^0.8.20;

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * The initial owner is set to the address provided by the deployer. This can
 * later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    /**
     * @dev The caller account is not authorized to perform an operation.
     */
    error OwnableUnauthorizedAccount(address account);

    /**
     * @dev The owner is not a valid owner account. (eg. `address(0)`)
     */
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the address provided by the deployer as the initial owner.
     */
    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(initialOwner);
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        if (owner() != _msgSender()) {
            revert OwnableUnauthorizedAccount(_msgSender());
        }
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}


// File @openzeppelin/contracts/utils/introspection/IERC165.sol@v5.6.1

// OpenZeppelin Contracts (last updated v5.4.0) (utils/introspection/IERC165.sol)

pragma solidity >=0.4.16;

/**
 * @dev Interface of the ERC-165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[ERC].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[ERC section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}


// File @openzeppelin/contracts/interfaces/IERC165.sol@v5.6.1

// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC165.sol)

pragma solidity >=0.4.16;


// File @openzeppelin/contracts/token/ERC20/IERC20.sol@v5.6.1

// OpenZeppelin Contracts (last updated v5.4.0) (token/ERC20/IERC20.sol)

pragma solidity >=0.4.16;

/**
 * @dev Interface of the ERC-20 standard as defined in the ERC.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the value of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the value of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the
     * allowance mechanism. `value` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}


// File @openzeppelin/contracts/interfaces/IERC20.sol@v5.6.1

// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC20.sol)

pragma solidity >=0.4.16;


// File @openzeppelin/contracts/interfaces/IERC1363.sol@v5.6.1

// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC1363.sol)

pragma solidity >=0.6.2;


/**
 * @title IERC1363
 * @dev Interface of the ERC-1363 standard as defined in the https://eips.ethereum.org/EIPS/eip-1363[ERC-1363].
 *
 * Defines an extension interface for ERC-20 tokens that supports executing code on a recipient contract
 * after `transfer` or `transferFrom`, or code on a spender contract after `approve`, in a single transaction.
 */
interface IERC1363 is IERC20, IERC165 {
    /*
     * Note: the ERC-165 identifier for this interface is 0xb0202a11.
     * 0xb0202a11 ===
     *   bytes4(keccak256('transferAndCall(address,uint256)')) ^
     *   bytes4(keccak256('transferAndCall(address,uint256,bytes)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256,bytes)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256,bytes)'))
     */

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @param data Additional data with no specified format, sent in call to `spender`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value, bytes calldata data) external returns (bool);
}


// File @openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol@v5.6.1

// OpenZeppelin Contracts (last updated v5.5.0) (token/ERC20/utils/SafeERC20.sol)

pragma solidity ^0.8.20;


/**
 * @title SafeERC20
 * @dev Wrappers around ERC-20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for IERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    /**
     * @dev An operation with an ERC-20 token failed.
     */
    error SafeERC20FailedOperation(address token);

    /**
     * @dev Indicates a failed `decreaseAllowance` request.
     */
    error SafeERC20FailedDecreaseAllowance(address spender, uint256 currentAllowance, uint256 requestedDecrease);

    /**
     * @dev Transfer `value` amount of `token` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        if (!_safeTransfer(token, to, value, true)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Transfer `value` amount of `token` from `from` to `to`, spending the approval given by `from` to the
     * calling contract. If `token` returns no value, non-reverting calls are assumed to be successful.
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        if (!_safeTransferFrom(token, from, to, value, true)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Variant of {safeTransfer} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransfer(IERC20 token, address to, uint256 value) internal returns (bool) {
        return _safeTransfer(token, to, value, false);
    }

    /**
     * @dev Variant of {safeTransferFrom} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransferFrom(IERC20 token, address from, address to, uint256 value) internal returns (bool) {
        return _safeTransferFrom(token, from, to, value, false);
    }

    /**
     * @dev Increase the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 oldAllowance = token.allowance(address(this), spender);
        forceApprove(token, spender, oldAllowance + value);
    }

    /**
     * @dev Decrease the calling contract's allowance toward `spender` by `requestedDecrease`. If `token` returns no
     * value, non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeDecreaseAllowance(IERC20 token, address spender, uint256 requestedDecrease) internal {
        unchecked {
            uint256 currentAllowance = token.allowance(address(this), spender);
            if (currentAllowance < requestedDecrease) {
                revert SafeERC20FailedDecreaseAllowance(spender, currentAllowance, requestedDecrease);
            }
            forceApprove(token, spender, currentAllowance - requestedDecrease);
        }
    }

    /**
     * @dev Set the calling contract's allowance toward `spender` to `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful. Meant to be used with tokens that require the approval
     * to be set to zero before setting it to a non-zero value, such as USDT.
     *
     * NOTE: If the token implements ERC-7674, this function will not modify any temporary allowance. This function
     * only sets the "standard" allowance. Any temporary allowance will remain active, in addition to the value being
     * set here.
     */
    function forceApprove(IERC20 token, address spender, uint256 value) internal {
        if (!_safeApprove(token, spender, value, false)) {
            if (!_safeApprove(token, spender, 0, true)) revert SafeERC20FailedOperation(address(token));
            if (!_safeApprove(token, spender, value, true)) revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} transferAndCall, with a fallback to the simple {ERC20} transfer if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that relies on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            safeTransfer(token, to, value);
        } else if (!token.transferAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} transferFromAndCall, with a fallback to the simple {ERC20} transferFrom if the target
     * has no code. This can be used to implement an {ERC721}-like safe transfer that relies on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferFromAndCallRelaxed(
        IERC1363 token,
        address from,
        address to,
        uint256 value,
        bytes memory data
    ) internal {
        if (to.code.length == 0) {
            safeTransferFrom(token, from, to, value);
        } else if (!token.transferFromAndCall(from, to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} approveAndCall, with a fallback to the simple {ERC20} approve if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * NOTE: When the recipient address (`to`) has no code (i.e. is an EOA), this function behaves as {forceApprove}.
     * Oppositely, when the recipient address (`to`) has code, this function only attempts to call {ERC1363-approveAndCall}
     * once without retrying, and relies on the returned value to be true.
     *
     * Reverts if the returned value is other than `true`.
     */
    function approveAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            forceApprove(token, to, value);
        } else if (!token.approveAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity `token.transfer(to, value)` call, relaxing the requirement on the return value: the
     * return value is optional (but if data is returned, it must not be false).
     *
     * @param token The token targeted by the call.
     * @param to The recipient of the tokens
     * @param value The amount of token to transfer
     * @param bubble Behavior switch if the transfer call reverts: bubble the revert reason or return a false boolean.
     */
    function _safeTransfer(IERC20 token, address to, uint256 value, bool bubble) private returns (bool success) {
        bytes4 selector = IERC20.transfer.selector;

        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(0x00, selector)
            mstore(0x04, and(to, shr(96, not(0))))
            mstore(0x24, value)
            success := call(gas(), token, 0, 0x00, 0x44, 0x00, 0x20)
            // if call success and return is true, all is good.
            // otherwise (not success or return is not true), we need to perform further checks
            if iszero(and(success, eq(mload(0x00), 1))) {
                // if the call was a failure and bubble is enabled, bubble the error
                if and(iszero(success), bubble) {
                    returndatacopy(fmp, 0x00, returndatasize())
                    revert(fmp, returndatasize())
                }
                // if the return value is not true, then the call is only successful if:
                // - the token address has code
                // - the returndata is empty
                success := and(success, and(iszero(returndatasize()), gt(extcodesize(token), 0)))
            }
            mstore(0x40, fmp)
        }
    }

    /**
     * @dev Imitates a Solidity `token.transferFrom(from, to, value)` call, relaxing the requirement on the return
     * value: the return value is optional (but if data is returned, it must not be false).
     *
     * @param token The token targeted by the call.
     * @param from The sender of the tokens
     * @param to The recipient of the tokens
     * @param value The amount of token to transfer
     * @param bubble Behavior switch if the transfer call reverts: bubble the revert reason or return a false boolean.
     */
    function _safeTransferFrom(
        IERC20 token,
        address from,
        address to,
        uint256 value,
        bool bubble
    ) private returns (bool success) {
        bytes4 selector = IERC20.transferFrom.selector;

        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(0x00, selector)
            mstore(0x04, and(from, shr(96, not(0))))
            mstore(0x24, and(to, shr(96, not(0))))
            mstore(0x44, value)
            success := call(gas(), token, 0, 0x00, 0x64, 0x00, 0x20)
            // if call success and return is true, all is good.
            // otherwise (not success or return is not true), we need to perform further checks
            if iszero(and(success, eq(mload(0x00), 1))) {
                // if the call was a failure and bubble is enabled, bubble the error
                if and(iszero(success), bubble) {
                    returndatacopy(fmp, 0x00, returndatasize())
                    revert(fmp, returndatasize())
                }
                // if the return value is not true, then the call is only successful if:
                // - the token address has code
                // - the returndata is empty
                success := and(success, and(iszero(returndatasize()), gt(extcodesize(token), 0)))
            }
            mstore(0x40, fmp)
            mstore(0x60, 0)
        }
    }

    /**
     * @dev Imitates a Solidity `token.approve(spender, value)` call, relaxing the requirement on the return value:
     * the return value is optional (but if data is returned, it must not be false).
     *
     * @param token The token targeted by the call.
     * @param spender The spender of the tokens
     * @param value The amount of token to transfer
     * @param bubble Behavior switch if the transfer call reverts: bubble the revert reason or return a false boolean.
     */
    function _safeApprove(IERC20 token, address spender, uint256 value, bool bubble) private returns (bool success) {
        bytes4 selector = IERC20.approve.selector;

        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(0x00, selector)
            mstore(0x04, and(spender, shr(96, not(0))))
            mstore(0x24, value)
            success := call(gas(), token, 0, 0x00, 0x44, 0x00, 0x20)
            // if call success and return is true, all is good.
            // otherwise (not success or return is not true), we need to perform further checks
            if iszero(and(success, eq(mload(0x00), 1))) {
                // if the call was a failure and bubble is enabled, bubble the error
                if and(iszero(success), bubble) {
                    returndatacopy(fmp, 0x00, returndatasize())
                    revert(fmp, returndatasize())
                }
                // if the return value is not true, then the call is only successful if:
                // - the token address has code
                // - the returndata is empty
                success := and(success, and(iszero(returndatasize()), gt(extcodesize(token), 0)))
            }
            mstore(0x40, fmp)
        }
    }
}


// File @openzeppelin/contracts/utils/StorageSlot.sol@v5.6.1

// OpenZeppelin Contracts (last updated v5.1.0) (utils/StorageSlot.sol)
// This file was procedurally generated from scripts/generate/templates/StorageSlot.js.

pragma solidity ^0.8.20;

/**
 * @dev Library for reading and writing primitive types to specific storage slots.
 *
 * Storage slots are often used to avoid storage conflict when dealing with upgradeable contracts.
 * This library helps with reading and writing to such slots without the need for inline assembly.
 *
 * The functions in this library return Slot structs that contain a `value` member that can be used to read or write.
 *
 * Example usage to set ERC-1967 implementation slot:
 * ```solidity
 * contract ERC1967 {
 *     // Define the slot. Alternatively, use the SlotDerivation library to derive the slot.
 *     bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
 *
 *     function _getImplementation() internal view returns (address) {
 *         return StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value;
 *     }
 *
 *     function _setImplementation(address newImplementation) internal {
 *         require(newImplementation.code.length > 0);
 *         StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value = newImplementation;
 *     }
 * }
 * ```
 *
 * TIP: Consider using this library along with {SlotDerivation}.
 */
library StorageSlot {
    struct AddressSlot {
        address value;
    }

    struct BooleanSlot {
        bool value;
    }

    struct Bytes32Slot {
        bytes32 value;
    }

    struct Uint256Slot {
        uint256 value;
    }

    struct Int256Slot {
        int256 value;
    }

    struct StringSlot {
        string value;
    }

    struct BytesSlot {
        bytes value;
    }

    /**
     * @dev Returns an `AddressSlot` with member `value` located at `slot`.
     */
    function getAddressSlot(bytes32 slot) internal pure returns (AddressSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `BooleanSlot` with member `value` located at `slot`.
     */
    function getBooleanSlot(bytes32 slot) internal pure returns (BooleanSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Bytes32Slot` with member `value` located at `slot`.
     */
    function getBytes32Slot(bytes32 slot) internal pure returns (Bytes32Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Uint256Slot` with member `value` located at `slot`.
     */
    function getUint256Slot(bytes32 slot) internal pure returns (Uint256Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Int256Slot` with member `value` located at `slot`.
     */
    function getInt256Slot(bytes32 slot) internal pure returns (Int256Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `StringSlot` with member `value` located at `slot`.
     */
    function getStringSlot(bytes32 slot) internal pure returns (StringSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `StringSlot` representation of the string storage pointer `store`.
     */
    function getStringSlot(string storage store) internal pure returns (StringSlot storage r) {
        assembly ("memory-safe") {
            r.slot := store.slot
        }
    }

    /**
     * @dev Returns a `BytesSlot` with member `value` located at `slot`.
     */
    function getBytesSlot(bytes32 slot) internal pure returns (BytesSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `BytesSlot` representation of the bytes storage pointer `store`.
     */
    function getBytesSlot(bytes storage store) internal pure returns (BytesSlot storage r) {
        assembly ("memory-safe") {
            r.slot := store.slot
        }
    }
}


// File @openzeppelin/contracts/utils/ReentrancyGuard.sol@v5.6.1

// OpenZeppelin Contracts (last updated v5.5.0) (utils/ReentrancyGuard.sol)

pragma solidity ^0.8.20;

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If EIP-1153 (transient storage) is available on the chain you're deploying at,
 * consider using {ReentrancyGuardTransient} instead.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 *
 * IMPORTANT: Deprecated. This storage-based reentrancy guard will be removed and replaced
 * by the {ReentrancyGuardTransient} variant in v6.0.
 *
 * @custom:stateless
 */
abstract contract ReentrancyGuard {
    using StorageSlot for bytes32;

    // keccak256(abi.encode(uint256(keccak256("openzeppelin.storage.ReentrancyGuard")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant REENTRANCY_GUARD_STORAGE =
        0x9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f00;

    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    constructor() {
        _reentrancyGuardStorageSlot().getUint256Slot().value = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    /**
     * @dev A `view` only version of {nonReentrant}. Use to block view functions
     * from being called, preventing reading from inconsistent contract state.
     *
     * CAUTION: This is a "view" modifier and does not change the reentrancy
     * status. Use it only on view functions. For payable or non-payable functions,
     * use the standard {nonReentrant} modifier instead.
     */
    modifier nonReentrantView() {
        _nonReentrantBeforeView();
        _;
    }

    function _nonReentrantBeforeView() private view {
        if (_reentrancyGuardEntered()) {
            revert ReentrancyGuardReentrantCall();
        }
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        _nonReentrantBeforeView();

        // Any calls to nonReentrant after this point will fail
        _reentrancyGuardStorageSlot().getUint256Slot().value = ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _reentrancyGuardStorageSlot().getUint256Slot().value = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _reentrancyGuardStorageSlot().getUint256Slot().value == ENTERED;
    }

    function _reentrancyGuardStorageSlot() internal pure virtual returns (bytes32) {
        return REENTRANCY_GUARD_STORAGE;
    }
}


// File contracts/interfaces/IAuraBooster.sol

pragma solidity ^0.8.19;

interface IAuraBooster {
    function deposit(uint256 pid, uint256 amount, bool stake) external returns (bool);
    function withdraw(uint256 pid, uint256 amount) external returns (bool);
    function earmarkRewards(uint256 pid) external;
    function poolInfo(uint256 pid) external view returns (
        address lptoken,
        address token,
        address gauge,
        address crvRewards,  // BaseRewardPool (IAuraRewardPool)
        address stash,
        bool shutdown
    );
}


// File contracts/interfaces/IAuraRewardPool.sol

pragma solidity ^0.8.19;

interface IAuraRewardPool {
    function getReward() external;
    function withdrawAndUnwrap(uint256 amount, bool claim) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function earned(address account) external view returns (uint256);
    function periodFinish() external view returns (uint256);
    function rewardToken() external view returns (address);
    function extraRewardsLength() external view returns (uint256);
    function extraRewards(uint256 index) external view returns (address);
}


// File contracts/interfaces/IBalancerV3Router.sol

pragma solidity ^0.8.19;

/**
 * @notice Balancer v3 Router — used for adding/removing liquidity.
 *         Unlike v2, liquidity operations go through the Router (not the Vault directly).
 *
 *         Mainnet Router: 0x5C6fb490BDFD3246EB0bB062c168DeCAF4bD9FDd
 */
interface IBalancerV3Router {
    /**
     * @notice Add liquidity with arbitrary token amounts (replaces v2's joinPool).
     * @param pool              BPT pool contract address (the want token)
     * @param exactAmountsIn    Token amounts in pool-token order (from getPoolTokens)
     * @param minBptAmountOut   Minimum BPT to receive; 0 = no slippage protection
     * @param wethIsEth         True to send/receive raw ETH; false to use WETH
     * @param userData          Additional calldata (pass "" for standard joins)
     * @return bptAmountOut     Amount of BPT minted
     */
    function addLiquidityUnbalanced(
        address pool,
        uint256[] memory exactAmountsIn,
        uint256 minBptAmountOut,
        bool wethIsEth,
        bytes memory userData
    ) external payable returns (uint256 bptAmountOut);
}

/**
 * @notice Balancer v3 Vault — subset used by strategies.
 *         Unlike v2, getPoolTokens takes the pool address, not a bytes32 poolId.
 *
 *         Mainnet Vault: 0xbA1333333333a1BA1108E8412f11850A5C319bA9
 */
interface IBalancerV3Vault {
    /**
     * @notice Returns the tokens registered for a pool.
     *         Does NOT include the BPT itself (v3 does not pre-mint BPT in the pool).
     */
    function getPoolTokens(address pool) external view returns (address[] memory tokens);
}


// File contracts/interfaces/IBalancerVault.sol

pragma solidity ^0.8.19;

interface IBalancerVault {
    struct JoinPoolRequest {
        address[] assets;
        uint256[] maxAmountsIn;
        bytes userData;
        bool fromInternalBalance;
    }

    function joinPool(
        bytes32 poolId,
        address sender,
        address recipient,
        JoinPoolRequest memory request
    ) external payable;

    function getPoolTokens(bytes32 poolId)
        external
        view
        returns (
            address[] memory tokens,
            uint256[] memory balances,
            uint256 lastChangeBlock
        );

    function swap(
        SingleSwap memory singleSwap,
        FundManagement memory funds,
        uint256 limit,
        uint256 deadline
    ) external payable returns (uint256);

    struct SingleSwap {
        bytes32 poolId;
        SwapKind kind;
        address assetIn;
        address assetOut;
        uint256 amount;
        bytes userData;
    }

    struct FundManagement {
        address sender;
        bool fromInternalBalance;
        address payable recipient;
        bool toInternalBalance;
    }

    enum SwapKind { GIVEN_IN, GIVEN_OUT }
}

interface IBalancerPool {
    function getPoolId() external view returns (bytes32);
    function symbol() external view returns (string memory);
}


// File contracts/interfaces/IUniswapRouterETH.sol

pragma solidity ^0.8.19;

interface IUniswapRouterETH {
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external returns (uint amountA, uint amountB, uint liquidity);

    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);

    function getAmountsOut(uint amountIn, address[] calldata path)
        external view returns (uint[] memory amounts);
}


// File contracts/utils/StratFeeManager.sol

pragma solidity ^0.8.19;

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


// File contracts/strategies/StrategyAuraLP.sol

pragma solidity ^0.8.19;









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

    /// @notice Called by the Beefy vault before every deposit. No-op here but
    ///         required by the official BeefyVaultV7Factory vault implementation.
    function beforeDeposit() external {}

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
        if (aura != address(0)) {
            // Aura extra reward tokens can be STASH-AURA — a virtual/non-ERC20
            // token that reverts on approve(). Wrap in try/catch so a stash token
            // cannot brick initialisation; disable swapping if approve fails.
            try IERC20(aura).approve(unirouter, type(uint256).max) {}
            catch { aura = address(0); }
        }
    }

    function _removeAllowances() internal {
        IERC20(want).approve(booster, 0);
        IERC20(output).approve(unirouter, 0);
        address balancerEntry = balancerVersion == 2 ? BALANCER_VAULT : balancerV3Router;
        IERC20(native).approve(balancerEntry, 0);
        if (aura != address(0)) {
            try IERC20(aura).approve(unirouter, 0) {} catch {}
        }
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
