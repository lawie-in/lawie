// Shared render helpers for the dashboard page tests. Not a test file.
import { act } from 'react';

import DashboardPage from '../page';

import {
  balanceBody,
  docsBody,
  flush,
  notOk,
  ok,
  PATHS,
  routeApi,
  statusBody,
  summaryBody,
  type Handlers,
} from '@/components/dashboard/__tests__/dash-test-utils';
import { mount } from '@/components/ui/__tests__/nl-test-utils';

export { flush, notOk, ok, PATHS, routeApi, statusBody, summaryBody, balanceBody, docsBody };

/** Healthy handlers for all four endpoints; override per test. */
export function healthy(over: Handlers = {}): Handlers {
  return {
    [PATHS.summary]: async () => ok(summaryBody()),
    [PATHS.documents]: async () => ok(docsBody(3)),
    [PATHS.balance]: async () => ok(balanceBody(12)),
    [PATHS.status]: async () => ok(statusBody()),
    ...over,
  };
}

export async function mountPage(mock: jest.Mock, handlers: Handlers) {
  routeApi(mock, handlers);
  const m = mount(<DashboardPage />);
  await flush();
  return m;
}

export async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
}
