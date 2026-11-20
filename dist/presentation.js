export function moneyFromCents(cents) {
  const value = BigInt(cents);
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return sign + (absolute / 100n).toLocaleString('en-US') + '.' + String(absolute % 100n).padStart(2, '0');
}

export function money(value) {
  return moneyFromCents(BigInt(Math.round(Number(value) * 100)));
}

export function totalBalanceCents(cards) {
  return cards.reduce((sum, card) => sum + BigInt(Math.round((card.balance ?? 0) * 100)), 0n);
}

const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

export function nameInitial(name) {
  const trimmed = name.trim();
  return segmenter ? segmenter.segment(trimmed)[Symbol.iterator]().next().value?.segment ?? ''
    : Array.from(trimmed)[0] ?? '';
}

export function recordFieldError(name, value) {
  if (name === 'name') {
    if (!value.trim()) return '请填写名称。';
    if (Array.from(value.trim()).length > 80) return '名称最多 80 个字符，请缩短后保存。';
  }
  if (name === 'note' && Array.from(value).length > 200) return '备注最多 200 个字符，请缩短后保存。';
  if (name === 'balance' || name === 'fee') {
    if (value === '') return '';
    if (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 90000000000) {
      return '金额需在 0 至 90,000,000,000.00 元之间。';
    }
    if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(value)) return '请填写普通数字，最多保留两位小数。';
  }
  return '';
}
