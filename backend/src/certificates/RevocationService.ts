import prisma from '../db/index.js';
import {
  Certificate,
  CertificateStatus,
  RevokeCertificateRequest,
  ReissueCertificateRequest,
} from '../types/certificate.types.js';
import { CertificateService } from './CertificateService.js';
import logger from '../utils/logger.js';

export class RevocationService {
  private certificateService: CertificateService;

  constructor() {
    this.certificateService = new CertificateService();
  }

  /**
   * Revokes a certificate by certificate ID
   * Only authorized issuers/admins can call this
   */
  async revokeCertificate(
    certificateId: string,
    request: RevokeCertificateRequest
  ): Promise<Certificate> {
    const { reason, revokedBy } = request;

    // Validate certificate exists and can be revoked
    const certificate = await prisma.certificate.findUnique({
      where: { id: certificateId },
      include: { student: true, course: true },
    });

    if (!certificate) {
      throw new Error('Certificate not found');
    }

    // Check if already revoked
    if (certificate.status === CertificateStatus.REVOKED) {
      throw new Error('Certificate is already revoked');
    }

    // Check if certificate can be revoked
    if (certificate.status === CertificateStatus.EXPIRED) {
      throw new Error('Expired certificates cannot be revoked');
    }

    // Check if issuer is authorized (must be the original issuer or admin)
    // For now, we only check that the revokedBy is provided
    // In production, this would verify that the caller has administrator or instructor role
    if (!revokedBy) {
      throw new Error('Revocation requires a valid issuer DID');
    }

    // Perform revocation
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

    logger.info(`Certificate revoked successfully`, {
      certificateId,
      reason,
      revokedBy,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  /**
   * Reissues a certificate (creates a new one, marks old as REISSUED)
   * Typically used when correcting errors or updating grades
   */
  async reissueCertificate(
    request: ReissueCertificateRequest
  ): Promise<{ original: Certificate; new: Certificate }> {
    const { certificateId, reason, newGrade, issuedBy } = request;

    // Validate original certificate
    const original = await prisma.certificate.findUnique({
      where: { id: certificateId },
      include: { student: true, course: true },
    });

    if (!original) {
      throw new Error('Original certificate not found');
    }

    // Validate reissuance eligibility
    if (original.status === CertificateStatus.REVOKED) {
      throw new Error('Cannot reissue a revoked certificate');
    }

    if (original.status === CertificateStatus.EXPIRED) {
      throw new Error('Cannot reissue an expired certificate');
    }

    // Verify issuer authorization
    if (!issuedBy) {
      throw new Error('Reissuance requires a valid issuer DID');
    }

    // Mark original as reissued
    await prisma.certificate.update({
      where: { id: certificateId },
      data: {
        status: CertificateStatus.REISSUED,
        updatedAt: new Date(),
      },
    });

    // Create new certificate with updated data
    const newCertificate = await this.certificateService.mintCertificate(
      {
        studentId: original.studentId,
        courseId: original.courseId,
        grade: newGrade || original.grade || undefined,
        tokenId: original.tokenId, // Keep same tokenId
        did: original.did,
      },
      issuedBy,
      original.contractAddress!,
      original.network!
    );

    // Update new certificate to link to original
    await prisma.certificate.update({
      where: { id: newCertificate.id },
      data: {
        previousVersionId: certificateId,
      },
    });

    logger.info(`Certificate reissued: ${certificateId} -> ${newCertificate.id}`, {
      originalId: certificateId,
      newId: newCertificate.id,
      reason,
      issuedBy,
    });

    return { original, new: newCertificate };
  }

  /**
   * Bulk revokes multiple certificates
   * Useful for administrative actions (e.g., course cancellation)
   */
  async bulkRevoke(
    certificateIds: string[],
    reason: string,
    revokedBy: string
  ): Promise<{ revoked: number; failed: number; errors: string[] }> {
    const errors: string[] = [];
    let revokedCount = 0;
    let failedCount = 0;

    for (const id of certificateIds) {
      try {
        await this.revokeCertificate(id, { certificateId: id, reason, revokedBy });
        revokedCount++;
      } catch (error) {
        failedCount++;
        errors.push(`${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    logger.info(`Bulk revocation completed: ${revokedCount} revoked, ${failedCount} failed`, {
      count: revokedCount,
      failed: failedCount,
      errors,
    });

    return { revoked: revokedCount, failed: failedCount, errors };
  }

  /**
   * Gets revocation history for a certificate
   */
  async getRevocationHistory(certificateId: string): Promise<
    Array<{
      certificateId: string;
      action: 'revoke' | 'reissue';
      timestamp: Date;
      reason: string;
      performedBy: string;
      relatedCertificateId?: string;
    }>
  > {
    const history: any[] = [];

    // Check original certificate
    const cert = await prisma.certificate.findUnique({
      where: { id: certificateId },
    });

    if (!cert) {
      throw new Error('Certificate not found');
    }

    // Add revocation event if revoked
    if (cert.status === CertificateStatus.REVOKED) {
      history.push({
        certificateId: cert.id,
        action: 'revoke',
        timestamp: cert.revokedAt!,
        reason: cert.revocationReason!,
        performedBy: cert.revokedBy!,
      });
    }

    // If reissued, find the newer version
    if (cert.status === CertificateStatus.REISSUED) {
      const newer = await prisma.certificate.findFirst({
        where: { previousVersionId: certificateId },
      });

      if (newer) {
        history.push({
          certificateId: newer.id,
          action: 'reissue',
          timestamp: newer.issuedAt,
          reason: 'Certificate reissued',
          performedBy: newer.did || 'unknown',
          relatedCertificateId: certificateId,
        });
      }
    }

    return history;
  }

  /**
   * Checks if a certificate is eligible for revocation
   */
  canBeRevoked(certificate: Certificate): boolean {
    return (
      certificate.status === CertificateStatus.ACTIVE ||
      certificate.status === CertificateStatus.MINTED
    );
  }

  /**
   * Checks if a certificate is eligible for reissuance
   */
  canBeReissued(certificate: Certificate): boolean {
    return (
      certificate.status === CertificateStatus.ACTIVE ||
      certificate.status === CertificateStatus.MINTED ||
      certificate.status === CertificateStatus.REVOKED
    );
  }
}

export const revocationService = new RevocationService();
