import { describe, expect, it } from 'vitest';
import {
  SOURCE_CODE_PUBLISHED,
  SOURCE_CODE_REPOSITORY,
  SOURCE_CODE_URL,
  sourceCodeUrl,
} from './config';

describe('source code link (owner, 2026-11-15, Fable A9-02)', () => {
  it('points at the public repository', () => {
    expect(SOURCE_CODE_REPOSITORY).toBe('https://github.com/Tachsakorn/chess-by-me');
  });

  it('is open since the launch on chessby.me (1.0.0, 2026-11-16)', () => {
    expect(SOURCE_CODE_PUBLISHED).toBe(true);
    expect(SOURCE_CODE_URL).toBe('https://github.com/Tachsakorn/chess-by-me');
  });

  it('shows the repository once the one switch is turned on', () => {
    expect(sourceCodeUrl(true)).toBe('https://github.com/Tachsakorn/chess-by-me');
    expect(sourceCodeUrl(false)).toBe('');
  });
});
