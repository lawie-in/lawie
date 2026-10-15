/** T-229 AC6: errorHandler's logged url never carries a reset token (or an email in the path). */
import './setupEnv';
import type { NextFunction, Request, Response } from 'express';

import logger from '../config/logger';
import { errorHandler } from '../middleware/errorHandler';

const HEX64 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

describe('T-229 errorHandler logged url', () => {
  it('masks the reset token and email, drops the query', () => {
    const spy = jest.spyOn(logger, 'error').mockImplementation(() => undefined as never);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const req = {
      method: 'POST',
      url: `/api/auth/reset-password/${HEX64}/priya@example.com?utm=x`,
      ip: '1.2.3.4',
    } as unknown as Request;
    errorHandler(new Error('boom'), req, res, jest.fn() as NextFunction);
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0]![0] as { req: { url: string } };
    expect(payload.req.url).toBe('/api/auth/reset-password/[token]/[email]');
    expect(JSON.stringify(spy.mock.calls)).not.toContain(HEX64);
    expect(JSON.stringify(spy.mock.calls)).not.toContain('priya@example.com');
    spy.mockRestore();
  });
});
