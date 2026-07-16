import { describe, expect, it } from 'vitest';
import { isImeComposing } from './ime';

describe('isImeComposing', () => {
  it('recognizes standards and compatibility composition signals', () => {
    expect(isImeComposing({ isComposing: true, key: 'Enter', keyCode: 13 } as KeyboardEvent)).toBe(true);
    expect(isImeComposing({ isComposing: false, key: 'Process', keyCode: 0 } as KeyboardEvent)).toBe(true);
    expect(isImeComposing({ isComposing: false, key: 'Enter', keyCode: 229 } as KeyboardEvent)).toBe(true);
    expect(isImeComposing({ isComposing: false, key: 'Enter', keyCode: 13 } as KeyboardEvent)).toBe(false);
  });
});
