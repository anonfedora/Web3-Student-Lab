import prisma from '../db/index.js';
import { CertificateStatus } from '../types/certificate.types.js';
import logger from '../utils/logger.js';

export class CertificateAnalytics {
  /**
   * Gets comprehensive certificate analytics
   */
  async getAnalytics(): Promise<{
    totalCertificates: number;
    byStatus: Record<string, number>;
    totalVerifications: number;
    uniqueStudents: number;
    uniqueCourses: number;
    revocationRate: number;
    issuedThisMonth: number;
    issuedThisWeek: number;
    issuedToday: number;
  }> {
    const [totalCertificates, byStatusRaw, uniqueStudents, uniqueCourses] = await Promise.all([
      prisma.certificate.count(),
      prisma.certificate.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      prisma.certificate.groupBy({
        by: ['studentId'],
        _count: { studentId: true },
      }),
      prisma.certificate.groupBy({
        by: ['courseId'],
        _count: { courseId: true },
      }),
    ]);

    // Transform status counts into object
    const byStatus = byStatusRaw.reduce(
      (acc, item) => {
        acc[item.status] = item._count.status;
        return acc;
      },
      {} as Record<string, number>
    );

    // Get verifications count (would be from separate table in full implementation)
    const totalVerifications = await this.getTotalVerifications();

    // Get various issued counts
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [issuedThisMonth, issuedThisWeek, issuedToday] = await Promise.all([
      prisma.certificate.count({
        where: { issuedAt: { gte: startOfMonth } },
      }),
      prisma.certificate.count({
        where: { issuedAt: { gte: startOfWeek } },
      }),
      prisma.certificate.count({
        where: { issuedAt: { gte: startOfDay } },
      }),
    ]);

    // Calculate revocation rate
    const revokedCount = byStatus[CertificateStatus.REVOKED] || 0;
    const revocationRate = totalCertificates > 0 ? revokedCount / totalCertificates : 0;

    return {
      totalCertificates,
      byStatus,
      totalVerifications,
      uniqueStudents: uniqueStudents.length,
      uniqueCourses: uniqueCourses.length,
      revocationRate,
      issuedThisMonth,
      issuedThisWeek,
      issuedToday,
    };
  }

  /**
   * Gets daily certificate issuance for charting
   */
  async getDailyIssuance(days = 30): Promise<Array<{ date: string; count: number }>> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const results = await prisma.$queryRaw`
      SELECT 
        DATE(issued_at) as date,
        COUNT(*) as count
      FROM certificates
      WHERE issued_at >= ${startDate.toISOString()}
      GROUP BY DATE(issued_at)
      ORDER BY date ASC
    `;

    // Fill missing dates with zeros
    const filled = this.fillDateRange(startDate, endDate, results as any[]);

    return filled;
  }

  /**
   * Gets most popular courses by certificate count
   */
  async getTopCourses(limit = 10): Promise<
    Array<{
      courseId: string;
      title: string;
      certificateCount: number;
    }>
  > {
    const results = await prisma.certificate.groupBy({
      by: ['courseId'],
      _count: { courseId: true },
      orderBy: { _count: { courseId: 'desc' } },
      take: limit,
    });

    // Fetch course titles
    const courseIds = results.map((r) => r.courseId);
    const courses = await prisma.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, title: true },
    });

    const courseMap = new Map(courses.map((c) => [c.id, c.title]));

    return results.map((r) => ({
      courseId: r.courseId,
      title: courseMap.get(r.courseId) || 'Unknown Course',
      certificateCount: r._count.courseId,
    }));
  }

  /**
   * Gets certificate verification statistics
   */
  async getVerificationStats(): Promise<{
    total: number;
    verificationsToday: number;
    uniqueVerifyers: number; // unique IPs or user agents
    averageVerificationTime: number; // ms
    verificationRate: number; // verifications per certificate
  }> {
    // In a full implementation, you'd have a VerificationLog table
    // For now, return basic metrics

    const totalCertificates = await prisma.certificate.count();

    // Placeholder - in production, these would be calculated from analytics logs
    const verificationsToday = await this.getDailyVerificationsCount(1);
    const uniqueVerifyers = await this.getUniqueVerifyers();

    // Mock average verification time (would be from performance logs)
    const averageVerificationTime = 125; // ms

    return {
      total: totalCertificates * 3, // Each cert verified ~3 times on average
      verificationsToday,
      uniqueVerifyers,
      averageVerificationTime,
      verificationRate: totalCertificates > 0 ? 3 : 0,
    };
  }

  /**
   * Gets certificate trends over time
   */
  async getTrends(period: '7d' | '30d' | '90d' = '30d'): Promise<{
    issuance: Array<{ date: string; count: number }>;
    revocations: Array<{ date: string; count: number }>;
    verifications: Array<{ date: string; count: number }>;
  }> {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get issuance trend
    const issuance = await this.getDailyIssuance(days);

    // Get revocation trend
    const revocationTrend = await prisma.$queryRaw`
      SELECT 
        DATE(updated_at) as date,
        COUNT(*) as count
      FROM certificates
      WHERE status = 'REVOKED'
        AND updated_at >= ${startDate.toISOString()}
        AND revoked_at IS NOT NULL
      GROUP BY DATE(updated_at)
      ORDER BY date ASC
    `;

    const revokedFilled = this.fillDateRange(startDate, endDate, (revocationTrend as any[]) || []);

    return {
      issuance,
      revocations: revokedFilled,
      verifications: [], // Placeholder
    };
  }

  /**
   * Gets summary statistics for a dashboard
   */
  async getDashboardSummary(): Promise<{
    overview: {
      totalCertificates: number;
      activeCertificates: number;
      revokedCertificates: number;
      verificationRate: number;
    };
    recentActivity: Array<{
      id: string;
      action: 'issued' | 'revoked' | 'reissued' | 'verified';
      timestamp: Date;
      details: string;
    }>;
  }> {
    const analytics = await this.getAnalytics();

    const overview = {
      totalCertificates: analytics.totalCertificates,
      activeCertificates: analytics.byStatus[CertificateStatus.ACTIVE] || 0,
      revokedCertificates: analytics.byStatus[CertificateStatus.REVOKED] || 0,
      verificationRate: 0, // Would be calculated
    };

    // Get recent activity (placeholder - in production, would use an audit log)
    const recentActivity = await this.getRecentActivity();

    return { overview, recentActivity };
  }

  // Private helper methods

  private async getTotalVerifications(): Promise<number> {
    // Would query a verification_logs table
    // Placeholder: 3x per certificate average
    const total = await prisma.certificate.count();
    return total * 3;
  }

  private async getDailyVerificationsCount(days: number): Promise<number> {
    // Placeholder - would query analytics table
    return 0;
  }

  private async getUniqueVerifyers(): Promise<number> {
    // Placeholder - would count unique IPs/user agents
    return 0;
  }

  private fillDateRange(
    startDate: Date,
    endDate: Date,
    data: { date: string; count: number }[]
  ): { date: string; count: number }[] {
    const result: { date: string; count: number }[] = [];
    const dataMap = new Map(data.map((d) => [d.date, d.count]));

    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0];
      result.push({
        date: dateStr,
        count: dataMap.get(dateStr) || 0,
      });
      current.setDate(current.getDate() + 1);
    }

    return result;
  }

  private async getRecentActivity(): Promise<any[]> {
    // Would query an audit trail or log table
    // For now return empty list
    return [];
  }
}

export const certificateAnalytics = new CertificateAnalytics();
