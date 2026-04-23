 // Certificate NFT Metadata Types
// Based on OpenSea/ERC-721 metadata standards with educational extensions

export interface CertificateMetadataAttributes {
  trait_type: string;
  value: string | number;
}

export interface CertificateCourseInfo {
  id: string;
  title: string;
  instructor: string;
  credits: number;
  completionDate: string; // ISO date string
  grade?: string;
}

export interface CertificateStudentInfo {
  name: string;
  walletAddress: string;
}

export interface CertificateVerificationInfo {
  certificateId: string;
  mintedAt: string;
  contractAddress: string;
  tokenId: string;
  network: string;
  issuerDid: string; // Decentralized Identifier
}

export interface CertificateMetadata {
  // Required NFT metadata fields (ERC-721 standard)
  name: string;
  description: string;
  image: string;
  external_url: string;

  // Educational attributes (trait-based)
  attributes: CertificateMetadataAttributes[];

  // Educational metadata
  course: CertificateCourseInfo;
  student: CertificateStudentInfo;
  verification: CertificateVerificationInfo;

  // Compliance
  standard: string;
  version: string;
}

// Certificate Status Enum
export enum CertificateStatus {
  MINTED = 'MINTED',
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
  REISSUED = 'REISSUED',
  EXPIRED = 'EXPIRED',
  PENDING = 'PENDING',
}

// Certificate entity with DB fields
export interface Certificate {
  id: string;
  studentId: string;
  courseId: string;
  tokenId?: string; // On-chain token ID
  issuedAt: Date;
  certificateHash?: string;
  status: CertificateStatus;
  did?: string | null;
  metadataUri?: string; // Off-chain metadata URI
  contractAddress?: string;
  transactionHash?: string;
  network?: string;
  grade?: string;
  revokedAt?: Date | null;
  revocationReason?: string | null;
  revokedBy?: string | null;
  previousVersionId?: string | null; // Links to previous cert if reissued
  createdAt: Date;
  updatedAt: Date;
  // Relations
  student?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    walletAddress?: string;
  };
  course?: {
    id: string;
    title: string;
    description?: string;
    instructor: string;
    credits: number;
  };
}

// Verification Result
export interface VerificationResult {
  isValid: boolean;
  certificate: CertificateMetadata | null;
  status: CertificateStatus;
  onChainData: {
    tokenId: string;
    owner: string;
    mintedAt: Date;
    contractAddress: string;
    transactionHash: string;
    network: string;
  } | null;
  revocationInfo?: {
    revokedAt: Date;
    reason: string;
    revokedBy: string;
  };
  message?: string;
}

// Batch verification item
export interface BatchVerificationItem {
  tokenId: string;
  isValid: boolean;
  status: CertificateStatus;
  error?: string;
}

// Batch verification response
export interface BatchVerificationResponse {
  results: BatchVerificationItem[];
  summary: {
    total: number;
    valid: number;
    revoked: number;
    invalid: number;
  };
}

// Mint certificate request
export interface MintCertificateRequest {
  studentId: string;
  courseId: string;
  tokenId?: string; // Optional custom token ID
  grade?: string;
  did?: string;
}

// Revoke certificate request
export interface RevokeCertificateRequest {
  certificateId: string;
  reason: string;
  revokedBy: string; // Admin/instructor DID
}

// Reissue certificate request
export interface ReissueCertificateRequest {
  certificateId: string; // Original cert to reissue
  reason: string;
  newGrade?: string;
  issuedBy: string; // Admin/instructor DID
}

// Analytics data
export interface CertificateAnalytics {
  totalCertificates: number;
  byStatus: Record<CertificateStatus, number>;
  totalVerifications: number;
  verificationsByDate: { date: string; count: number }[];
  revocationRate: number;
  uniqueStudents: number;
  uniqueCourses: number;
}

// Certificate image generation options
export interface CertificateImageOptions {
  studentName: string;
  courseTitle: string;
  instructor: string;
  completionDate: string;
  grade?: string;
  credentialId: string;
  issuerName: string;
  logoUrl?: string;
}

// QR Code generation options
export interface QRCodeOptions {
  data: string;
  size?: number;
  format?: 'png' | 'svg';
}

// Blockchain service interface
export interface IBlockchainService {
  mintCertificate(metadata: CertificateMetadata): Promise<MintResult>;
  verifyOnChain(tokenId: string): Promise<boolean>;
  getOwner(tokenId: string): Promise<string>;
  revokeCertificate(tokenId: string, reason: string): Promise<void>;
  getTransactionHistory(tokenId: string): Promise<TransactionHistoryItem[]>;
  getCertificateData(tokenId: string): Promise<OnChainCertificateData | null>;
}

export interface MintResult {
  success: boolean;
  tokenId: string;
  transactionHash: string;
  contractAddress: string;
  error?: string;
}

export interface TransactionHistoryItem {
  transactionHash: string;
  timestamp: Date;
  type: 'MINT' | 'TRANSFER' | 'REVOKE' | 'BURN';
  from: string;
  to?: string;
  amount?: number;
}

export interface OnChainCertificateData {
  tokenId: string;
  owner: string;
  metadataUri: string;
  mintedAt: Date;
  contractAddress: string;
  transactionHash: string;
  network: string;
}
