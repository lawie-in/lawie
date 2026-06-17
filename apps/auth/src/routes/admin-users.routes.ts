/**
 * Admin user-management routes (auth service).
 *
 *   PATCH /admin/users/:userId/status  — activate or deactivate a user
 *
 * Admin-only. Complementary to the drafting service admin-users.routes.ts
 * which owns the read + ink-grant routes (drafting can read the full User doc
 * via strict:false, but only auth is authoritative to mutate auth fields).
 */
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';

import { authenticate } from '../middleware/authenticate';
import { User } from '../models/User.model';

const router = Router();

function requireAdmin(req: Request, res: Response, next: () => void): void {
  if (req.jwtPayload?.role !== 'Admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

// ── PATCH /admin/users/:userId/status ─────────────────────────────────────────

router.patch(
  '/admin/users/:userId/status',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const { isActive } = req.body as { isActive?: boolean };

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ error: 'Invalid userId' });
      return;
    }
    if (typeof isActive !== 'boolean') {
      res.status(400).json({ error: 'isActive must be a boolean' });
      return;
    }

    const user = await User.findByIdAndUpdate(
      new mongoose.Types.ObjectId(userId),
      { $set: { isActive } },
      { new: true },
    ).lean();

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ _id: String(user._id), isActive: user.isActive ?? true });
  },
);

export default router;
