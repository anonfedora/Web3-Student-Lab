import dotenv from 'dotenv';

dotenv.config();

const RPC_DEFAULTS: Record<string, string> = {
  local: 'http://localhost:8000/soroban/rpc',
  testnet: 'https://soroban-testnet.stellar.org',
  mainnet: 'https://soroban-mainnet.stellar.org',
};

const HORIZON_DEFAULTS: Record<string, string> = {
  local: 'http://localhost:8000',
  testnet: 'https://horizon-testnet.stellar.org',
  mainnet: 'https://horizon.stellar.org',
};

/**
 * The active Stellar network. Defaults to "testnet" for local development.
 * Override with the STELLAR_NETWORK environment variable.
 */
export const STELLAR_NETWORK: string = process.env.STELLAR_NETWORK ?? 'testnet';

/**
 * Soroban RPC URL for the active network.
 * Override with the SOROBAN_RPC_URL environment variable.
 */
export const SOROBAN_RPC_URL: string =
  process.env.SOROBAN_RPC_URL ?? RPC_DEFAULTS[STELLAR_NETWORK] ?? RPC_DEFAULTS['testnet']!;

/**
 * Horizon API URL for the active network.
 * Override with the HORIZON_URL environment variable.
 */
export const HORIZON_URL: string =
  process.env.HORIZON_URL ?? HORIZON_DEFAULTS[STELLAR_NETWORK] ?? HORIZON_DEFAULTS['testnet']!;
