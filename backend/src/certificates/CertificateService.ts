import prisma from '../db/index.js';
import {
  Certificate,
  CertificateStatus,
  CertificateMetadata,
  MintCertificateRequest,
} from '../types/certificate.types.js';
import { MetadataGenerator } from './MetadataGenerator.js';
import { certificateBlockchainService } from '../blockchain/CertificateBlockchainService.js';
import logger from '../utils/logger.js';

export class CertificateService {
  private metadataGenerator: MetadataGenerator;

  constructor() {
    this.metadataGenerator = new MetadataGenerator();
  }

  /**
   * Mints a new certificate for a student after course completion
   * On-chain integration: mints NFT via Soroban contract
   */
  async mintCertificate(
    request: MintCertificateRequest,
    issuerDid: string,
    contractAddress: string,
    network: string
  ): Promise<Certificate & { metadata: CertificateMetadata }> {
    const { studentId, courseId, grade, tokenId, did } = request;

    // Validate student exists
    const student = await prisma.student.findUnique({
      where: { id: studentId },
    });

    if (!student) {
      throw new Error(`Student with ID ${studentId} not found`);
    }

    // Validate course exists
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      throw new Error(`Course with ID ${courseId} not found`);
    }

    // Check enrollment status - student must be enrolled
    const enrollment = await prisma.enrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId,
          courseId,
        },
      },
    });

    if (!enrollment) {
      throw new Error(`Student ${studentId} is not enrolled in course ${courseId}`);
    }

    // Generate certificate ID
    const certificateId = `cert-${studentId.substring(0, 8)}-${courseId.substring(0, 8)}-${Date.now()}`;

    // Generate tokenId if not provided
    const tokenIdValue = tokenId || Math.floor(Math.random() * 1000000).toString();

    // Create certificate record before minting (so we have the ID for metadata)
    const certificate = await prisma.certificate.create({
      data: {
        id: certificateId,
        studentId,
        courseId,
        tokenId: tokenIdValue,
        issuedAt: new Date(),
        certificateHash: null, // Will be set after blockchain transaction
        status: CertificateStatus.MINTED,
        did: did || issuerDid,
        contractAddress,
        network,
        grade: grade || null,
      },
      include: {
        student: true,
        course: true,
      },
    });

    // Generate the metadata (used for on-chain and off-chain storage)
    const metadata = this.metadataGenerator.generate(certificate, course, student);

    try {
      // Call blockchain service to mint actual NFT
      const mintResult = await certificateBlockchainService.mintCertificate(metadata);

      // Update certificate with blockchain transaction details
      await prisma.certificate.update({
        where: { id: certificateId },
        data: {
          certificateHash: mintResult.transactionHash,
          contractAddress: mintResult.contractAddress,
          status: CertificateStatus.ACTIVE, // Move to active after successful mint
          metadataUri: metadata.image, // Store metadata URI for reference
        },
      });

      // Update returned certificate with transaction hash
      certificate.certificateHash = mintResult.transactionHash;
      certificate.contractAddress = mintResult.contractAddress;
      certificate.status = CertificateStatus.ACTIVE;

      logger.info(`Certificate minted on-chain: ${certificateId} -> token ${mintResult.tokenId}`, {
        certificateId,
        tokenId: mintResult.tokenId,
        txHash: mintResult.transactionHash,
      });
    } catch (error) {
      // If minting fails, mark as failed but keep record
      logger.error(`Blockchain mint failed for ${certificateId}:`, error);
      await prisma.certificate.update({
        where: { id: certificateId },
        data: {
          status: 'failed' as CertificateStatus,
        },
      });
      throw new Error(
        `Failed to mint certificate on blockchain: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    return { ...certificate, metadata };
  }

  /**
   * Verifies a certificate by token ID - main verification endpoint
   */
  async verifyCertificate(tokenId: string): Promise<VerificationResult['onChainData']> {
    // Find certificate in database
    const certificate = await prisma.certificate.findFirst({
      where: { tokenId },
      include: {
        student: true,
        course: true,
      },
    });

    if (!certificate) {
      throw new Error('Certificate not found');
    }

    // Get student wallet address
    const walletAddress =
      certificate.student.walletAddress ||
      (await this.getStudentWalletAddress(certificate.studentId));

    // Return verification result
    return {
      tokenId: certificate.tokenId!,
      owner: walletAddress,
      mintedAt: certificate.issuedAt,
      contractAddress: certificate.contractAddress!,
      transactionHash: certificate.transactionHash || certificate.certificateHash || '',
      network: certificate.network || 'stellar-testnet',
    };
  }

  /**
   * Verifies a certificate by certificate ID (public endpoint)
   */
  async verifyCertificateById(certificateId: string): Promise<VerificationResult> {
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
        status: 'invalid' as CertificateStatus,
        onChainData: null,
        message: 'Certificate not found',
      };
    }

    const walletAddress = await this.getStudentWalletAddress(certificate.studentId);
    const metadata = this.metadataGenerator.generate(
      certificate,
      certificate.course,
      certificate.student
    );

    const onChainData = {
      tokenId: certificate.tokenId!,
      owner: walletAddress,
      mintedAt: certificate.issuedAt,
      contractAddress: certificate.contractAddress!,
      transactionHash: certificate.transactionHash || certificate.certificateHash || '',
      network: certificate.network || 'stellar-testnet',
    };

    const result: VerificationResult = {
      isValid: true,
      certificate: metadata,
      status: certificate.status,
      onChainData,
    };

    if (certificate.status === CertificateStatus.REVOKED) {
      result.revocationInfo = {
        revokedAt: certificate.revokedAt!,
        reason: certificate.revocationReason!,
        revokedBy: certificate.revokedBy!,
      };
    }

    return result;
  }

  /**
   * Batch verification for multiple certificates
   */
  async batchVerify(tokenIds: string[]): Promise<VerificationResult[]> {
    const certificates = await prisma.certificate.findMany({
      where: {
        OR: tokenIds.map((id) => ({ tokenId: id })),
      },
      include: {
        student: true,
        course: true,
      },
    });

    const certMap = new Map(certificates.map((c) => [c.tokenId, c]));

    const results: VerificationResult[] = [];

    for (const tokenId of tokenIds) {
      const certificate = certMap.get(tokenId);

      if (!certificate) {
        results.push({
          isValid: false,
          certificate: null,
          status: 'invalid' as CertificateStatus,
          onChainData: null,
          message: 'Certificate not found',
        });
        continue;
      }

      const walletAddress = await this.getStudentWalletAddress(certificate.studentId);
      const metadata = this.metadataGenerator.generate(
        certificate,
        certificate.course,
        certificate.student
      );

      const onChainData = {
        tokenId: certificate.tokenId!,
        owner: walletAddress,
        mintedAt: certificate.issuedAt,
        contractAddress: certificate.contractAddress!,
        transactionHash: certificate.transactionHash || certificate.certificateHash || '',
        network: certificate.network || 'stellar-testnet',
      };

      results.push({
        isValid: true,
        certificate: metadata,
        status: certificate.status,
        onChainData,
      });
    }

    return results;
  }

  /**
   * Revokes a certificate
   */
  async revokeCertificate(
    certificateId: string,
    reason: string,
    revokedBy: string
  ): Promise<Certificate> {
    const certificate = await prisma.certificate.findUnique({
      where: { id: certificateId },
    });

    if (!certificate) {
      throw new Error('Certificate not found');
    }

    if (certificate.status === CertificateStatus.REVOKED) {
      throw new Error('Certificate already revoked');
    }

    if (certificate.status === CertificateStatus.EXPIRED) {
      throw new Error('Cannot revoke an expired certificate');
    }

    // Update certificate status
    const updated = await prisma.certificate.update({
      where: { id: certificateId },
      data: {
        status: CertificateStatus.REVOKED,
        revokedAt: new Date(),
        revocationReason: reason,
        revokedBy,
        updatedAt: new Date(),
      },
      include: {
        student: true,
        course: true,
      },
    });

    logger.info(`Certificate revoked: ${certificateId}`, {
      certificateId,
      reason,
      revokedBy,
    });

    return updated;
  }

  /**
   * Reissues a certificate (creates new one, marks old as reissued)
   */
  async reissueCertificate(
    originalCertificateId: string,
    reason: string,
    newGrade?: string,
    issuedBy: string = ''
  ): Promise<{ original: Certificate; new: Certificate & { metadata: CertificateMetadata } }> {
    const original = await prisma.certificate.findUnique({
      where: { id: originalCertificateId },
      include: {
        student: true,
        course: true,
      },
    });

    if (!original) {
      throw new Error('Original certificate not found');
    }

    if (original.status === CertificateStatus.REVOKED) {
      throw new Error('Cannot reissue a revoked certificate');
    }

    if (original.status === CertificateStatus.EXPIRED) {
      throw new Error('Cannot reissue an expired certificate');
    }

    // Mark original as reissued
    await prisma.certificate.update({
      where: { id: originalCertificateId },
      data: {
        status: CertificateStatus.REISSUED,
        updatedAt: new Date(),
      },
    });

    // Create new certificate with updated data
    const newCertificate = await this.mintCertificate(
      {
        studentId: original.studentId,
        courseId: original.courseId,
        grade: newGrade || original.grade || undefined,
        did: original.did,
        tokenId: original.tokenId, // Use same tokenId
      },
      issuedBy,
      original.contractAddress!,
      original.network!
    );

    // Link new certificate to original
    await prisma.certificate.update({
      where: { id: newCertificate.id },
      data: {
        previousVersionId: originalCertificateId,
      },
    });

    logger.info(`Certificate reissued: ${originalCertificateId} -> ${newCertificate.id}`, {
      originalId: originalCertificateId,
      newId: newCertificate.id,
      reason,
      issuedBy,
    });

    return { original, new: newCertificate };
  }

  /**
   * Gets metadata for a certificate by token ID
   */
  async getMetadata(tokenId: string): Promise<CertificateMetadata | null> {
    const certificate = await prisma.certificate.findFirst({
      where: { tokenId },
      include: {
        student: true,
        course: true,
      },
    });

    if (!certificate) {
      return null;
    }

    return this.metadataGenerator.generate(certificate, certificate.course, certificate.student);
  }

  /**
   * Gets full certificate with all details
   */
  async getCertificateById(certificateId: string): Promise<Certificate | null> {
    return await prisma.certificate.findUnique({
      where: { id: certificateId },
      include: {
        student: true,
        course: true,
      },
    });
  }

  /**
   * Gets certificates by student
   */
  async getCertificatesByStudent(
    studentId: string
  ): Promise<Array<Certificate & { metadata: CertificateMetadata }>> {
    const certificates = await prisma.certificate.findMany({
      where: { studentId },
      include: {
        student: true,
        course: true,
      },
      orderBy: { issuedAt: 'desc' },
    });

    return certificates.map((cert) => ({
      ...cert,
      metadata: this.metadataGenerator.generate(cert, cert.course, cert.student),
    }));
  }

  /**
   * Gets certificates by status (for admin/issuer)
   */
  async getCertificatesByStatus(status: CertificateStatus): Promise<Certificate[]> {
    return await prisma.certificate.findMany({
      where: { status },
      include: {
        student: true,
        course: true,
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  /**
   * Gets all certificates with pagination
   */
  async getAllCertificates(
    limit = 50,
    offset = 0
  ): Promise<{
    certificates: Certificate[];
    total: number;
  }> {
    const [certificates, total] = await Promise.all([
      prisma.certificate.findMany({
        include: {
          student: true,
          course: true,
        },
        orderBy: { issuedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.certificate.count(),
    ]);

    return { certificates, total };
  }

  /**
   * Get analytics for certificates
   */
  async getAnalytics(): Promise<{
    totalCertificates: number;
    byStatus: Record<string, number>;
    totalVerifications: number;
    uniqueStudents: number;
    uniqueCourses: number;
    revocationRate: number;
  }> {
    const totalCertificates = await prisma.certificate.count();
    const byStatus = await prisma.certificate.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    const statusCounts = byStatus.reduce(
      (acc, item) => {
        acc[item.status] = item._count.status;
        return acc;
      },
      {} as Record<string, number>
    );

    const uniqueStudents = await prisma.certificate
      .groupBy({
        by: ['studentId'],
        _count: { studentId: true },
      })
      .then((r) => r.length);

    const uniqueCourses = await prisma.certificate
      .groupBy({
        by: ['courseId'],
        _count: { courseId: true },
      })
      .then((r) => r.length);

    // Total verifications can be tracked via analytics (would need a separate table)
    // For now return estimated based on certificate count or 0 if no table exists
    const totalVerifications = 0;

    const revokedCount = statusCounts[CertificateStatus.REVOKED] || 0;
    const revocationRate = totalCertificates > 0 ? revokedCount / totalCertificates : 0;

    return {
      totalCertificates,
      byStatus: statusCounts,
      totalVerifications,
      uniqueStudents,
      uniqueCourses,
      revocationRate,
    };
  }

  /**
   * Helper function to get student wallet address
   * In production this would be from the Student model or profile
   */
  private async getStudentWalletAddress(studentId: string): Promise<string> {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { walletAddress: true, did: true },
    });

    if (!student) {
      throw new Error(`Student ${studentId} not found`);
    }

    // Return the wallet address or derive from DID
    if (student.walletAddress) {
      return student.walletAddress;
    }

    if (student.did) {
      // Extract Stellar address from DID (assuming did:stellar format)
      // did:stellar:GBRPYHIL2CI3FYQMWVUGE62KMGOBQKLCYJ3HLKBUBIW5VZH4S4MNOWT
      const parts = student.did.split(':');
      if (parts.length === 3 && parts[0] === 'did' && parts[1] === 'stellar') {
        return parts[2];
      }
    }

    return 'GUNKNOWNWALLETADDRESSUNKNOWN'; // Placeholder
  }

  /**
   * Generates a random hash
   */
  private generateRandomHash(): string {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < 64; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }
}

export const certificateService = new CertificateService();
