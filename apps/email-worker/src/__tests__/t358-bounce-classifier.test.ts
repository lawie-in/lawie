/**
 * T-358 round 4 (review must-fix). A send failure counts as a recipient hard bounce (so it stamps
 * the T-358 clock) ONLY when ALL hold: an SMTP EmailSendError, code EENVELOPE, smtpCommand
 * 'RCPT TO', reply 550/551/553, and an enhanced status meaning a bad destination address:
 * 5.1.1, 5.1.2, 5.1.3, 5.1.6 or 5.1.10. Every other failure is OURS (quota 5.4.5, relay/policy
 * 5.7.x, MAIL FROM, sender not authorised, no enhanced code, SES ...): nothing is reported, the
 * job retries/fails, and the account stays held, so deletion never advances.
 *
 * Parts: the classifier table; fromSmtpError (allow-list, no address or response text kept);
 * end to end through the worker for the our-side failures. The auth half (nothing reported ->
 * nothing stamped -> never due for deletion) is in apps/auth t358-round4.test.ts.
 */
import * as Sentry from '@sentry/node';
import type { Job } from 'bullmq';

import {
  EmailSendError,
  fromSesError,
  fromSmtpError,
  safeErrorFields,
} from '../providers/safe-log';
import {
  createProcessor,
  isRecipientHardBounce,
  type EmailJobData,
  type PreparedNotice,
  type UnverifiedNoticeDeps,
} from '../worker';

import { allLogText, dump, resetSink } from './helpers/t220-capture';

jest.mock('../config/logger', () =>
  jest.requireActual('./helpers/t220-capture').makeCapturingLogger(),
);
jest.mock('@sentry/node', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));
jest.mock('../templates', () => ({
  renderTemplate: jest.fn(async () => ({ subject: 's', html: '<p>x</p>', text: 'x' })),
}));
jest.mock('../placeholders', () => {
  const actual = jest.requireActual('../placeholders');
  return { ...actual, isLiveSend: () => true, templateHasUnfilledFooter: () => false };
});

const USER_ID = '64b7f0c2a1b2c3d4e5f60718';
const ADDRESS = 'leak.person@example.com';
const capture = Sentry.captureException as jest.Mock;
const crumb = Sentry.addBreadcrumb as jest.Mock;

const smtp = (o: { code?: string; status?: number; cmd?: string; enh?: string }) =>
  new EmailSendError('smtp', {
    errorName: 'Error',
    code: o.code,
    statusCode: o.status,
    smtpCommand: o.cmd,
    enhancedStatus: o.enh,
  });
const rcpt = (status: number, enh?: string) =>
  smtp({ code: 'EENVELOPE', status, cmd: 'RCPT TO', enh });

describe('classifier table: isRecipientHardBounce', () => {
  const GOOD_ENH = ['5.1.1', '5.1.2', '5.1.3', '5.1.6', '5.1.10'];
  const GOOD_CODES = [550, 551, 553];

  describe('counts as a recipient bounce: RCPT TO + 550/551/553 + a bad-destination status', () => {
    const rows = GOOD_CODES.flatMap((c) => GOOD_ENH.map((e) => [c, e] as const));
    it.each(rows)('reply %i with %s', (c, e) => {
      expect(isRecipientHardBounce(rcpt(c, e))).toBe(true);
    });
  });

  describe('RCPT TO, 550/551/553, but a status that is not a bad destination: ours', () => {
    const BAD_ENH = [
      '5.4.5', // quota
      '5.7.1', // relaying denied / policy
      '5.7.0',
      '5.7.26',
      '5.1.0', // unspecified
      '5.1.4', // ambiguous
      '5.1.7', // sender address
      '5.1.8', // sender system
      '5.2.2', // mailbox full
      '5.3.4',
      '5.4.1',
      '5.5.1',
      '4.1.1', // temporary class
      '5.1.11',
      '5.1.100',
      '',
      'foo',
    ];
    const rows = GOOD_CODES.flatMap((c) => BAD_ENH.map((e) => [c, e] as const));
    it.each(rows)('reply %i with enhanced status %j', (c, e) => {
      expect(isRecipientHardBounce(rcpt(c, e))).toBe(false);
    });
    it.each(GOOD_CODES)('reply %i with no enhanced status at all', (c) => {
      expect(isRecipientHardBounce(rcpt(c, undefined))).toBe(false);
    });
  });

  describe('a bad-destination status but the wrong reply code', () => {
    it.each([250, 421, 450, 451, 452, 500, 501, 502, 503, 504, 535, 552, 554, 555, 599])(
      'reply %i with 5.1.1',
      (c) => {
        expect(isRecipientHardBounce(rcpt(c, '5.1.1'))).toBe(false);
      },
    );
    it('no reply code at all', () => {
      expect(isRecipientHardBounce(rcpt(undefined as never, '5.1.1'))).toBe(false);
    });
  });

  describe('the wrong command: ours, even with 550 and 5.1.1', () => {
    it.each([
      'MAIL FROM',
      'DATA',
      'AUTH',
      'EHLO',
      'HELO',
      'STARTTLS',
      'CONN',
      'rcpt to',
      'RCPT',
      'RCPT TO ',
      undefined,
    ])('command %j', (cmd) => {
      expect(
        isRecipientHardBounce(smtp({ code: 'EENVELOPE', status: 550, cmd, enh: '5.1.1' })),
      ).toBe(false);
    });
    it.each([550, 551, 553])('MAIL FROM rejection %i with a destination-looking status', (c) => {
      expect(
        isRecipientHardBounce(
          smtp({ code: 'EENVELOPE', status: c, cmd: 'MAIL FROM', enh: '5.1.1' }),
        ),
      ).toBe(false);
      expect(
        isRecipientHardBounce(
          smtp({ code: 'EENVELOPE', status: c, cmd: 'MAIL FROM', enh: '5.1.8' }),
        ),
      ).toBe(false);
    });
  });

  describe('the wrong nodemailer code', () => {
    it.each([
      'EAUTH',
      'ECONNECTION',
      'ETIMEDOUT',
      'ESOCKET',
      'EMESSAGE',
      'EPROTOCOL',
      'ECONNREFUSED',
      'eenvelope',
      undefined,
    ])('code %j', (code) => {
      expect(isRecipientHardBounce(smtp({ code, status: 550, cmd: 'RCPT TO', enh: '5.1.1' }))).toBe(
        false,
      );
    });
  });

  describe('not SMTP, or not an EmailSendError', () => {
    it('SES errors never count, whatever fields they carry', () => {
      const ses = new EmailSendError('ses', {
        code: 'EENVELOPE',
        statusCode: 550,
        smtpCommand: 'RCPT TO',
        enhancedStatus: '5.1.1',
      });
      expect(isRecipientHardBounce(ses)).toBe(false);
      expect(
        isRecipientHardBounce(
          fromSesError({ name: 'MessageRejected', $metadata: { httpStatusCode: 400 } }),
        ),
      ).toBe(false);
      expect(isRecipientHardBounce(fromSesError({ name: 'Throttling', $fault: 'client' }))).toBe(
        false,
      );
      expect(isRecipientHardBounce(fromSesError({ name: 'AccountSendingPausedException' }))).toBe(
        false,
      );
    });
    it('plain objects, Errors, strings, numbers, null, undefined', () => {
      const lookalike = {
        provider: 'smtp',
        code: 'EENVELOPE',
        statusCode: 550,
        smtpCommand: 'RCPT TO',
        enhancedStatus: '5.1.1',
      };
      for (const v of [
        lookalike,
        new Error('550 5.1.1'),
        '550 5.1.1',
        550,
        null,
        undefined,
        {},
        [],
      ]) {
        expect(isRecipientHardBounce(v)).toBe(false);
      }
      const e = Object.assign(new Error('x'), lookalike);
      expect(isRecipientHardBounce(e)).toBe(false);
    });
  });
});

describe('fromSmtpError: what is kept from a nodemailer error', () => {
  const nm = (o: Record<string, unknown>) => Object.assign(new Error(`raw ${ADDRESS}`), o);

  it('a real recipient rejection classifies as a bounce', () => {
    const e = fromSmtpError(
      nm({
        name: 'Error',
        code: 'EENVELOPE',
        responseCode: 550,
        command: 'RCPT TO',
        response: `550 5.1.1 <${ADDRESS}>: Recipient address rejected: User unknown`,
      }),
    );
    expect(e.smtpCommand).toBe('RCPT TO');
    expect(e.enhancedStatus).toBe('5.1.1');
    expect(e.statusCode).toBe(550);
    expect(isRecipientHardBounce(e)).toBe(true);
  });

  it.each([
    ['daily quota on RCPT TO', 'RCPT TO', '550 5.4.5 Daily user sending quota exceeded.'],
    ['daily quota on MAIL FROM', 'MAIL FROM', '550 5.4.5 Daily user sending quota exceeded.'],
    ['relaying denied', 'RCPT TO', '550 5.7.1 Relaying denied'],
    [
      '553 sender not authorised, no enhanced code',
      'MAIL FROM',
      '553 Sender address not authorised',
    ],
    ['553 sender not authorised on RCPT TO', 'RCPT TO', '553 sender not authorised'],
    ['reply with no enhanced code', 'RCPT TO', '550 No such user here'],
    ['5.1.0', 'RCPT TO', '550 5.1.0 Address rejected'],
    ['5.1.4', 'RCPT TO', '550 5.1.4 Destination address ambiguous'],
    ['5.1.7', 'RCPT TO', '553 5.1.7 Bad sender address syntax'],
    ['5.1.8', 'RCPT TO', '550 5.1.8 Bad sender system address'],
  ])('%s is ours, never a bounce', (_l, command, response) => {
    const e = fromSmtpError(
      nm({
        name: 'Error',
        code: 'EENVELOPE',
        responseCode: Number(response.slice(0, 3)),
        command,
        response,
      }),
    );
    expect(isRecipientHardBounce(e)).toBe(false);
  });

  it.each([
    ['dash-continued reply', '550-5.1.1 The email account does not exist', '5.1.1'],
    ['status at the very end', '550 5.1.1', '5.1.1'],
    ['5.1.10', '550 5.1.10 RESOLVER.ADR.RecipientNotFound', '5.1.10'],
    ['leading spaces', '  550 5.1.2 Bad destination system', '5.1.2'],
    ['553 reply', '553 5.1.3 mailbox syntax incorrect', '5.1.3'],
  ])('parses %s', (_l, response, want) => {
    expect(fromSmtpError(nm({ command: 'RCPT TO', response })).enhancedStatus).toBe(want);
  });

  it.each([
    ['a status not at the start', '550 hello 5.1.1 later'],
    ['no reply code', '5.1.1 user unknown'],
    ['glued suffix', '550 5.1.1x'],
    ['a non-string', { text: '550 5.1.1' }],
    ['a number', 5511],
    ['null', null],
    ['empty', ''],
    ['an address first', `${ADDRESS} 550 5.1.1`],
    ['pushed past the 32-char read window', `550 ${'x'.repeat(40)} 5.1.1`],
  ])('does not read a status out of %s', (_l, response) => {
    expect(fromSmtpError(nm({ command: 'RCPT TO', response })).enhancedStatus).toBeUndefined();
  });

  it('keeps only the leading status code of a very long response (no second read)', () => {
    const e = fromSmtpError(
      nm({ command: 'RCPT TO', response: `550 5.1.1 ${'y'.repeat(1_000_000)}` }),
    );
    expect(e.enhancedStatus).toBe('5.1.1');
  });

  it('allow-lists the command: only the fixed list is kept', () => {
    for (const c of ['CONN', 'EHLO', 'HELO', 'STARTTLS', 'AUTH', 'MAIL FROM', 'RCPT TO', 'DATA']) {
      expect(fromSmtpError(nm({ command: c })).smtpCommand).toBe(c);
    }
    expect(fromSmtpError(nm({ command: 'AUTH PLAIN' })).smtpCommand).toBe('AUTH');
    for (const c of [
      `RCPT TO:<${ADDRESS}>`,
      'VRFY',
      `EVIL ${ADDRESS}`,
      '',
      7,
      null,
      undefined,
      {},
    ]) {
      expect(fromSmtpError(nm({ command: c })).smtpCommand).toBeUndefined();
    }
  });

  it('stores no address and no response text: not in the message, the fields, the logs-safe fields or JSON', () => {
    const response = `550 5.1.1 <${ADDRESS}>: Recipient address rejected: User unknown`;
    const e = fromSmtpError(
      nm({ name: 'Error', code: 'EENVELOPE', responseCode: 550, command: 'RCPT TO', response }),
    );
    const everything = [
      e.message,
      e.stack ?? '',
      JSON.stringify(e),
      JSON.stringify(safeErrorFields(e)),
      Object.values(e).map(String).join('|'),
    ].join('\n');
    expect(everything).not.toContain(ADDRESS);
    expect(everything).not.toContain('Recipient address rejected');
    expect(everything).not.toContain('User unknown');
    expect(e.message).toBe('smtp send failed: Error EENVELOPE 550');
  });

  it('smtpCommand and enhancedStatus are not part of safeErrorFields (logs and Sentry)', () => {
    const e = rcpt(550, '5.1.1');
    expect(safeErrorFields(e)).not.toHaveProperty('smtpCommand');
    expect(safeErrorFields(e)).not.toHaveProperty('enhancedStatus');
  });

  it('tolerates a null or non-object error', () => {
    for (const v of [null, undefined, 'x', 3]) {
      const e = fromSmtpError(v);
      expect(isRecipientHardBounce(e)).toBe(false);
    }
  });
});

describe('end to end through the worker: our-side SMTP failures never report', () => {
  const PREPARED: PreparedNotice = {
    notice: 'warning',
    variant: 'A',
    email: ADDRESS,
    name: 'Leak Person',
    link: 'https://app.lawie.in/verify-email?token=' + 'cd'.repeat(32),
    deletionDate: '21 October 2026',
  };
  function deps() {
    return {
      prepare: jest.fn(async () => PREPARED),
      report: jest.fn(async () => undefined),
    } as UnverifiedNoticeDeps & { prepare: jest.Mock; report: jest.Mock };
  }
  const job = (template: string, attemptsMade = 0, attempts = 5): Job<EmailJobData> =>
    ({
      id: 'job-1',
      queueName: 'email-low',
      attemptsMade,
      opts: { attempts },
      data: { template, to: [], cc: [], bcc: [], data: { userId: USER_ID } },
    }) as unknown as Job<EmailJobData>;
  const mint = async () => ({ email: ADDRESS, name: 'Leak Person', link: PREPARED.link as string });

  const SCENARIOS: Array<[string, Record<string, unknown>]> = [
    [
      'daily quota 550 5.4.5 on RCPT TO',
      {
        name: 'Error',
        code: 'EENVELOPE',
        responseCode: 550,
        command: 'RCPT TO',
        response: `550 5.4.5 Daily user sending quota exceeded for ${ADDRESS}`,
      },
    ],
    [
      'daily quota 550 5.4.5 on MAIL FROM',
      {
        name: 'Error',
        code: 'EENVELOPE',
        responseCode: 550,
        command: 'MAIL FROM',
        response: '550 5.4.5 Daily user sending quota exceeded',
      },
    ],
    [
      'relay denied 550 5.7.1',
      {
        name: 'Error',
        code: 'EENVELOPE',
        responseCode: 550,
        command: 'RCPT TO',
        response: '550 5.7.1 Relaying denied',
      },
    ],
    [
      '553 sender not authorised',
      {
        name: 'Error',
        code: 'EENVELOPE',
        responseCode: 553,
        command: 'MAIL FROM',
        response: '553 Sender address not authorised',
      },
    ],
    [
      '553 sender not authorised on RCPT TO, no 5.1.x',
      {
        name: 'Error',
        code: 'EENVELOPE',
        responseCode: 553,
        command: 'RCPT TO',
        response: '553 sender not authorised',
      },
    ],
    [
      '550 with no enhanced code',
      {
        name: 'Error',
        code: 'EENVELOPE',
        responseCode: 550,
        command: 'RCPT TO',
        response: '550 mailbox unavailable',
      },
    ],
  ];
  const nodemailerError = (o: Record<string, unknown>) =>
    Object.assign(new Error(`raw ${ADDRESS} ${String(o.response)}`), o);

  beforeEach(() => {
    resetSink();
    jest.clearAllMocks();
  });

  describe.each([
    ['notice (first/warning)', 'auth.unverifiedDeletionNotice'],
    ['verify email', 'auth.verifyEmail'],
  ])('%s job', (_label, template) => {
    it.each(SCENARIOS)(
      '%s: no report, the job fails (BullMQ retries), no Sentry on a non-final attempt',
      async (_l, fields) => {
        const send = jest.fn(async () => {
          throw fromSmtpError(nodemailerError(fields));
        });
        const d = deps();
        const err = await createProcessor(
          send,
          mint,
          d,
        )(job(template), 'tok').catch((e: Error) => e);
        expect(err).toBeInstanceOf(Error);
        expect(send).toHaveBeenCalledTimes(1);
        expect(d.report).not.toHaveBeenCalled();
        expect(capture).not.toHaveBeenCalled();
        const text = [
          allLogText(),
          dump(crumb.mock.calls),
          dump(capture.mock.calls),
          (err as Error).message,
          (err as Error).stack ?? '',
        ].join('\n');
        expect(text).not.toContain(ADDRESS);
        expect(text).not.toContain('quota exceeded');
        expect(text).not.toContain('Relaying denied');
        expect(text).not.toContain('not authorised');
      },
    );

    it.each(SCENARIOS)(
      '%s: on the final attempt it still reports nothing; one value-free Sentry event',
      async (_l, fields) => {
        const send = jest.fn(async () => {
          throw fromSmtpError(nodemailerError(fields));
        });
        const d = deps();
        await expect(
          createProcessor(send, mint, d)(job(template, 4, 5), 'tok'),
        ).rejects.toBeInstanceOf(Error);
        expect(d.report).not.toHaveBeenCalled();
        expect(capture).toHaveBeenCalledTimes(1);
        const text = [allLogText(), dump(capture.mock.calls)].join('\n');
        expect(text).not.toContain(ADDRESS);
        expect(text).not.toContain('quota exceeded');
      },
    );

    it('control: a genuine recipient rejection (RCPT TO, 550 5.1.1) IS reported as bounced and completes', async () => {
      const send = jest.fn(async () => {
        throw fromSmtpError(
          nodemailerError({
            name: 'Error',
            code: 'EENVELOPE',
            responseCode: 550,
            command: 'RCPT TO',
            response: `550 5.1.1 <${ADDRESS}> User unknown`,
          }),
        );
      });
      const d = deps();
      const result = await createProcessor(send, mint, d)(job(template), 'tok');
      expect(result).toEqual({ skipped: 'hard_bounce' });
      expect(d.report).toHaveBeenCalledTimes(1);
      expect(d.report.mock.calls[0][2]).toBe('bounced');
      expect(allLogText()).not.toContain(ADDRESS);
    });
  });

  it('the failure is retried by BullMQ across attempts and the report is never made, over every attempt', async () => {
    const send = jest.fn(async () => {
      throw fromSmtpError(nodemailerError(SCENARIOS[0][1]));
    });
    const d = deps();
    const p = createProcessor(send, mint, d);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        p(job('auth.unverifiedDeletionNotice', attempt, 5), 'tok'),
      ).rejects.toBeInstanceOf(Error);
    }
    expect(send).toHaveBeenCalledTimes(5);
    expect(d.report).not.toHaveBeenCalled();
    expect(capture).toHaveBeenCalledTimes(1); // only the final attempt
  });

  it('SES errors (quota, throttle, paused) never report either', async () => {
    for (const name of [
      'Throttling',
      'MessageRejected',
      'AccountSendingPausedException',
      'LimitExceededException',
    ]) {
      const send = jest.fn(async () => {
        throw fromSesError({ name, $metadata: { httpStatusCode: 400 }, $fault: 'client' });
      });
      const d = deps();
      await expect(
        createProcessor(send, mint, d)(job('auth.unverifiedDeletionNotice'), 'tok'),
      ).rejects.toBeInstanceOf(Error);
      expect(d.report).not.toHaveBeenCalled();
    }
  });
});
