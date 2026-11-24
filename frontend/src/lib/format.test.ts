import { bytes, haQuanto, ms, num, pct, reais } from './format';

describe('formatação pt-BR', () => {
  it('números, moeda e percentuais', () => {
    expect(num(1234567)).toBe('1.234.567');
    expect(num(null)).toBe('—');
    expect(num(2.5, 2)).toBe('2,50');
    expect(reais(1500.5).replace(/\s/g, ' ')).toBe('R$ 1.500,50');
    expect(pct(0.0123, 2)).toBe('1,23%');
    expect(pct(undefined)).toBe('—');
  });
  it('durações e bytes', () => {
    expect(ms(250)).toBe('250 ms');
    expect(ms(2500)).toBe('2,5 s');
    expect(ms(null)).toBe('—');
    expect(bytes(512)).toBe('512 B');
    expect(bytes(5 * 1024 * 1024)).toBe('5 MB');
  });
  it('tempo relativo', () => {
    const agora = Date.parse('2026-11-19T12:00:00Z');
    expect(haQuanto('2026-11-19T11:59:58Z', agora)).toBe('agora');
    expect(haQuanto('2026-11-19T11:59:30Z', agora)).toBe('há 30 s');
    expect(haQuanto('2026-11-19T11:50:00Z', agora)).toBe('há 10 min');
    expect(haQuanto('2026-11-19T09:00:00Z', agora)).toBe('há 3 h');
    expect(haQuanto(null)).toBe('—');
  });
});
