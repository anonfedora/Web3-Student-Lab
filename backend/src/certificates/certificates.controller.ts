import { Request, Response } from 'express';
import { z } from 'zod';
import { certificateService, verificationService, revocationService } from './index.js';
import logger from '../utils/logger.js';

/**
 * Certificate Controller
 * Handles all certificate-related HTTP endpoints
 */
export class CertificateController {
  /**
   * GET /api/certificates/verify/:tokenId
   * Public endpoint for verifying a single certificate
   */
  async verifyCertificate(req: Request, res: Response): Promise<void> {
    try {
      const { tokenId } = req.params;

      if (!tokenId || typeof tokenId !== 'string') {
        res.status(400).json({
          error: 'Invalid token ID',
          isValid: false,
        });
        return;
      }

      const result = await verificationService.verifyByTokenId(tokenId);

      // Record verification for analytics (non-blocking)
      verificationService.recordVerification(tokenId).catch(console.error);

      res.status(200).json(result);
    } catch (error) {
      logger.error(
        `Verification error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      res.status(500).json({
        error: 'Failed to verify certificate',
        isValid: false,
      });
    }
  }

  /**
   * POST /api/certificates/verify/batch
   * Batch verification endpoint (no auth required)
   */
  async batchVerify(req: Request, res: Response): Promise<void> {
    try {
      const { tokenIds } = req.body;

      // Validate input
      if (!Array.isArray(tokenIds)) {
        res.status(400).json({
          error: 'tokenIds must be an array',
        });
        return;
      }

      if (tokenIds.length > 100) {
        res.status(400).json({
          error: 'Maximum 100 certificates allowed per batch',
        });
        return;
      }

      if (tokenIds.length === 0) {
        res.status(400).json({
          error: 'tokenIds array cannot be empty',
        });
        return;
      }

      const results = await verificationService.batchVerify(tokenIds);

      res.status(200).json(results);
    } catch (error) {
      logger.error(
        `Batch verification error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      res.status(500).json({
        error: 'Failed to perform batch verification',
      });
    }
  }

  /**
   * GET /api/certificates/:tokenId/metadata
   * Returns NFT-compliant metadata for a certificate
   */
  async getMetadata(req: Request, res: Response): Promise<void> {
    try {
      const { tokenId } = req.params;

      if (!tokenId) {
        res.status(400).json({ error: 'Token ID is required' });
        return;
      }

      const metadata = await verificationService.getMetadata(tokenId);

      if (!metadata) {
        res.status(404).json({ error: 'Certificate not found' });
        return;
      }

      // Set content type for NFT metadata (should be application/json)
      res.set('Content-Type', 'application/json');
      res.status(200).json(metadata);
    } catch (error) {
      logger.error(
        `Metadata fetch error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      res.status(500).json({ error: 'Failed to fetch certificate metadata' });
    }
  }

  /**
   * GET /api/certificates/:certificateId
   * Get full certificate details
   */
  async getCertificate(req: Request, res: Response): Promise<void> {
    try {
      const { certificateId } = req.params;

      const certificate = await certificateService.getCertificateById(certificateId);

      if (!certificate) {
        res.status(404).json({ error: 'Certificate not found' });
        return;
      }

      res.status(200).json(certificate);
    } catch (error) {
      logger.error(
        `Get certificate error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      res.status(500).json({ error: 'Failed to fetch certificate' });
    }
  }

  /**
   * GET /api/certificates/student/:studentId
   * Get all certificates for a student
   */
  async getCertificatesByStudent(req: Request, res: Response): Promise<void> {
    try {
      const { studentId } = req.params;

      const certificates = await certificateService.getCertificatesByStudent(studentId);

      res.status(200).json({
        studentId,
        count: certificates.length,
        certificates,
      });
    } catch (error) {
      logger.error(
        `Get student certificates error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      res.status(500).json({ error: 'Failed to fetch student certificates' });
    }
  }

  /**
   * POST /api/certificates
   * Mint a new certificate (Issuer only - would require auth middleware)
   */
  async mintCertificate(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body;

      // Validate required fields
      const { studentId, courseId, tokenId, grade, did } = body;

      if (!studentId || !courseId) {
        res.status(400).json({
          error: 'studentId and courseId are required',
        });
        return;
      }

      // Get issuer info from request (would come from auth middleware)
      const issuerDid =
        (req as any).user?.did ||
        (req as any).user?.walletAddress ||
        process.env.ISSUER_DID ||
        'did:stellar:GBRPYHIL2CI3FYQMWVUGE62KMGOBQKLCYJ3HLKBUBIW5VZH4S4MNOWT';

      const contractAddress = process.env.CERTIFICATE_CONTRACT_ADDRESS || 'GUNKNOWNCONTRACT';
      const network = process.env.STELLAR_NETWORK || 'stellar-testnet';

      const result = await certificateService.mintCertificate(
        {
          studentId,
          courseId,
          tokenId,
          grade,
          did,
        },
        issuerDid,
        contractAddress,
        network
      );

      logger.info(`Certificate minted: ${result.id}`, { certificateId: result.id });

      res.status(201).json({
        success: true,
        certificate: result,
        metadata: result.metadata,
      });
    } catch (error) {
      logger.error(
        `Mint certificate error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to mint certificate',
        success: false,
      });
    }
  }

  /**
   * PUT /api/certificates/:certificateId/revoke
   * Revoke a certificate
   */
  async revokeCertificate(req: Request, res: Response): Promise<void> {
    try {
      const { certificateId } = req.params;
      const { reason, revokedBy } = req.body;

      if (!reason) {
        res.status(400).json({ error: 'Revocation reason is required' });
        return;
      }

      if (!revokedBy) {
        res.status(400).json({ error: 'revokedBy is required' });
        return;
      }

      const result = await revocationService.revokeCertificate(certificateId, {
        certificateId,
        reason,
        revokedBy,
      });

      res.status(200).json({
        success: true,
        certificate: result,
        message: 'Certificate revoked successfully',
      });
    } catch (error) {
      logger.error(`Revoke error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to revoke certificate',
      });
    }
  }

  /**
   * POST /api/certificates/:certificateId/reissue
   * Reissue a certificate (updates existing)
   */
  async reissueCertificate(req: Request, res: Response): Promise<void> {
    try {
      const { certificateId } = req.params;
      const { reason, newGrade, issuedBy } = req.body;

      if (!reason) {
        res.status(400).json({ error: 'Reissuance reason is required' });
        return;
      }

      if (!issuedBy) {
        res.status(400).json({ error: 'issuedBy is required' });
        return;
      }

      const result = await revocationService.reissueCertificate({
        certificateId,
        reason,
        newGrade,
        issuedBy,
      });

      res.status(200).json({
        success: true,
        original: result.original,
        newCertificate: result.new,
        message: 'Certificate reissued successfully',
      });
    } catch (error) {
      logger.error(`Reissue error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to reissue certificate',
      });
    }
  }

  /**
   * GET /api/certificates
   * List all certificates (with pagination)
   */
  async listCertificates(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string;

      if (limit > 100) {
        res.status(400).json({ error: 'Limit cannot exceed 100' });
        return;
      }

      let result;
      if (status) {
        result = await certificateService.getCertificatesByStatus(status as any);
      } else {
        result = await certificateService.getAllCertificates(limit, offset);
      }

      res.status(200).json(result);
    } catch (error) {
      logger.error(
        `List certificates error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      res.status(500).json({ error: 'Failed to fetch certificates' });
    }
  }

  /**
   * GET /api/certificates/analytics
   * Get certificate analytics (admin)
   */
  async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const analytics = await certificateAnalytics.getAnalytics();
      res.status(200).json(analytics);
    } catch (error) {
      logger.error(`Analytics error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  }

  /**
   * GET /api/certificates/:id/image
   * Generate certificate image
   */
  async getCertificateImage(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { format } = req.query;

      const certificate = await certificateService.getCertificateById(id);

      if (!certificate) {
        res.status(404).json({ error: 'Certificate not found' });
        return;
      }

      // Would generate image
      // For now, return a placeholder
      res.set('Content-Type', 'image/png');
      res.status(200).send(
        Buffer.from(
          `<svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#ffffff"/>
            <text x="50%" y="50%" font-size="48" text-anchor="middle">Certificate Image</text>
          </svg>`
        )
      );
    } catch (error) {
      logger.error(
        `Image generation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      res.status(500).json({ error: 'Failed to generate certificate image' });
    }
  }

  /**
   * GET /api/certificates/:id/qr
   * Generate QR code for certificate
   */
  async getQRCode(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const certificate = await certificateService.getCertificateById(id);

      if (!certificate) {
        res.status(404).json({ error: 'Certificate not found' });
        return;
      }

      const qrDataUrl = await qrCodeGenerator.generateCertificateVerificationQR(
        certificate.tokenId || certificate.id
      );

      res.set('Content-Type', 'image/png');
      // Convert base64 to buffer
      const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, '');
      res.status(200).send(Buffer.from(base64Data, 'base64'));
    } catch (error) {
      logger.error(
        `QR generation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      res.status(500).json({ error: 'Failed to generate QR code' });
    }
  }
}

export const certificateController = new CertificateController();
