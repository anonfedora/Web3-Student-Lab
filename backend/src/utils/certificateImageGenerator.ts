import { createCanvas, loadImage, registerFont } from 'canvas';
import { CertificateImageOptions } from '../types/certificate.types.js';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if canvas is available
let canvasAvailable = false;
try {
  require.resolve('canvas');
  canvasAvailable = true;
} catch (e) {
  // canvas not installed
}

/**
 * Certificate Image Generator
 * Creates PNG images of certificates with customizable styling
 */
export class CertificateImageGenerator {
  private readonly width: number;
  private readonly height: number;
  private readonly basePath: string;

  constructor() {
    this.width = 1200;
    this.height = 800;
    this.basePath = process.env.CERT_IMAGE_BASE_PATH || __dirname;
  }

  /**
   * Generates a certificate PNG image
   */
  async generateCertificateImage(options: CertificateImageOptions): Promise<Buffer> {
    if (!canvasAvailable) {
      return this.generatePlaceholderImage(options);
    }

    return await this.renderCertificate(options);
  }

  /**
   * Generates a certificate using canvas
   */
  private async renderCertificate(options: CertificateImageOptions): Promise<Buffer> {
    const canvas = createCanvas(this.width, this.height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.width, this.height);

    // Border
    ctx.strokeStyle = '#1a56db';
    ctx.lineWidth = 20;
    ctx.strokeRect(40, 40, this.width - 80, this.height - 80);

    // Inner decorative border
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 4;
    ctx.strokeRect(60, 60, this.width - 120, this.height - 120);

    // Header
    ctx.fillStyle = '#1a56db';
    ctx.fillRect(60, 60, this.width - 120, 80);

    // Title text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Certificate of Completion', this.width / 2, 100);

    // Credential ID
    ctx.fillStyle = '#6b7280';
    ctx.font = '16px Arial';
    ctx.fillText(`Credential ID: ${options.credentialId}`, this.width / 2, 150);

    // Main content
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 28px Arial';
    ctx.fillText('This certifies that', this.width / 2, 220);

    // Student name
    ctx.fillStyle = '#1a56db';
    ctx.font = 'bold 48px Arial';
    ctx.fillText(options.studentName, this.width / 2, 280);

    // Has successfully completed
    ctx.fillStyle = '#111827';
    ctx.font = '24px Arial';
    ctx.fillText('has successfully completed the course', this.width / 2, 340);

    // Course title
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 36px Arial';
    ctx.fillText(`"${options.courseTitle}"`, this.width / 2, 400);

    // Instructor
    ctx.fillStyle = '#4b5563';
    ctx.font = '20px Arial';
    ctx.fillText(`Instructor: ${options.instructor}`, this.width / 2, 460);

    // Dates
    ctx.font = '18px Arial';
    ctx.fillText(
      `Completion Date: ${new Date(options.completionDate).toLocaleDateString()}`,
      this.width / 2,
      510
    );

    // Grade if present
    if (options.grade) {
      ctx.fillText(`Final Grade: ${options.grade}`, this.width / 2, 550);
    }

    // Issuer
    ctx.fillStyle = '#374151';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(options.issuerName, this.width / 2, 630);

    // QR code placeholder (in real implementation would render QR)
    if (options.credentialId) {
      await this.drawQRCode(ctx, options.credentialId, 1000, 600, 120);
    }

    // Date string at bottom
    ctx.fillStyle = '#9ca3af';
    ctx.font = '14px Arial';
    ctx.fillText(`Generated: ${new Date().toLocaleDateString()}`, this.width / 2, this.height - 80);

    return canvas.toBuffer('image/png');
  }

  /**
   * Placeholder image generation (when canvas not available)
   */
  private generatePlaceholderImage(options: CertificateImageOptions): Buffer {
    // Create a simple SVG-based placeholder
    const svg = this.generateSVGPlaceholder(options);
    return Buffer.from(svg);
  }

  /**
   * Generates an SVG certificate as placeholder
   */
  private generateSVGPlaceholder(options: CertificateImageOptions): string {
    const { studentName, courseTitle, instructor, completionDate, credentialId, issuerName } =
      options;

    const formattedDate = new Date(completionDate).toLocaleDateString();

    return `<svg width="${this.width}" height="${this.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <rect x="60" y="60" width="${this.width - 120}" height="${this.height - 120}" fill="none" stroke="#e5e7eb" stroke-width="4"/>
  <rect x="60" y="60" width="${this.width - 120}" height="80" fill="#1a56db"/>
  <text x="50%" y="100" font-family="Arial" font-size="36" font-weight="bold" fill="white" text-anchor="middle">Certificate of Completion</text>
  <text x="50%" y="150" font-family="Arial" font-size="16" fill="#6b7280" text-anchor="middle">Credential ID: ${credentialId}</text>
  <text x="50%" y="220" font-family="Arial" font-size="24" fill="#111827" text-anchor="middle">This certifies that</text>
  <text x="50%" y="280" font-family="Arial" font-size="48" font-weight="bold" fill="#1a56db" text-anchor="middle">${this.escapeXml(studentName)}</text>
  <text x="50%" y="340" font-family="Arial" font-size="24" fill="#111827" text-anchor="middle">has successfully completed the course</text>
  <text x="50%" y="400" font-family="Arial" font-size="36" font-weight="bold" fill="#1f2937" text-anchor="middle">"${this.escapeXml(courseTitle)}"</text>
  <text x="50%" y="460" font-family="Arial" font-size="20" fill="#4b5563" text-anchor="middle">Instructor: ${this.escapeXml(instructor)}</text>
  <text x="50%" y="510" font-family="Arial" font-size="18" fill="#374151" text-anchor="middle">Completion Date: ${formattedDate}</text>
  <text x="50%" y="630" font-family="Arial" font-size="22" font-weight="bold" fill="#374151" text-anchor="middle">${this.escapeXml(issuerName)}</text>
</svg>`;
  }

  /**
   * Draws QR code placeholder on canvas
   */
  private async drawQRCode(
    ctx: any,
    data: string,
    x: number,
    y: number,
    size: number
  ): Promise<void> {
    // Draw placeholder rectangle
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(x, y, size, size);

    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('QR', x + size / 2, y + size / 2 + 4);
  }

  /**
   * Escapes XML special characters for SVG
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Generates a certificate template for a specific style
   * In production, this could support multiple templates
   */
  getTemplateNames(): string[] {
    return ['professional-blue', 'modern-minimal', 'classic-gold', 'tech-dark'];
  }
}

export const certificateImageGenerator = new CertificateImageGenerator();
