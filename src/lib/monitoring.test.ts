import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/browser';
import { redact, scrubEvent } from './monitoring';

describe('monitoring', () => {
  it('redige e-mail, valor, uuid e números longos', () => {
    const r = redact(
      'ana@x.com pagou R$ 1.234,56 id 123e4567-e89b-12d3-a456-426614174000 pix 12345678900',
    );
    expect(r).not.toMatch(/ana@|1\.234|123e4567|12345678900/);
  });

  it('scrubEvent remove usuário, breadcrumbs, request e extra', () => {
    const e = {
      type: undefined,
      user: { email: 'a@b.com' },
      breadcrumbs: [{ message: 'x' }],
      request: { url: 'https://x/?t=1' },
      extra: { d: 1 },
      exception: { values: [{ value: 'falha para a@b.com' }] },
    } as unknown as ErrorEvent;
    const s = scrubEvent(e);
    expect(s.user).toBeUndefined();
    expect(s.breadcrumbs).toBeUndefined();
    expect(s.request).toBeUndefined();
    expect(s.extra).toBeUndefined();
    expect(s.exception?.values?.[0]?.value).toBe('falha para [email]');
  });
});
