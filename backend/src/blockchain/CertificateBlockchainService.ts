import { SorobanClient, Account, Networks, ASSET } from '@stellar/stellar-sdk';
import {
  OnChainCertificateData,
  IBlockchainService,
  MintResult,
  TransactionHistoryItem,
} from '../types/certificate.types.js';
import { Networks as SorobanNetworks } from 'soroban-client';
import logger from './logger.js';

/**
 * Certificate Blockchain Service
 * Interfaces with Soroban/Soroban network for certificate NFTs
 *
 * Note: This is an interface layer. Actual contract interaction
 * requires the deployed Soroban certificate contract.
 */
export class CertificateBlockchainService implements IBlockchainService {
  private client: SorobanClient | null = null;
  private network: string;
  private contractId: string;
  private isSimulationMode: boolean;

  constructor() {
    this.network = process.env.STELLAR_NETWORK || 'testnet';
    this.contractId = process.env.CERTIFICATE_CONTRACT_ID || '';
    this.isSimulationMode = process.env.BLOCKCHAIN_SIMULATION_MODE === 'true' || !this.contractId;

    if (!this.isSimulationMode && this.contractId) {
      this.initializeClient();
    }

    logger.info(
      `Blockchain service initialized in ${this.isSimulationMode ? 'simulation' : 'live'} mode`
    );
  }

  /**
   * Initializes the Soroban client
   */
  private initializeClient(): void {
    const networkUrl = this.getRpcUrl();
    const networkPassphrase = this.getNetworkPassphrase();

    try {
      this.client = new SorobanClient(networkUrl, {
        networkPassphrase,
      });
      logger.info(`Soroban client initialized for ${this.network}`);
    } catch (error) {
      logger.error('Failed to initialize Soroban client:', error);
      this.isSimulationMode = true;
    }
  }

  /**
   * Gets RPC URL for the configured network
   */
  private getRpcUrl(): string {
    switch (this.network) {
      case 'testnet':
        return process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
      case 'futurenet':
        return process.env.SOROBAN_RPC_URL || 'https://rpc-futurenet.stellar.org';
      case 'public':
      case 'mainnet':
        return process.env.SOROBAN_RPC_URL || 'https://soroban.stellar.org';
      default:
        return process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
    }
  }

  /**
   * Gets network passphrase for the configured network
   */
  private getNetworkPassphrase(): string {
    switch (this.network) {
      case 'testnet':
        return Networks.TESTNET;
      case 'futurenet':
        return Networks.FUTURENET;
      case 'public':
      case 'mainnet':
        return Networks.PUBLIC;
      default:
        return Networks.TESTNET;
    }
  }

  /**
   * Mints a certificate NFT on-chain
   * Interacts with the Soroban certificate contract
   */
  async mintCertificate(metadata: any): Promise<MintResult> {
    if (this.isSimulationMode) {
      return this.simulateMint(metadata);
    }

    try {
      if (!this.client || !this.contractId) {
        throw new Error('Blockchain client not initialized');
      }

      // Build the transaction to call the certificate contract's issue method
      const sourceAccount = await this.getSourceAccount();

      // Prepare metadata URI
      const metadataUri = this.buildMetadataUri(metadata.verification.tokenId);

      // Call contract method: issue(certificateId, student, tokenId, metadataUri, ...)
      const transaction = this.client.buildTransaction(
        {
          sourceAccount,
          operations: [
            {
              type: 'invokeHostFunction',
              invokeHostFunction: {
                hostFunction: {
                  type: 'contract',
                  contractId: this.contractId,
                  method: 'issue',
                  args: {
                    certificateId: metadata.verification.certificateId,
                    student: metadata.student.walletAddress,
                    tokenId: metadata.verification.tokenId,
                    metadataUri: metadataUri,
                    courseName: metadata.course.title,
                    instructor: metadata.course.instructor,
                    completionDate: metadata.course.completionDate,
                    grade: metadata.course.grade || '',
                  },
                },
              },
            },
          ],
        },
        { fee: '10000' }
      );

      // Sign and submit
      const signedTx = await this.signTransaction(transaction);
      const result = await this.client.submitTransaction(signedTx);

      return {
        success: true,
        tokenId: metadata.verification.tokenId,
        transactionHash: result.hash,
        contractAddress: this.contractId,
      };
    } catch (error) {
      logger.error('On-chain mint failed:', error);
      throw new Error(
        `Failed to mint certificate on blockchain: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Verifies a certificate exists on-chain
   */
  async verifyOnChain(tokenId: string): Promise<boolean> {
    if (this.isSimulationMode) {
      return this.simulateVerifyOnChain(tokenId);
    }

    try {
      if (!this.client || !this.contractId) {
        throw new Error('Blockchain client not initialized');
      }

      // Call contract method: get_certificate(tokenId)
      const result = await this.client.callContract(this.contractId, 'get_certificate', [tokenId]);

      return result !== null && result !== undefined;
    } catch (error) {
      logger.error(`On-chain verify failed for token ${tokenId}:`, error);
      return false;
    }
  }

  /**
   * Gets token owner from blockchain
   */
  async getOwner(tokenId: string): Promise<string> {
    if (this.isSimulationMode) {
      return this.simulateGetOwner(tokenId);
    }

    try {
      if (!this.client || !this.contractId) {
        throw new Error('Blockchain client not initialized');
      }

      const result = await this.client.callContract(this.contractId, 'get_owner', [tokenId]);

      return (result as string) || '';
    } catch (error) {
      logger.error(`Get owner failed for token ${tokenId}:`, error);
      return '';
    }
  }

  /**
   * Revokes a certificate on-chain (if contract supports)
   */
  async revokeCertificate(tokenId: string, reason: string): Promise<void> {
    if (this.isSimulationMode) {
      logger.info(`Simulated revocation of token ${tokenId}: ${reason}`);
      return;
    }

    try {
      if (!this.client || !this.contractId) {
        throw new Error('Blockchain client not initialized');
      }

      const sourceAccount = await this.getSourceAccount();

      const transaction = this.client.buildTransaction(
        {
          sourceAccount,
          operations: [
            {
              type: 'invokeHostFunction',
              invokeHostFunction: {
                hostFunction: {
                  type: 'contract',
                  contractId: this.contractId,
                  method: 'revoke',
                  args: { tokenId, reason },
                },
              },
            },
          ],
        },
        { fee: '10000' }
      );

      const signedTx = await this.signTransaction(transaction);
      await this.client.submitTransaction(signedTx);

      logger.info(`Certificate revoked on-chain: ${tokenId}`, { reason });
    } catch (error) {
      logger.error(`On-chain revoke failed for token ${tokenId}:`, error);
      throw new Error(
        `Failed to revoke certificate: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Gets transaction history for a token
   */
  async getTransactionHistory(tokenId: string): Promise<TransactionHistoryItem[]> {
    if (this.isSimulationMode) {
      return [];
    }

    // In production, this would query Horizon/Soroban RPC for transaction history
    // Filtering by certificate contract and tokenId
    try {
      // Would use Soroban RPC getTransactions with ledger filtering
      return [];
    } catch (error) {
      logger.error('Failed to get transaction history:', error);
      return [];
    }
  }

  /**
   * Gets certificate data from on-chain storage
   */
  async getCertificateData(tokenId: string): Promise<OnChainCertificateData | null> {
    if (this.isSimulationMode) {
      return this.simulateGetOnChainData(tokenId);
    }

    try {
      if (!this.client || !this.contractId) {
        throw new Error('Blockchain client not initialized');
      }

      const result = await this.client.callContract(this.contractId, 'get_certificate', [tokenId]);

      if (!result) return null;

      return {
        tokenId,
        owner: result.owner as string,
        metadataUri: result.metadataUri as string,
        mintedAt: new Date(result.mintedAt as string),
        contractAddress: this.contractId,
        transactionHash: result.txHash as string,
        network: this.network,
      };
    } catch (error) {
      logger.error(`Get on-chain data failed for token ${tokenId}:`, error);
      return null;
    }
  }

  /**
   * Checks if Soroban connection is available
   */
  isConnected(): boolean {
    return !this.isSimulationMode && this.client !== null;
  }

  /**
   * Gets the contract address
   */
  getContractAddress(): string {
    return this.contractId;
  }

  // =====================
  // Simulation methods (for development without live blockchain)
  // =====================

  private async simulateMint(metadata: any): Promise<MintResult> {
    // Simulate blockchain delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    const mockHash = `0x${Array(64)
      .fill(0)
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join('')}`;
    const mockContract = this.contractId || 'GUNKNOWNCONTRACT';

    logger.info(`Simulated mint for token ${metadata.verification.tokenId}`);

    return {
      success: true,
      tokenId: metadata.verification.tokenId,
      transactionHash: mockHash,
      contractAddress: mockContract,
    };
  }

  private async simulateVerifyOnChain(tokenId: string): Promise<boolean> {
    // Simulates checking on-chain existence
    await new Promise((resolve) => setTimeout(resolve, 50));
    return true; // Assume exists for simulation
  }

  private async simulateGetOwner(tokenId: string): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Return a mock Stellar address
    return 'GBST4SW5DKCK3SN5EQQYQA4SDSF4NYVZ647YV6NA5PHWJ2N2UJNAPNAI';
  }

  private async simulateGetOnChainData(tokenId: string): Promise<OnChainCertificateData | null> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      tokenId,
      owner: 'GBST4SW5DKCK3SN5EQQYQA4SDSF4NYVZ647YV6NA5PHWJ2N2UJNAPNAI',
      metadataUri: `${process.env.API_BASE_URL || 'http://localhost:8080'}/api/v1/certificates/${tokenId}/metadata`,
      mintedAt: new Date(),
      contractAddress: this.contractId || 'GUNKNOWNCONTRACT',
      transactionHash: '0xsimulated',
      network: this.network,
    };
  }

  private async getSourceAccount(): Promise<Account> {
    // In production, would load from secret key in environment
    const secretKey = process.env.STELLAR_SECRET_KEY;
    if (!secretKey) {
      throw new Error('Stellar secret key not configured');
    }

    const keypair = this.createKeypair(secretKey);
    const account = new Account(keypair.publicKey(), 0);

    // Would fetch current sequence from network
    // For simulation, use sequence 0
    return account;
  }

  private signTransaction(transaction: any): Promise<any> {
    // In production, sign with wallet/key
    return Promise.resolve(transaction);
  }

  private createKeypair(secret: string): any {
    // This would use stellar-sdk Keypair
    // Placeholder return
    return { publicKey: 'G...', sign: () => {} };
  }

  private buildMetadataUri(tokenId: string): string {
    const base =
      process.env.METADATA_BASE_URL ||
      `${process.env.API_BASE_URL || 'http://localhost:8080'}/api/v1/certificates`;
    return `${base}/${tokenId}/metadata`;
  }
}

export const certificateBlockchainService = new CertificateBlockchainService();
