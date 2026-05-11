'use strict';
/**
 * strategyFactory.test.js — unit tests for scripts/_strategyFactory.cjs
 *
 * Tests the assertStrategyRegistered() pre-flight check that guards all
 * deploy scripts against ERC1967InvalidBeacon reverts when a strategy is
 * not registered on the target chain's StrategyFactory.
 */

const { assertStrategyRegistered, ZERO, STRATEGY_FACTORY_ABI } =
  require('../../scripts/_strategyFactory.cjs');

const FACTORY_ADDR = '0xeF7746F16e511242e25Ad4FF9732bb5fC35EAB50'; // Arbitrum example
const IMPL_ADDR    = '0x1234567890123456789012345678901234567890';

// ── 1. assertStrategyRegistered ───────────────────────────────────────────────
describe('assertStrategyRegistered', () => {

  test('resolves with impl address when strategy is registered', async () => {
    const mockFactory = {
      getImplementation: jest.fn().mockResolvedValue(IMPL_ADDR),
    };
    const result = await assertStrategyRegistered(mockFactory, 'StakeDaoV2', FACTORY_ADDR, 1);
    expect(result).toBe(IMPL_ADDR);
    expect(mockFactory.getImplementation).toHaveBeenCalledWith('StakeDaoV2');
  });

  test('throws when getImplementation returns zero address', async () => {
    const mockFactory = {
      getImplementation: jest.fn().mockResolvedValue(ZERO),
    };
    await expect(
      assertStrategyRegistered(mockFactory, 'StakeDaoV2', FACTORY_ADDR, 42161)
    ).rejects.toThrow('StakeDaoV2 is not registered');
  });

  test('error message includes strategy name', async () => {
    const mockFactory = { getImplementation: jest.fn().mockResolvedValue(ZERO) };
    await expect(
      assertStrategyRegistered(mockFactory, 'StakeDaoV2', FACTORY_ADDR, 42161)
    ).rejects.toThrow('StakeDaoV2');
  });

  test('error message includes factory address', async () => {
    const mockFactory = { getImplementation: jest.fn().mockResolvedValue(ZERO) };
    await expect(
      assertStrategyRegistered(mockFactory, 'StakeDaoV2', FACTORY_ADDR, 42161)
    ).rejects.toThrow(FACTORY_ADDR);
  });

  test('error message includes chain ID', async () => {
    const mockFactory = { getImplementation: jest.fn().mockResolvedValue(ZERO) };
    await expect(
      assertStrategyRegistered(mockFactory, 'StakeDaoV2', FACTORY_ADDR, 42161)
    ).rejects.toThrow('42161');
  });

  test('error message mentions Ethereum mainnet for StakeDaoV2', async () => {
    const mockFactory = { getImplementation: jest.fn().mockResolvedValue(ZERO) };
    await expect(
      assertStrategyRegistered(mockFactory, 'StakeDaoV2', FACTORY_ADDR, 42161)
    ).rejects.toThrow(/Ethereum mainnet/i);
  });

  test('throws when getImplementation returns null', async () => {
    const mockFactory = { getImplementation: jest.fn().mockResolvedValue(null) };
    await expect(
      assertStrategyRegistered(mockFactory, 'StakeDaoV2', FACTORY_ADDR, 1)
    ).rejects.toThrow('StakeDaoV2 is not registered');
  });

  test('throws when getImplementation returns undefined', async () => {
    const mockFactory = { getImplementation: jest.fn().mockResolvedValue(undefined) };
    await expect(
      assertStrategyRegistered(mockFactory, 'StakeDaoV2', FACTORY_ADDR, 1)
    ).rejects.toThrow('StakeDaoV2 is not registered');
  });

  test('propagates error when getImplementation itself reverts (RPC error)', async () => {
    const mockFactory = {
      getImplementation: jest.fn().mockRejectedValue(new Error('execution reverted')),
    };
    await expect(
      assertStrategyRegistered(mockFactory, 'StakeDaoV2', FACTORY_ADDR, 1)
    ).rejects.toThrow('execution reverted');
  });

  test('works for other strategy names too (generic check)', async () => {
    const mockFactory = {
      getImplementation: jest.fn().mockResolvedValue(IMPL_ADDR),
    };
    const result = await assertStrategyRegistered(mockFactory, 'StrategyAuraMainnet', FACTORY_ADDR, 1);
    expect(result).toBe(IMPL_ADDR);
    expect(mockFactory.getImplementation).toHaveBeenCalledWith('StrategyAuraMainnet');
  });

  test('different strategy name appears in error when not registered', async () => {
    const mockFactory = { getImplementation: jest.fn().mockResolvedValue(ZERO) };
    await expect(
      assertStrategyRegistered(mockFactory, 'SomeOtherStrategy', FACTORY_ADDR, 10)
    ).rejects.toThrow('SomeOtherStrategy is not registered');
  });
});

// ── 2. STRATEGY_FACTORY_ABI ───────────────────────────────────────────────────
describe('STRATEGY_FACTORY_ABI', () => {
  test('includes createStrategy function', () => {
    expect(STRATEGY_FACTORY_ABI).toEqual(
      expect.arrayContaining([expect.stringContaining('createStrategy')])
    );
  });

  test('includes getImplementation function', () => {
    expect(STRATEGY_FACTORY_ABI).toEqual(
      expect.arrayContaining([expect.stringContaining('getImplementation')])
    );
  });

  test('has at least 2 entries', () => {
    expect(STRATEGY_FACTORY_ABI.length).toBeGreaterThanOrEqual(2);
  });
});

// ── 3. ZERO constant ──────────────────────────────────────────────────────────
describe('ZERO constant', () => {
  test('is a 42-character hex string (0x + 40 hex chars)', () => {
    expect(ZERO).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  test('is the null address', () => {
    expect(BigInt(ZERO)).toBe(0n);
  });
});
