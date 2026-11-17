const tables = { cards: 'saldo_cards', subs: 'saldo_subscriptions' };
export const cycles = new Map([
  ['', null], ['按月', 1], ['按季度', 3], ['半年', 6], ['按年', 12], ['两年及以上', 24],
]);

export function localDate(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return date.getFullYear() + '-' + month + '-' + day;
}

export function emptyWallet() {
  return { cards: [], subs: [] };
}

function record(kind, row, history = []) {
  const common = {
    id: row.id,
    version: row.version,
    name: row.name,
    date: row.expires_on ?? '',
    note: row.note,
    archived: row.archived_at !== null,
  };
  if (kind === 'cards') {
    return {
      ...common,
      balance: row.balance_cents === null ? null : row.balance_cents / 100,
      updated: localDate(new Date(history.at(-1)?.recorded_at ?? row.created_at)),
      history,
    };
  }
  const cycle = [...cycles].find(([label, months]) => label && months === row.cycle_months)?.[0]
    ?? (row.cycle_months >= 24 ? '两年及以上' : '');
  return {
    ...common,
    cycle,
    fee: row.fee_cents === null ? null : row.fee_cents / 100,
    reminderDays: row.reminder_days,
  };
}

async function readAll(client, table, user, sortColumn) {
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from(table).select('*').eq('user_id', user)
      .order(sortColumn).order('id').range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

export async function loadWallet(client, user) {
  const [cards, subs, history] = await Promise.all([
    readAll(client, tables.cards, user, 'created_at'),
    readAll(client, tables.subs, user, 'created_at'),
    readAll(client, 'saldo_balance_snapshots', user, 'recorded_at'),
  ]);
  const historyByCard = new Map();
  for (const entry of history) {
    const list = historyByCard.get(entry.card_id) ?? [];
    list.push({ recorded_at: entry.recorded_at, cents: Number(entry.balance_cents) });
    historyByCard.set(entry.card_id, list);
  }
  return {
    cards: cards.map(row => record('cards', row, historyByCard.get(row.id))),
    subs: subs.map(row => record('subs', row)),
  };
}

function cents(value) {
  return value === null ? null : Math.round(value * 100);
}

const columns = {
  name: ['name', value => value.trim()],
  balance: ['balance_cents', cents],
  fee: ['fee_cents', cents],
  date: ['expires_on', value => value || null],
  cycle: ['cycle_months', value => cycles.get(value)],
  note: ['note', value => value],
  archived: ['archived_at', value => value ? new Date().toISOString() : null],
  reminderDays: ['reminder_days', value => value],
};

export async function saveRecord(client, user, kind, previous, changes, id = previous?.id) {
  const fields = Object.fromEntries(Object.entries(changes).map(([field, value]) => {
    const [column, encode] = columns[field];
    return [column, encode(value)];
  }));
  const table = client.from(tables[kind]);
  const query = previous
    ? table.update(fields).eq('user_id', user).eq('id', id).eq('version', previous.version)
    : table.insert({ ...fields, id, user_id: user });
  const { data, error } = await query.select('id').maybeSingle();
  if (error || !data) throw error ?? new Error('STALE_RECORD');
}
