import './setup.js';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { closeRedis, connectRedis, getRedis } from '../infra/redis.js';
import { appendEvent, framesAfter, startEventReader, type Frame } from '../realtime/eventStream.js';
import { verifyPigeonSignature } from '../utils/hmac.js';
import { rateLimit, parseRetryAfter } from '../utils/rateLimit.js';

const SECRET = 'whsec_test';
const sign = (body: string, t: number, secret = SECRET) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

describe('pigeon signature (pure)', () => {
  const body = Buffer.from('{"id":"evt_1","type":"message.inbound"}');
  const now = 1_800_000_000;
  const check = (header: string | undefined, at = now) => verifyPigeonSignature(body, header, SECRET, at, 300);

  it('accepts a genuine signature, also up to 5 minutes old', () => {
    assert.equal(check(sign(body.toString(), now)), 'ok');
    assert.equal(check(sign(body.toString(), now - 300)), 'ok');
  });
  it('rejects forged, tampered, missing and malformed signatures', () => {
    assert.equal(check(sign(body.toString(), now, 'not-the-secret')), 'invalid');
    assert.equal(verifyPigeonSignature(Buffer.from(body.toString() + ' '), sign(body.toString(), now), SECRET, now, 300), 'invalid');
    assert.equal(check(undefined), 'invalid');
    assert.equal(check('garbage'), 'invalid');
    assert.equal(check(`t=${now},v1=zz`), 'invalid');
  });
  it('flags a genuine but replayed (old) or far-future request as stale', () => {
    assert.equal(check(sign(body.toString(), now - 3600)), 'stale');
    assert.equal(check(sign(body.toString(), now + 3600)), 'stale');
  });
  it('accepts any matching v1 (secret rotation)', () => {
    const good = sign(body.toString(), now).split(',')[1];
    assert.equal(check(`t=${now},v1=${'0'.repeat(64)},${good}`), 'ok');
  });
});

describe('retry-after parsing (pure)', () => {
  it('handles seconds, dates and garbage', () => {
    assert.equal(parseRetryAfter('2'), 2000);
    assert.equal(parseRetryAfter(new Date(Date.now() + 3000).toUTCString()) > 1000, true);
    assert.equal(parseRetryAfter(null), 2000);
  });
});

describe('event stream (Redis db 15)', () => {
  before(async () => {
    await connectRedis();
    assert.match(process.env.REDIS_URL ?? '', /\/15$/, 'refusing to run against a non-test Redis database');
    await getRedis().flushdb();
  });
  after(async () => {
    await getRedis().flushdb();
    await closeRedis();
  });

  it('concurrent appends get unique, strictly increasing seq in stream order; duplicates emit nothing', async () => {
    const ws = 'ws_acme';
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) => appendEvent(ws, `in:m${i % 20}`, { type: 'message.inbound', contact: '+1', message_id: `m${i % 20}` })),
    );
    const seqs = results.filter((s) => s > 0);
    assert.equal(seqs.length, 20, 'each fact once');
    assert.equal(results.filter((s) => s === 0).length, 20, 'duplicates return 0');
    const frames = await framesAfter(ws, 0);
    assert.deepEqual(frames.map((f) => f.seq), [...seqs].sort((a, b) => a - b), 'stream order == seq order, no holes');
    assert.equal(new Set(frames.map((f) => f.message_id)).size, 20);
  });

  it('replay returns only frames after the given seq', async () => {
    const ws = 'ws_globex';
    const a = await appendEvent(ws, 'x1', { type: 't', contact: '+2' });
    const b = await appendEvent(ws, 'x2', { type: 't', contact: '+2' });
    assert.deepEqual((await framesAfter(ws, a)).map((f) => f.seq), [b]);
  });

  it('the reader delivers new frames live, in order', async () => {
    const got: Frame[] = [];
    const stop = await startEventReader((_ws, frames) => got.push(...frames));
    const s1 = await appendEvent('ws_acme', 'live1', { type: 't', contact: '+3' });
    const s2 = await appendEvent('ws_acme', 'live2', { type: 't', contact: '+3' });
    for (let i = 0; i < 40 && got.length < 2; i++) await new Promise((r) => setTimeout(r, 50));
    await stop();
    assert.deepEqual(got.map((f) => f.seq), [s1, s2]);
  });

  it('rate limit: a burst gets the bucket, then waits; cool-off blocks everyone', async () => {
    const ws = 'ws_rl';
    const waits = [];
    for (let i = 0; i < 8; i++) waits.push(await rateLimit.acquire(ws));
    assert.equal(waits.filter((w) => w === 0).length, 6, 'bucket of 6');
    assert.ok(waits[7] > 0);
    await rateLimit.coolOff('ws_cool', 2000);
    assert.ok((await rateLimit.acquire('ws_cool')) > 1500);
  });
});
