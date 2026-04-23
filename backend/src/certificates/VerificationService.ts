import prisma from '../db/index.js';
import {
  VerificationResult,
  BatchVerificationResponse,
  CertificateStatus,
  CertificateMetadata,
  BatchVerificationItem,
} from '../types/certificate.types.js';
import { CertificateService } from './CertificateService.js';
import { MetadataGenerator } from './MetadataGenerator.js';
import logger from '../utils/logger.js';

export class VerificationService {
  private certificateService: CertificateService;
  private metadataGenerator: MetadataGenerator;

  constructor() {
    this.certificateService = new CertificateService();
    this.metadataGenerator = new MetadataGenerator();
  }

  /**
   * Verifies a single certificate by token ID
   * Public endpoint - no authentication required
   */
  async verifyByTokenId(tokenId: string): Promise<VerificationResult> {
    try {
      // Find certificate
      const certificate = await prisma.certificate.findFirst({
        where: { tokenId },
        include: {
          student: true,
          course: true,
        },
      });

      if (!certificate) {
        return {
          isValid: false,
          certificate: null,
          status: CertificateStatus.ACTIVE, // Status not applicable
          onChainData: null,
          message: 'Certificate not found',
        };
      }

      // If revoked, return with revoked status
      if (certificate.status === CertificateStatus.REVOKED) {
        return this.buildRevokedResult(certificate);
      }

      // If reissued, check if we should show information
      if (certificate.status === CertificateStatus.REISSUED) {
        return this.buildReissuedResult(certificate);
      }

      // Build successful verification result
      return this.buildSuccessfulResult(certificate);
    } catch (error) {
      logger.error(`Verification error for token ${tokenId}:`, error);
      throw new Error(
        `Failed to verify certificate: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Verifies a certificate by certificate ID (internal)
   */
  async verifyByCertificateId(certificateId: string): Promise<VerificationResult> {
    const certificate = await prisma.certificate.findUnique({
      where: { id: certificateId },
      include: {
        student: true,
        course: true,
      },
    });

    if (!certificate) {
      return {
        isValid: false,
        certificate: null,
        status: CertificateStatus.ACTIVE,
        onChainData: null,
        message: 'Certificate not found',
      };
    }

    if (certificate.status === CertificateStatus.REVOKED) {
      return this.buildRevokedResult(certificate);
    }

    if (certificate.status === CertificateStatus.REISSUED) {
      return this.buildReissuedResult(certificate);
    }

    return this.buildSuccessfulResult(certificate);
  }

  /**
   * Batch verification for multiple token IDs
   * Accepts up to 100 certificates for performance
   */
  async batchVerify(tokenIds: string[]): Promise<BatchVerificationResponse> {
    if (tokenIds.length > 100) {
      throw new Error('Maximum 100 certificates allowed per batch verification');
    }

    // Fetch all certificates in a single query
    const certificates = await prisma.certificate.findMany({
      where: {
        tokenId: {
          in: tokenIds,
        },
      },
      include: {
        student: true,
        course: true,
      },
    });

    // Create a map for O(1) lookup
    const certMap = new Map<string, (typeof certificates)[number]>(
      certificates.map((c) => [c.tokenId!, c])
    );

    const results: BatchVerificationItem[] = [];
    let validCount = 0;
    let revokedCount = 0;
    let invalidCount = 0;

    for (const tokenId of tokenIds) {
      const cert = certMap.get(tokenId);

      if (!cert) {
        results.push({
          tokenId,
          isValid: false,
          status: CertificateStatus.ACTIVE,
          error: 'Certificate not found',
        });
        invalidCount++;
        continue;
      }

      // Determine status
      if (cert.status === CertificateStatus.REVOKED) {
        results.push({
          tokenId,
          isValid: false,
          status: cert.status,
          error: 'Certificate has been revoked',
        });
        revokedCount++;
      } else if (cert.status === CertificateStatus.REISSUED) {
        results.push({
          tokenId,
          isValid: false,
          status: cert.status,
          error: 'Certificate has been reissued',
        });
        revokedCount++;
      } else {
        results.push({
          tokenId,
          isValid: true,
          status: cert.status,
        });
        validCount++;
      }
    }

    return {
      results,
      summary: {
        total: tokenIds.length,
        valid: validCount,
        revoked: revokedCount,
        invalid: invalidCount,
      },
    };
  }

  /**
   * Gets full certificate metadata (for NFT metadata endpoint)
   */
  async getMetadata(tokenId: string): Promise<CertificateMetadata | null> {
    return this.certificateService.getMetadata(tokenId);
  }

  /**
   * Verifies a certificate's on-chain state
   * (Would integrate with Soroban contract)
   */
  async verifyOnChain(tokenId: string): Promise<{
    verified: boolean;
    onChain: boolean;
    details?: any;
  }> {
    // Placeholder - would call Soroban contract in production
    // For now, query our off-chain database
    const certificate = await prisma.certificate.findFirst({
      where: { tokenId },
      include: {
        student: {
          select: { walletAddress: true, did: true },
        },
      },
    });

    if (!certificate) {
      return { verified: false, onChain: false, details: 'Certificate not found' };
    }

    return {
      verified: true,
      onChain: true,
      details: {
        tokenId: certificate.tokenId,
        owner: certificate.student.walletAddress || 'unknown',
        mintedAt: certificate.issuedAt,
        contractAddress: certificate.contractAddress,
        transactionHash: certificate.certificateHash,
        network: certificate.network,
      },
    };
  }

  /**
   * Records a verification event for analytics
   */
  async recordVerification(tokenId: string): Promise<void> {
    try {
      // Check if analytics tracking is enabled
      if (process.env.ENABLE_ANALYTICS !== 'true') {
        return;
      }

      // Find certificate
      const cert = await prisma.certificate.findFirst({
        where: { tokenId },
      });

      if (!cert) {
        return;
      }

      // In a full implementation, this would create a Verification record
      // For now, we can add a verificationCount field to Certificate
      // or use a separate analytics service
      logger.info(`Certificate verified: ${cert.id}`, {
        certificateId: cert.id,
        tokenId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to record verification:', error);
    }
  }

  /**
   * Builds successful verification result
   */
  private buildSuccessfulResult(certificate: any): VerificationResult {
    const metadata = this.metadataGenerator.generate(
      certificate,
      certificate.course,
      certificate.student
    );

    const walletAddress = this.getWalletAddress(certificate.student, certificate.did);

    const onChainData = {
      tokenId: certificate.tokenId!,
      owner: walletAddress,
      mintedAt: certificate.issuedAt,
      contractAddress: certificate.contractAddress!,
      transactionHash: certificate.certificateHash || '',
      network: certificate.network || 'stellar-testnet',
    };

    return {
      isValid: true,
      certificate: metadata,
      status: certificate.status,
      onChainData,
    };
  }

  /**
   * Builds revoked verification result
   */
  private buildRevokedResult(certificate: any): VerificationResult {
    const metadata = this.metadataGenerator.generate(
      certificate,
      certificate.course,
      certificate.student
    );

    const walletAddress = this.getWalletAddress(certificate.student, certificate.did);

    const onChainData = {
      tokenId: certificate.tokenId!,
      owner: walletAddress,
      mintedAt: certificate.issuedAt,
      contractAddress: certificate.contractAddress!,
      transactionHash: certificate.transactionHash || '',
      network: certificate.network || 'stellar-testnet',
    };

    return {
      isValid: false,
      certificate: metadata,
      status: CertificateStatus.REVOKED,
      onChainData,
      revocationInfo: {
        revokedAt: certificate.revokedAt!,
        reason: certificate.revocationReason!,
        revokedBy: certificate.revokedBy!,
      },
      message: 'This certificate has been revoked',
    };
  }

  /**
   * Builds reissued verification result
   */
  private buildReissuedResult(certificate: any): VerificationResult {
    const metadata = this.metadataGenerator.generate(
      certificate,
      certificate.course,
      certificate.student
    );

    const walletAddress = this.getWalletAddress(certificate.student, certificate.did);

    const onChainData = {
      tokenId: certificate.tokenId!,
      owner: walletAddress,
      mintedAt: certificate.issuedAt,
      contractAddress: certificate.contractAddress!,
      transactionHash: certificate.transactionHash || '',
      network: certificate.network || 'stellar-testnet',
    };

    return {
      isValid: false,
      certificate: metadata,
      status: CertificateStatus.REISSUED,
      onChainData,
      message: 'This certificate has been reissued. A newer version is available.',
    };
  }

  /**
   * Gets wallet address from student record or DID
   */
  private getWalletAddress(student: any, did?: string | null): string {
    if (student.walletAddress) {
      return student.walletAddress;
    }

    if (did) {
      const parts = did.split(':');
      if (parts.length === 3 && parts[0] === 'did' && parts[1] === 'stellar') {
        return parts[2];
      }
    }

    return 'GUNKNOWN';
  }
}

export const verificationService = new VerificationService();
