/**
 * Per-user resources used by the Section Finder (SCRUM-83).
 *
 * Mount: /users  (gateway proxies /api/users → drafting/users)
 *
 * Endpoints:
 *   GET    /users/me/bookmarks/sections        — list user's bookmarks
 *   POST   /users/me/bookmarks/sections        — add bookmark
 *   DELETE /users/me/bookmarks/sections/:id    — remove bookmark
 *   GET    /users/me/recent/sections           — last 20 recent lookups
 *   POST   /users/me/recent/sections           — log a search (upserts; bumps searchedAt)
 *
 * All routes require the gateway authChain (validated via authenticate
 * middleware reading X-User-* headers).
 */
import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';

import { authenticate } from '../middleware/authenticate';
import { SectionBookmark } from '../models/SectionBookmark.model';
import { SectionRecent } from '../models/SectionRecent.model';

const router = Router();

const RECENT_LIMIT = 20;

function userObjectId(req: Request): Types.ObjectId | null {
  const id = req.jwtPayload?.sub;
  if (!id || !Types.ObjectId.isValid(id)) return null;
  return new Types.ObjectId(id);
}

// ── Bookmarks ───────────────────────────────────────────────────────────────

router.get(
  '/me/bookmarks/sections',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const uid = userObjectId(req);
    if (!uid) {
      res.status(401).json({ error: 'Invalid user context' });
      return;
    }
    const rows = await SectionBookmark.find({ userId: uid }).sort({ createdAt: -1 }).lean();
    res.json({
      bookmarks: rows.map((r) => ({
        id: String(r._id),
        code: r.code,
        section: r.section,
        title: r.title,
        createdAt: r.createdAt,
      })),
      count: rows.length,
    });
  },
);

router.post(
  '/me/bookmarks/sections',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const uid = userObjectId(req);
    if (!uid) {
      res.status(401).json({ error: 'Invalid user context' });
      return;
    }
    const { code, section, title } = req.body ?? {};
    if (
      typeof code !== 'string' ||
      !code.trim() ||
      typeof section !== 'string' ||
      !section.trim()
    ) {
      res.status(400).json({ error: 'code and section are required' });
      return;
    }
    try {
      const row = await SectionBookmark.findOneAndUpdate(
        { userId: uid, code: code.trim(), section: section.trim() },
        { $setOnInsert: { title: typeof title === 'string' ? title : '' } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
      res.status(201).json({
        id: String(row!._id),
        code: row!.code,
        section: row!.section,
        title: row!.title,
        createdAt: row!.createdAt,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.delete(
  '/me/bookmarks/sections/:id',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const uid = userObjectId(req);
    if (!uid) {
      res.status(401).json({ error: 'Invalid user context' });
      return;
    }
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid bookmark id' });
      return;
    }
    const result = await SectionBookmark.deleteOne({ _id: new Types.ObjectId(id), userId: uid });
    if (result.deletedCount === 0) {
      res.status(404).json({ error: 'Bookmark not found' });
      return;
    }
    res.status(204).end();
  },
);

// ── Recent searches ─────────────────────────────────────────────────────────

router.get(
  '/me/recent/sections',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const uid = userObjectId(req);
    if (!uid) {
      res.status(401).json({ error: 'Invalid user context' });
      return;
    }
    const rows = await SectionRecent.find({ userId: uid })
      .sort({ searchedAt: -1 })
      .limit(RECENT_LIMIT)
      .lean();
    res.json({
      recent: rows.map((r) => ({
        code: r.code,
        section: r.section,
        title: r.title,
        searchedAt: r.searchedAt,
      })),
      count: rows.length,
    });
  },
);

router.post(
  '/me/recent/sections',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const uid = userObjectId(req);
    if (!uid) {
      res.status(401).json({ error: 'Invalid user context' });
      return;
    }
    const { code, section, title } = req.body ?? {};
    if (
      typeof code !== 'string' ||
      !code.trim() ||
      typeof section !== 'string' ||
      !section.trim()
    ) {
      res.status(400).json({ error: 'code and section are required' });
      return;
    }
    try {
      const row = await SectionRecent.findOneAndUpdate(
        { userId: uid, code: code.trim(), section: section.trim() },
        {
          $set: {
            searchedAt: new Date(),
            ...(typeof title === 'string' && title.length > 0 ? { title } : {}),
          },
        },
        { upsert: true, new: true },
      ).lean();
      res.status(200).json({
        code: row!.code,
        section: row!.section,
        title: row!.title,
        searchedAt: row!.searchedAt,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

export default router;
