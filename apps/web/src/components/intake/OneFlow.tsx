'use client';

/**
 * The one drafting flow (T-125, ADR-021): describe, a few questions, a brief
 * the advocate confirms, the draft. The same path for every document, with a
 * rule pack or without one.
 *
 * Everything the advocate types is held here, in memory, for the life of the
 * page. Going back and forward keeps all of it. Nothing is written to browser
 * storage, and it is dropped once the draft is written, on Cancel, and on
 * leaving the page.
 *
 * Design: T-126 (`handoff/design/T-126-the-brief-spec.md`). Fixed wording comes
 * from the service and is printed as received.
 */
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';

import BriefStep from './BriefStep';
import {
  Brief,
  BriefCourt,
  BriefItem,
  BriefQuestion,
  BriefResponse,
  countBlanks,
  DraftResult,
  Finding,
  GivenValue,
  isEmptyValue,
  KindSummary,
  NO_RULE_PACK,
  Value,
  valuesAfter,
  withValue,
} from './briefTypes';
import BrowseTypesStep from './BrowseTypesStep';
import ChangeDocumentDialog from './ChangeDocumentDialog';
import DescribeStep from './DescribeStep';
import DocumentChoiceStep, { NONE_OF_THESE } from './DocumentChoiceStep';
import DraftReadyStep from './DraftReadyStep';
import GeneratingStep from './GeneratingStep';
import NoMatchStep from './NoMatchStep';
import QuestionsStep from './QuestionsStep';

import { PaywallModal } from '@/components/credits/PaywallModal';
import { apiFetch } from '@/lib/apiFetch';

type Phase =
  | 'describe'
  | 'choice'
  | 'reception'
  | 'questions'
  | 'brief'
  | 'generating'
  | 'ready'
  | 'no_match'
  | 'browse';

const EMPTY_COURT: BriefCourt = { state: null, court_type: null, court: null };
const UNREADABLE = 'We could not read that just now. Try again, or browse document types.';
const JSON_POST = { method: 'POST', headers: { 'Content-Type': 'application/json' } } as const;

/** The questions of a round whose facts are still not given. */
function openQuestions(questions: BriefQuestion[], brief: Brief | null, round?: 1 | 2) {
  if (!brief) return [];
  const empty = new Set(brief.items.filter((i) => isEmptyValue(i.value)).map((i) => i.key));
  return questions.filter((q) => empty.has(q.key) && (round === undefined || q.round === round));
}

export default function OneFlow({
  kinds,
  loadingKinds,
}: {
  kinds: KindSummary[];
  loadingKinds: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('describe');
  const [description, setDescription] = useState('');
  /** Set when the document was picked from "Browse document types". */
  const [preset, setPreset] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; retry?: boolean } | null>(null);
  const [choices, setChoices] = useState<Array<{ kind: string; name: string }>>([]);

  const [brief, setBriefState] = useState<Brief | null>(null);
  const [questions, setQuestions] = useState<BriefQuestion[]>([]);
  const [questionRound, setQuestionRound] = useState<1 | 2>(1);
  /** How many rounds of questions have been shown, so the counter never shows a round twice (T-139). */
  const [roundsShown, setRoundsShown] = useState(0);
  const [reception, setReception] = useState<{
    questions: BriefQuestion[];
    nextRound: number;
  } | null>(null);
  const [changeOpen, setChangeOpen] = useState(false);
  const [briefMessage, setBriefMessage] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const [repairing, setRepairing] = useState(false);
  const [genError, setGenError] = useState<{ reason: string; retryable: boolean } | null>(null);
  const [result, setResult] = useState<DraftResult | null>(null);
  const [paywall, setPaywall] = useState<{ cost: number; balance: number } | null>(null);

  // What the next request must carry, readable without waiting for a render.
  const briefRef = useRef<Brief | null>(null);
  const valuesRef = useRef<GivenValue[]>([]);
  const courtRef = useRef<BriefCourt>(EMPTY_COURT);
  const answersRef = useRef<Array<{ question: string; answer: string }>>([]);
  const intakeId = useRef<string | undefined>(undefined);
  /** The document the advocate chose themselves. It survives an edit of the description. */
  const chosenKind = useRef<string | undefined>(undefined);
  /** The description and document the brief on screen was read from. */
  const lastRead = useRef<{ text: string; kind: string | null } | null>(null);
  const runId = useRef<string | undefined>(undefined);
  const updateSeq = useRef(0);

  const setBrief = useCallback((next: Brief | null) => {
    briefRef.current = next;
    setBriefState(next);
  }, []);

  /** Take the service's brief as the truth, and keep what it could not place. */
  const adopt = useCallback(
    (next: Brief) => {
      valuesRef.current = valuesAfter(next, valuesRef.current);
      courtRef.current = next.court;
      setBrief(next);
    },
    [setBrief],
  );

  const reset = useCallback(() => {
    setDescription('');
    setPreset(null);
    setMessage(null);
    setChoices([]);
    setBrief(null);
    setQuestions([]);
    setReception(null);
    setBriefMessage(null);
    setGenError(null);
    setRepairing(false);
    valuesRef.current = [];
    courtRef.current = EMPTY_COURT;
    answersRef.current = [];
    intakeId.current = undefined;
    chosenKind.current = undefined;
    lastRead.current = null;
    runId.current = undefined;
  }, [setBrief]);

  /** The description and every answer, for the dates the service reads again. */
  const everythingSaid = useCallback(
    () =>
      [description.trim(), ...answersRef.current.map((a) => a.answer)]
        .filter((t) => t.length > 0)
        .join('\n'),
    [description],
  );

  const typedByUser = () => valuesRef.current.filter((v) => v.source === 'user').slice(0, 100);

  // ── Describe, and read the brief ──────────────────────────────────────────

  const readBrief = useCallback(
    async (body: Record<string, unknown>, from: 'describe' | 'brief') => {
      setBusy(true);
      setMessage(null);
      setBriefMessage(null);
      const fail = (text: string, retry?: boolean) => {
        if (from === 'brief') {
          setBriefMessage(text);
          return;
        }
        setMessage({ text, retry });
        setPhase('describe');
      };
      try {
        const res = await apiFetch('/api/documents/intake/brief', {
          ...JSON_POST,
          body: JSON.stringify(body),
        });
        if (res.status === 429) {
          const data = (await res.json().catch(() => ({}))) as { message?: string };
          fail(
            data.message ??
              "You have used today's quota for describing. Browse document types still works.",
          );
          return;
        }
        if (res.status === 400) {
          fail('Please describe the matter in a little more detail.');
          return;
        }
        if (!res.ok) throw new Error('brief failed');
        const data = (await res.json()) as BriefResponse;
        if (data.intake_id) intakeId.current = data.intake_id;

        switch (data.outcome) {
          case 'brief': {
            if (!data.brief) throw new Error('no brief');
            adopt(data.brief);
            lastRead.current = {
              text: typeof body.description === 'string' ? body.description : '',
              kind: typeof body.kind === 'string' ? body.kind : null,
            };
            setReception(null);
            const asked = data.questions ?? [];
            setQuestions(asked);
            if (data.needs_upgrade) {
              setBriefMessage('This document needs the Pro plan. You can upgrade from Settings.');
            }
            const first = openQuestions(asked, data.brief, 1);
            // A new reading starts the count of rounds again: a new description
            // (from 'describe'), or another document read from the brief (from 'brief').
            setRoundsShown(from === 'describe' && first.length > 0 ? 1 : 0);
            if (from === 'describe' && first.length > 0) {
              setQuestionRound(1);
              setPhase('questions');
            } else {
              setPhase('brief');
            }
            return;
          }
          case 'questions':
            setReception({ questions: data.questions ?? [], nextRound: data.next_round ?? 2 });
            setPhase('reception');
            return;
          case 'needs_choice':
            setChoices(data.choices ?? []);
            setPhase('choice');
            return;
          case 'no_match':
            setPhase('no_match');
            return;
          default:
            fail(UNREADABLE, true);
        }
      } catch {
        fail(UNREADABLE, true);
      } finally {
        setBusy(false);
      }
    },
    [adopt],
  );

  const courtIfAny = () => {
    const c = courtRef.current;
    return c.state || c.court_type || c.court ? { court: c } : {};
  };

  const handleDescribe = useCallback(() => {
    const text = description.trim();
    const kind = chosenKind.current ?? preset?.id ?? null;
    // An unchanged description makes no new call: the brief is still the one read from it.
    if (
      briefRef.current &&
      lastRead.current &&
      lastRead.current.text === text &&
      lastRead.current.kind === kind
    ) {
      setMessage(null);
      setPhase('brief');
      return;
    }
    // A new description is a new intake. What the advocate typed in the brief is kept.
    intakeId.current = undefined;
    answersRef.current = [];
    const keep = typedByUser();
    void readBrief(
      {
        description: text,
        ...(kind ? { kind } : {}),
        ...(keep.length > 0 ? { keep } : {}),
        ...courtIfAny(),
      },
      'describe',
    );
  }, [description, preset, readBrief]);

  const handleChoose = useCallback(
    (templateId: string) => {
      const kind = templateId === NONE_OF_THESE ? NO_RULE_PACK : templateId;
      chosenKind.current = kind;
      const keep = typedByUser();
      void readBrief(
        {
          description: description.trim(),
          kind,
          ...(intakeId.current ? { intake_id: intakeId.current } : {}),
          ...(keep.length > 0 ? { keep } : {}),
          ...courtIfAny(),
        },
        'describe',
      );
    },
    [description, readBrief],
  );

  /** Reception's questions, when no rule pack fits. `skip` asks for the brief with what there is. */
  const sendReception = useCallback(
    (given: Array<{ question: BriefQuestion; value: Value }>, skip: boolean) => {
      if (!reception) return;
      const added = given.map((g) => ({
        question: g.question.question.slice(0, 300),
        answer: (Array.isArray(g.value) ? g.value.join('\n') : g.value).slice(0, 2000),
      }));
      answersRef.current = [...answersRef.current, ...added].slice(0, 10);
      const keep = typedByUser();
      void readBrief(
        {
          description: description.trim(),
          kind: NO_RULE_PACK,
          ...(intakeId.current ? { intake_id: intakeId.current } : {}),
          round: skip ? 3 : Math.min(3, reception.nextRound),
          answers: answersRef.current,
          ...(keep.length > 0 ? { keep } : {}),
          ...courtIfAny(),
        },
        'describe',
      );
    },
    [description, reception, readBrief],
  );

  // ── The brief: every change is worked out again by the service ────────────

  const update = useCallback(
    async (kindName?: string): Promise<Brief | null> => {
      const current = briefRef.current;
      if (!current) return null;
      const seq = ++updateSeq.current;
      setUpdating(true);
      setBriefMessage(null);
      const kind = current.kind.id ?? NO_RULE_PACK;
      try {
        const res = await apiFetch('/api/documents/intake/brief/update', {
          ...JSON_POST,
          body: JSON.stringify({
            kind,
            ...(kind === NO_RULE_PACK
              ? {
                  kind_name: kindName ?? current.kind.name,
                  court_document: current.kind.court_document,
                }
              : {}),
            values: valuesRef.current,
            court: courtRef.current,
            description: everythingSaid(),
          }),
        });
        if (!res.ok) throw new Error('update failed');
        const data = (await res.json()) as { brief: Brief };
        // A newer change is already on its way. Its answer is the one to show.
        if (seq !== updateSeq.current) return null;
        adopt(data.brief);
        return data.brief;
      } catch {
        if (seq === updateSeq.current) {
          setBriefMessage('We could not check that change just now. Change it again to retry.');
        }
        return null;
      } finally {
        if (seq === updateSeq.current) setUpdating(false);
      }
    },
    [adopt, everythingSaid],
  );

  const handleValue = useCallback(
    (item: BriefItem, value: Value) => {
      valuesRef.current = withValue(valuesRef.current, item.key, value, item.label);
      const current = briefRef.current;
      if (current) {
        // Show it at once. The service's answer replaces this a moment later.
        setBrief({
          ...current,
          items: current.items.map((i) =>
            i.key === item.key
              ? {
                  ...i,
                  value: isEmptyValue(value) ? null : value,
                  source: 'user',
                  please_check: false,
                }
              : i,
          ),
        });
      }
      void update();
    },
    [setBrief, update],
  );

  const handleCourt = useCallback(
    (court: BriefCourt) => {
      courtRef.current = court;
      const current = briefRef.current;
      if (current) setBrief({ ...current, court });
      void update();
    },
    [setBrief, update],
  );

  const handleChangeDocument = useCallback(
    (kindId: string) => {
      setChangeOpen(false);
      const current = briefRef.current;
      if (current && (current.kind.id ?? NO_RULE_PACK) === kindId) return;
      chosenKind.current = kindId;
      if (kindId === NO_RULE_PACK) answersRef.current = [];
      const keep = typedByUser();
      void readBrief(
        {
          description: description.trim(),
          kind: kindId,
          ...(intakeId.current ? { intake_id: intakeId.current } : {}),
          ...(keep.length > 0 ? { keep } : {}),
          ...courtIfAny(),
        },
        'brief',
      );
    },
    [description, readBrief],
  );

  const answerQuestions = useCallback(
    async (given: Array<{ question: BriefQuestion; value: Value }>) => {
      for (const g of given) {
        valuesRef.current = withValue(valuesRef.current, g.question.key, g.value, g.question.label);
      }
      setBusy(true);
      const next = given.length > 0 ? await update() : briefRef.current;
      setBusy(false);
      if (questionRound === 1 && openQuestions(questions, next ?? briefRef.current, 2).length > 0) {
        setQuestionRound(2);
        setRoundsShown((n) => n + 1);
        return;
      }
      setPhase('brief');
    },
    [questionRound, questions, update],
  );

  // ── The draft ─────────────────────────────────────────────────────────────

  const generate = useCallback(
    async (retry: boolean) => {
      const current = briefRef.current;
      if (!current) return;
      if (!retry) runId.current = undefined;
      setGenError(null);
      setRepairing(false);
      setBriefMessage(null);
      setPhase('generating');
      const kind = current.kind.id ?? NO_RULE_PACK;
      // T-136: the description as the advocate typed it, the one this brief was
      // read from. Never the answers to questions, and nothing a model wrote.
      // Only a document with a rule pack is drafted from it.
      const described = (lastRead.current?.text || description).trim();

      try {
        const res = await apiFetch('/api/documents/generate-from-brief', {
          ...JSON_POST,
          body: JSON.stringify({
            kind,
            ...(kind === NO_RULE_PACK
              ? { kind_name: current.kind.name, court_document: current.kind.court_document }
              : {}),
            values: valuesRef.current,
            court: courtRef.current,
            language: 'en',
            ...(runId.current ? { run_id: runId.current } : {}),
            ...(intakeId.current ? { intake_id: intakeId.current } : {}),
            ...(kind !== NO_RULE_PACK && described ? { described } : {}),
          }),
        });
        const header = res.headers.get('X-Run-Id');
        if (header) runId.current = header;

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
            cost?: number;
            balance?: { totalInk?: number; total?: number };
          };
          if (res.status === 402) {
            setPaywall({
              cost: data.cost ?? 1,
              balance: data.balance?.totalInk ?? data.balance?.total ?? 0,
            });
            setPhase('brief');
            return;
          }
          if (res.status === 400 && data.error === 'no_match') {
            setPhase('no_match');
            return;
          }
          if (res.status === 400 || res.status === 403) {
            // The service checked the brief again and wants something first. Its own line is shown.
            const line =
              data.message ??
              (res.status === 403
                ? 'This document needs the Pro plan. You can upgrade from Settings.'
                : 'Check the brief and try again.');
            setPhase('brief');
            // Work the brief out again so the screen shows what is missing, then say why.
            void update().then(() => setBriefMessage(line));
            return;
          }
          setGenError({
            reason: data.message ?? 'The draft could not be started. Please try again.',
            retryable: res.status >= 500,
          });
          return;
        }
        if (!res.body) {
          setGenError({ reason: 'The drafting service sent nothing back.', retryable: true });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let event = '';
        let streamed = '';
        let assembled = '';
        let findings: Array<Finding & { details?: { clauseId?: string } }> = [];
        let done: Record<string, unknown> | null = null;

        for (;;) {
          const { done: ended, value } = await reader.read();
          if (ended) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              event = line.slice(7).trim();
              continue;
            }
            if (!line.startsWith('data: ')) continue;
            let payload: Record<string, unknown>;
            try {
              payload = JSON.parse(line.slice(6)) as Record<string, unknown>;
            } catch {
              event = '';
              continue;
            }
            if (event === 'error') {
              setGenError({
                reason:
                  typeof payload.reason === 'string'
                    ? payload.reason
                    : 'The drafting service returned an error.',
                retryable: payload.retryable !== false,
              });
              return;
            }
            if (event === 'repair') setRepairing(true);
            else if (event === 'warning' && Array.isArray(payload.warnings)) {
              findings = payload.warnings as typeof findings;
            } else if (event === 'template_sections' && Array.isArray(payload.sections)) {
              assembled = (payload.sections as Array<{ content?: string }>)
                .map((s) => s.content ?? '')
                .join('\n\n');
            } else if (event === 'done') done = payload;
            else if (event === '' && typeof payload.text === 'string') streamed += payload.text;
            event = '';
          }
        }

        if (!done) {
          setGenError({
            reason: 'The connection was lost before the draft was finished.',
            retryable: true,
          });
          return;
        }

        const missing = Array.isArray(done.missingClauses)
          ? (done.missingClauses as Array<{ id: string; title: string }>)
          : [];
        const missingIds = new Set(missing.map((m) => m.id));
        const name = current.kind.name;
        // The draft is written. Nothing the advocate typed is kept on this page any longer.
        reset();
        setResult({
          docId: typeof done.docId === 'string' ? done.docId : null,
          name,
          rulePack: done.rulePack !== false,
          startingDraft: done.startingDraft === true,
          startingDraftLabel:
            typeof done.startingDraftLabel === 'string' ? done.startingDraftLabel : null,
          labelReason: typeof done.labelReason === 'string' ? done.labelReason : null,
          missingClauses: missing,
          // A missing part is listed once, by its title, not again as a finding.
          findings: findings
            .filter((f) => !(f.details?.clauseId && missingIds.has(f.details.clauseId)))
            .map((f) => ({ type: f.type, message: f.message })),
          blanks: countBlanks(assembled || streamed),
        });
        setPhase('ready');
      } catch {
        setGenError({ reason: 'Lost the connection to the drafting service.', retryable: true });
      }
    },
    [description, reset, update],
  );

  // ── Moving between the screens ────────────────────────────────────────────

  const editDescription = useCallback(() => {
    setMessage(null);
    setPhase('describe');
  }, []);

  const browse = useCallback(() => setPhase('browse'), []);

  const cancel = useCallback(() => {
    reset();
    router.push('/dashboard');
  }, [reset, router]);

  const startAnother = useCallback(() => {
    reset();
    setResult(null);
    setPhase('describe');
  }, [reset]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === 'browse') {
    return (
      <BrowseTypesStep
        kinds={kinds}
        loading={loadingKinds}
        onPick={(k) => {
          setPreset({ id: k.template_id, name: k.display_name });
          chosenKind.current = k.template_id;
          setMessage(null);
          setPhase('describe');
        }}
        onDescribe={() => {
          setPreset(null);
          chosenKind.current = undefined;
          setMessage(null);
          setPhase('describe');
        }}
      />
    );
  }

  if (phase === 'choice') {
    const byId = new Map(kinds.map((k) => [k.template_id, k.description]));
    return (
      <DocumentChoiceStep
        choices={choices.map((c) => ({
          template_id: c.kind,
          display_name: c.name,
          description: byId.get(c.kind),
        }))}
        onChoose={handleChoose}
        onEditDescription={editDescription}
        submitting={busy}
      />
    );
  }

  if (phase === 'no_match') {
    return (
      <NoMatchStep
        description={description}
        onEditDescription={editDescription}
        onBrowse={browse}
      />
    );
  }

  if (phase === 'reception' && reception) {
    return (
      <QuestionsStep
        key={`reception-${reception.nextRound}`}
        documentName={null}
        questions={reception.questions}
        round={Math.max(1, reception.nextRound - 1)}
        totalRounds={2}
        description={description}
        busy={busy}
        onSubmit={(given) => sendReception(given, false)}
        onSkip={() => sendReception([], true)}
        onEditDescription={editDescription}
      />
    );
  }

  if (phase === 'ready' && result) {
    return (
      <DraftReadyStep
        result={result}
        onOpenEditor={() => {
          if (result.docId) router.push(`/dashboard/documents/${result.docId}`);
        }}
        onStartAnother={startAnother}
      />
    );
  }

  if (phase === 'generating') {
    return (
      <GeneratingStep
        documentName={brief?.kind.name ?? 'document'}
        repairing={repairing}
        error={genError}
        onRetry={() => void generate(true)}
        onBackToBrief={() => {
          setGenError(null);
          setPhase(briefRef.current ? 'brief' : 'describe');
        }}
      />
    );
  }

  if ((phase === 'questions' || phase === 'brief') && brief) {
    const roundQuestions =
      phase === 'questions' ? openQuestions(questions, brief, questionRound) : [];
    if (roundQuestions.length > 0) {
      return (
        <QuestionsStep
          key={`questions-${questionRound}`}
          documentName={brief.kind.name}
          questions={roundQuestions}
          round={Math.min(2, Math.max(1, roundsShown))}
          totalRounds={2}
          description={description}
          busy={busy}
          onSubmit={(given) => void answerQuestions(given)}
          onSkip={() => setPhase('brief')}
          onEditDescription={editDescription}
        />
      );
    }
    // "Answer N more questions" opens the next round only, so N counts that round.
    const left = openQuestions(questions, brief);
    const nextRound: 1 | 2 = left.some((q) => q.round === 1) ? 1 : 2;
    const nextQuestions = left.filter((q) => q.round === nextRound);
    return (
      <>
        <BriefStep
          brief={brief}
          busy={busy || updating}
          confirming={false}
          message={briefMessage}
          questionsLeft={nextQuestions.length}
          onValue={handleValue}
          onCourt={handleCourt}
          onKindName={(name) => {
            setBrief({ ...brief, kind: { ...brief.kind, name } });
            void update(name);
          }}
          onPlaceDate={handleValue}
          onChangeDocument={() => setChangeOpen(true)}
          onMoreQuestions={() => {
            setQuestionRound(nextRound);
            setRoundsShown((n) => n + 1);
            setPhase('questions');
          }}
          onEditDescription={editDescription}
          onCancel={cancel}
          onConfirm={() => void generate(false)}
        />
        <ChangeDocumentDialog
          open={changeOpen}
          onOpenChange={setChangeOpen}
          kinds={kinds}
          currentId={brief.kind.id}
          suggested={choices.map((c) => c.kind)}
          onChoose={handleChangeDocument}
        />
        {paywall && (
          <PaywallModal
            documentLabel={brief.kind.name}
            cost={paywall.cost}
            balance={paywall.balance}
            onClose={() => setPaywall(null)}
          />
        )}
      </>
    );
  }

  return (
    <DescribeStep
      value={description}
      onChange={setDescription}
      onSubmit={handleDescribe}
      onBrowse={browse}
      submitting={busy}
      message={message}
      documentName={preset?.name ?? null}
    />
  );
}
