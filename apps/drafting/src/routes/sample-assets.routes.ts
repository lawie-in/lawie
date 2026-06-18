import { Router, Request, Response } from 'express';

import { StaticAsset } from '../models/StaticAsset.model';

const router = Router();

// GET /sample-assets/:slug — public, no auth. Streams a stored PDF to the browser.
router.get('/:slug', async (req: Request, res: Response): Promise<void> => {
  const asset = await StaticAsset.findOne({ slug: req.params['slug'] }).lean();

  if (!asset) {
    res.status(404).json({ error: 'Sample not found' });
    return;
  }

  res.setHeader('Content-Type', asset.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${asset.filename}"`);
  res.setHeader('Content-Length', asset.data.length);
  res.setHeader('Cache-Control', 'public, max-age=86400'); // cache 24h — static asset
  res.send(asset.data);
});

export default router;
