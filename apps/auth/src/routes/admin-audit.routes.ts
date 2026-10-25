/**
 * Admin audit log route — feeds /admin/audit-log.
 *
 *   GET /admin/audit-log   Paginated AuditLog viewer with severity + event type filters
 *
 * Admin-only.
 */
import { Router, Request, Response } from 'express';

import { authenticate } from '../middleware/authenticate';
import { AuditLog } from '../models/AuditLog.model';
import { User } from '../models/User.model';

const router = Router();

function requireAdmin(req: Request, res: Response, next: () => void): void {
  if (req.jwtPayload?.role !== 'Admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

router.get(
  '/admin/audit-log',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const severity = String(req.query['severity'] ?? '').trim();
    const eventType = String(req.query['eventType'] ?? '').trim();
    const from = req.query['from'] ? new Date(String(req.query['from'])) : null;
    const to = req.query['to'] ? new Date(String(req.query['to'])) : null;
    const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
    const skip = Number(req.query['skip'] ?? 0);

    const filter: Record<string, unknown> = {};
    if (severity) filter['severity'] = severity;
    if (eventType) filter['eventType'] = eventType;
    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter['$gte'] = from;
      if (to) dateFilter['$lte'] = to;
      filter['createdAt'] = dateFilter;
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);

    // Decorate with user names
    const userIds = logs.filter((l) => l.userId).map((l) => String(l.userId));
    const users = await User.find({ _id: { $in: userIds } })
      .select('name email')
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    res.json({
      logs: logs.map((l) => {
        const u = l.userId ? userMap.get(String(l.userId)) : null;
        return {
          _id: String(l._id),
          userId: l.userId ? String(l.userId) : null,
          userName: (u as { name?: string } | null | undefined)?.name ?? null,
          userEmail: (u as { email?: string } | null | undefined)?.email ?? null,
          eventType: l.eventType,
          severity: l.severity,
          ipAddress: l.ipAddress ?? null,
          metadata: l.metadata ?? null,
          createdAt: l.createdAt,
        };
      }),
      total,
      limit,
      skip,
    });
  },
);

export default router;
