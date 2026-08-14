import test from 'node:test';
import assert from 'node:assert';
import { getEffectiveFollowUpCount, getFollowUpTab } from './followUpHelpers.js';

test('getEffectiveFollowUpCount - valid followUpCount values', () => {
    assert.strictEqual(getEffectiveFollowUpCount({ followUpCount: 0 }), 0);
    assert.strictEqual(getEffectiveFollowUpCount({ followUpCount: 1 }), 1);
    assert.strictEqual(getEffectiveFollowUpCount({ followUpCount: 2 }), 2);
    assert.strictEqual(getEffectiveFollowUpCount({ followUpCount: 3 }), 3);
    assert.strictEqual(getEffectiveFollowUpCount({ followUpCount: 4 }), 4);
    
    // String coercion
    assert.strictEqual(getEffectiveFollowUpCount({ followUpCount: '0' }), 0);
    assert.strictEqual(getEffectiveFollowUpCount({ followUpCount: '3' }), 3);
});

test('getEffectiveFollowUpCount - prioritizes valid followUpCount over legacy fallbacks', () => {
    // followUpCount is 0, but legacy fields suggest contact occurred -> must return 0
    const quoteWithFallbackAndCountZero = {
        followUpCount: 0,
        firstFollowUpSentAt: '2026-08-14T00:00:00Z',
        lastFollowUpAt: '2026-08-14T00:00:00Z'
    };
    assert.strictEqual(getEffectiveFollowUpCount(quoteWithFallbackAndCountZero), 0);

    const quoteWithFallbackAndCountOne = {
        followUpCount: 1,
        firstFollowUpSentAt: '2026-08-14T00:00:00Z',
        lastFollowUpAt: '2026-08-14T00:00:00Z',
        followUpHistory: [
            { type: 'follow_up', contactNumber: 1 },
            { type: 'follow_up', contactNumber: 2 }
        ]
    };
    assert.strictEqual(getEffectiveFollowUpCount(quoteWithFallbackAndCountOne), 1);
});

test('getEffectiveFollowUpCount - fallback legacy resolves correctly when count is absent', () => {
    // No followUpCount, no history, no timestamps -> 0
    assert.strictEqual(getEffectiveFollowUpCount({}), 0);

    // Timestamps only -> 1
    assert.strictEqual(getEffectiveFollowUpCount({ firstFollowUpSentAt: '2026-08-14T00:00:00Z' }), 1);
    assert.strictEqual(getEffectiveFollowUpCount({ lastFollowUpAt: '2026-08-14T00:00:00Z' }), 1);

    // Conclusive history
    const quoteWithHistory = {
        followUpHistory: [
            { type: 'follow_up', contactNumber: 1 },
            { type: 'follow_up', contactNumber: 2 },
            { type: 'follow_up', contactNumber: 3 }
        ]
    };
    assert.strictEqual(getEffectiveFollowUpCount(quoteWithHistory), 3);
});

test('getFollowUpTab - correct tab assignment and finalization status mapping', () => {
    assert.strictEqual(getFollowUpTab({ followUpCount: 0 }), 'contact0');
    assert.strictEqual(getFollowUpTab({ followUpCount: 1 }), 'contact1');
    assert.strictEqual(getFollowUpTab({ followUpCount: 2 }), 'contact2');
    assert.strictEqual(getFollowUpTab({ followUpCount: 3 }), 'contact3');
    assert.strictEqual(getFollowUpTab({ followUpCount: 4 }), 'contact4');

    // Out of bound / finalized statuses
    assert.strictEqual(getFollowUpTab({ followUpStatus: 'completed' }), 'finalized');
    assert.strictEqual(getFollowUpTab({ status: 'approved' }), 'finalized');
    assert.strictEqual(getFollowUpTab({ status: 'converted' }), 'finalized');
    assert.strictEqual(getFollowUpTab({ status: 'rejected' }), 'finalized');
});
