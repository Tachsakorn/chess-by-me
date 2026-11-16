import type { ImportError, ImportErrorCode } from '@/contract';

export type { FetchOptions } from './http';

/** A failed result: assignable to every result type of this package (Fable review A10-03). */
export type Failed = { ok: false; error: ImportError };

export function failure(code: ImportErrorCode, detail: string | null = null): Failed {
  return { ok: false, error: { code, detail } };
}

/** Error result for an HTTP status that is not 2xx (429 is handled in http.ts). */
export function httpFailure(status: number, notFoundMeansUser = true): Failed {
  if (status === 404 && notFoundMeansUser) return failure('user-not-found', `HTTP ${status}`);
  if (status === 429) return failure('rate-limited', `HTTP ${status}`);
  return failure('source-unavailable', `HTTP ${status}`);
}

export const isSuccess = (status: number): boolean => status >= 200 && status <= 299;
