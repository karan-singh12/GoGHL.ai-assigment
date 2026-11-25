import './setup.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { closeMongo, connectMongo, getDb } from '../infra/mongo.js';
import { ensureIndexes } from '../repositories/indexes.js';
import { conversationRepo } from '../repositories/conversation.repo.js';
import { messageRepo } from '../repositories/message.repo.js';

// Integration tests against a real MongoDB (switchboard_test). They cover the
// pieces most likely to be wrong: races, idempotency, ordering and leases.

const WS = 'ws_test';
const C = '+15550000001';

before(async () => {
  const db = await connectMongo();
  assert.match(db.databaseName, /_test$/, 'refusing to run against a non-test database');
  await db.dropDatabase();
  await ensureIndexes(db);
});
after(async () => {
  await getDb().dropDatabase();
  await closeMongo();
});
beforeEach(async () => {
  await Promise.all([conversationRepo.deleteAll(), messageRepo.deleteAll()]);
});

describe('conversation claim', () => {
  it('six simultaneous claims on a new conversation produce exactly one winner', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => conversationRepo.claim(WS, C, `agent_${i}`)));
    const winners = results.filter((r) => r.outcome === 'claimed');
    assert.equal(winners.length, 1);
    assert.equal(results.filter((r) => r.outcome === 'taken').length, 5);
    const conv = await conversationRepo.find(WS, C);
    assert.equal(conv?.assignee, winners[0].conversation.assignee);
    assert.equal(await getDb().collection('conversations').countDocuments({ workspace: WS, contact: C }), 1);
  });

  it('the holder claiming again gets "already"', async () => {
    await conversationRepo.claim(WS, C, 'u_ben');
    assert.equal((await conversationRepo.claim(WS, C, 'u_ben')).outcome, 'already');
    assert.equal((await conversationRepo.claim(WS, C, 'u_eli')).outcome, 'taken');
  });
});

describe('conversation activity', () => {
  it('out-of-order activity never moves lastActivityAt or the preview backwards', async () => {
    const newer = new Date('2026-01-01T10:00:00Z');
    const older = new Date('2026-01-01T09:00:00Z');
    await conversationRepo.touch(WS, C, { text: 'newer', dir: 'in', at: newer });
    const { conversation } = await conversationRepo.touch(WS, C, { text: 'older', dir: 'in', at: older });
    assert.equal(conversation.lastActivityAt.getTime(), newer.getTime());
    assert.equal(conversation.lastMessage?.text, 'newer');
  });

  it('stores customer text that starts with "$" literally', async () => {
    const { conversation } = await conversationRepo.touch(WS, C, { text: '$state refund $100', dir: 'in', at: new Date() });
    assert.equal(conversation.lastMessage?.text, '$state refund $100');
    assert.equal(conversation.state, 'open');
  });

  it('inbound reopens a closed conversation', async () => {
    await conversationRepo.ensure(WS, C);
    await conversationRepo.setState(WS, C, 'closed');
    const r = await conversationRepo.touch(WS, C, { text: 'hi again', dir: 'in', at: new Date() }, { reopen: true });
    assert.equal(r.reopened, true);
    assert.equal(r.conversation.state, 'open');
  });
});

describe('messages', () => {
  it('duplicate inbound webhooks (concurrent) store one row', async () => {
    const input = { workspace: WS, contact: C, providerMessageId: 'pmsg_1', text: 'Hi', occurredAt: new Date() };
    const results = await Promise.all(Array.from({ length: 5 }, () => messageRepo.insertInbound(input)));
    assert.equal(results.filter((r) => r.created).length, 1);
    assert.equal(await getDb().collection('messages').countDocuments({ providerMessageId: 'pmsg_1' }), 1);
  });

  it('the same pmsg id in another workspace is a different message (isolation)', async () => {
    const base = { contact: C, providerMessageId: 'pmsg_x', text: 'Hi', occurredAt: new Date() };
    assert.equal((await messageRepo.insertInbound({ ...base, workspace: 'ws_a' })).created, true);
    assert.equal((await messageRepo.insertInbound({ ...base, workspace: 'ws_b' })).created, true);
  });

  it('the same client_ref requested concurrently is one reply', async () => {
    const input = { workspace: WS, contact: C, clientRef: 'ref-1', text: 'Hello', authorSub: null };
    const results = await Promise.all(Array.from({ length: 6 }, () => messageRepo.insertOutbound(input)));
    assert.equal(results.filter((r) => r.created).length, 1);
    assert.equal(await messageRepo.pendingCount(), 1);
  });

  it('status is forward-only and ignores unknown client_refs', async () => {
    await messageRepo.insertOutbound({ workspace: WS, contact: C, clientRef: 'ref-2', text: 'x', authorSub: null });
    assert.ok(await messageRepo.applyStatus(WS, 'ref-2', 'delivered'));
    assert.equal(await messageRepo.applyStatus(WS, 'ref-2', 'sent'), null, 'late "sent" must not regress');
    assert.equal(await messageRepo.applyStatus(WS, 'nope', 'sent'), null);
    assert.equal((await messageRepo.findOutbound(WS, 'ref-2'))?.status, 'delivered');
  });

  it('thread pages are oldest-first and walk back with prevCursor', async () => {
    for (let i = 0; i < 5; i++) {
      await messageRepo.insertInbound({ workspace: WS, contact: C, providerMessageId: `p${i}`, text: `m${i}`, occurredAt: new Date(1_000 + i) });
    }
    const p1 = await messageRepo.thread(WS, C, { before: null, limit: 3 });
    assert.deepEqual(p1.items.map((m) => m.text), ['m2', 'm3', 'm4']);
    const { decodeCursor } = await import('../utils/cursor.js');
    const p2 = await messageRepo.thread(WS, C, { before: decodeCursor(p1.prevCursor), limit: 3 });
    assert.deepEqual(p2.items.map((m) => m.text), ['m0', 'm1']);
    assert.equal(p2.prevCursor, null);
  });
});

describe('outbox lease', () => {
  it('a lease held by a dead worker becomes claimable after it expires; the dead worker cannot complete it', async () => {
    await messageRepo.insertOutbound({ workspace: WS, contact: C, clientRef: 'ref-3', text: 'x', authorSub: null });
    const t0 = new Date();
    const leased = await messageRepo.leaseNextDue('dead', 1_000, t0);
    assert.ok(leased);
    assert.equal(await messageRepo.leaseNextDue('alive', 1_000, new Date(t0.getTime() + 500)), null, 'still leased');

    const retaken = await messageRepo.leaseNextDue('alive', 1_000, new Date(t0.getTime() + 1_500));
    assert.equal(retaken?.clientRef, 'ref-3');
    assert.equal(retaken?.sendAttempts, 2);

    assert.equal(await messageRepo.markAccepted(leased._id, 'dead', 'pm_1'), false, 'stale owner is ignored');
    assert.equal(await messageRepo.markAccepted(leased._id, 'alive', 'pm_1'), true);
    assert.equal(await messageRepo.pendingCount(), 0);
  });
});
