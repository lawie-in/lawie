/**
 * T-613: when indian-courts.json cannot be read, GET /courts/states still answers with the
 * record names, and logs one warning that carries the file path only.
 */
import './setupEnv';
import './setupDb';
import request from 'supertest';

const mockWarn = jest.fn();
jest.mock('../config/logger', () => {
  const l = {
    warn: (...a: unknown[]) => mockWarn(...a),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: () => l,
  };
  return { __esModule: true, default: l, logger: l };
});

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    readFileSync: (p: unknown, ...rest: unknown[]) => {
      if (typeof p === 'string' && p.endsWith('indian-courts.json')) {
        throw new Error('ENOENT: simulated');
      }
      return actual.readFileSync(p, ...rest);
    },
  };
});

import app from '../app';
import { Court } from '../models/Court.model';

describe('T-613: /courts/states when the courts file is unreadable', () => {
  beforeEach(async () => {
    mockWarn.mockClear();
    await Court.collection.insertMany([
      {
        courtId: 'w_1',
        courtType: 'high_court',
        state: 'Recordland',
        stateId: 'rl',
        isActive: true,
      },
      { courtId: 'w_2', courtType: 'sessions', state: 'Recordland', stateId: 'rl', isActive: true },
    ] as never[]);
  });

  it('answers with record names and warns once, with the file path only', async () => {
    const a = await request(app).get('/courts/states');
    const b = await request(app).get('/courts/states');
    expect(a.status).toBe(200);
    expect(a.body.states).toEqual([{ id: 'rl', name: 'Recordland' }]);
    expect(b.body.states).toEqual(a.body.states);

    expect(mockWarn).toHaveBeenCalledTimes(1);
    const [obj, msg] = mockWarn.mock.calls[0];
    expect(Object.keys(obj)).toEqual(['file']);
    expect(String(obj.file)).toMatch(/indian-courts\.json$/);
    expect(typeof msg).toBe('string');
  });
});
