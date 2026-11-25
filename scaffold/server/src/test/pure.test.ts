import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ObjectId } from 'mongodb';
import { canTransition, isDeliveryStatus } from '../utils/statusRank.js';
import { decodeCursor, encodeCursor } from '../utils/cursor.js';

describe('statusRank', () => {
  it('only moves forward', () => {
    assert.equal(canTransition(null, 'queued'), true);
    assert.equal(canTransition('queued', 'sent'), true);
    assert.equal(canTransition('sent', 'delivered'), true);
    assert.equal(canTransition('delivered', 'sent'), false);
    assert.equal(canTransition('delivered', 'failed'), false, 'final states do not flip');
    assert.equal(canTransition('sent', 'sent'), false);
  });

  it('recognises only known statuses', () => {
    assert.equal(isDeliveryStatus('delivered'), true);
    assert.equal(isDeliveryStatus('read'), false);
    assert.equal(isDeliveryStatus('toString'), false);
  });
});

describe('cursor', () => {
  it('round-trips', () => {
    const id = new ObjectId();
    const t = new Date('2026-11-18T09:30:00.123Z');
    const c = decodeCursor(encodeCursor(t, id));
    assert.equal(c?.t.getTime(), t.getTime());
    assert.equal(c?.id.toHexString(), id.toHexString());
  });

  it('rejects garbage with a 400-class AppError', () => {
    assert.throws(() => decodeCursor('not-a-cursor'), { code: 'VALIDATION_FAILED' });
    assert.equal(decodeCursor(undefined), null);
  });
});
