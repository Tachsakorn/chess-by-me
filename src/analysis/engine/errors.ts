import type { AnalysisErrorCode } from '@/contract';

/**
 * The one error type this package throws. `code` is the contract's
 * `AnalysisErrorCode`; `detail` is technical text for logs, never shown as the
 * main message to the user.
 */
export class EngineError extends Error {
  readonly code: AnalysisErrorCode;
  readonly detail: string | null;

  constructor(code: AnalysisErrorCode, detail: string | null = null) {
    super(detail === null ? code : `${code}: ${detail}`);
    this.name = 'EngineError';
    this.code = code;
    this.detail = detail;
  }
}
