import { describe, expect, it } from 'vitest';
import { upsertMessages, patchMessageStatus, type Paged } from '../lib/cache';
import type { Message } from '../domain/types';
import { frameToActions, parseFrame } from './frames';

describe('parseFrame', () => {
  it('rejects frames without a numeric seq', () => {
    expect(parseFrame('{"type":"message.inbound"}')).toBeNull();
    expect(parseFrame('not json')).toBeNull();
    expect(parseFrame('{"seq":3,"type":"x"}')).toEqual({ seq: 3, type: 'x' });
  });
});

describe('frameToActions', () => {
  it('inbound without a payload invalidates the thread and refreshes the list', () => {
    const a = frameToActions({ seq: 1, type: 'message.inbound', contact: '+1', message_id: 'pmsg_1' });
    expect(a).toEqual([{ kind: 'invalidateMessages', contact: '+1' }, { kind: 'refreshList' }]);
  });

  it('status frames patch by client_ref and ignore unknown statuses', () => {
    expect(frameToActions({ seq: 2, type: 'message.status', contact: '+1', client_ref: 'r', status: 'sent' })).toEqual([
      { kind: 'patchStatus', contact: '+1', clientRef: 'r', status: 'sent' },
    ]);
    expect(frameToActions({ seq: 3, type: 'message.status', contact: '+1', client_ref: 'r', status: 'bogus' as never })).toEqual([]);
  });

  it('assignment frames patch the conversation', () => {
    expect(frameToActions({ seq: 4, type: 'conversation.assigned', contact: '+1', assignee: 'u_ben' })[0]).toEqual({
      kind: 'patchConversation',
      contact: '+1',
      patch: { assignee: 'u_ben' },
    });
  });

  it('unknown types fall back to a list refresh', () => {
    expect(frameToActions({ seq: 5, type: 'note.created' })).toEqual([{ kind: 'refreshList' }]);
  });
});

describe('cache patches', () => {
  const page = (items: Message[]): Paged<Message> => ({ pages: [{ items }], pageParams: [undefined] });
  const m = (id: string, at: string, extra: Partial<Message> = {}): Message => ({ id, dir: 'in', text: id, occurredAt: at, providerId: id, ...extra });

  it('upsert does not duplicate a message already in an older page', () => {
    const data: Paged<Message> = {
      pages: [{ items: [m('b', '2026-01-02T00:00:00Z')] }, { items: [m('a', '2026-01-01T00:00:00Z')] }],
      pageParams: [undefined, 'c1'],
    };
    const next = upsertMessages(data, [m('a', '2026-01-01T00:00:00Z')])!;
    expect(next.pages.flatMap((p) => p.items).filter((x) => x.id === 'a')).toHaveLength(1);
  });

  it('status patch returns the same object when nothing changes', () => {
    const data = page([m('x', '2026-01-01T00:00:00Z', { clientRef: 'r', status: 'delivered', dir: 'out' })]);
    expect(patchMessageStatus(data, 'r', 'sent')).toBe(data);
  });
});
