import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode, encodeSequence, decodeSequence } from '../src/index.js';

describe('encode / decode single value', () => {
  it('round-trips 0', () => {
    assert.equal(encode(0), 'A');
    assert.equal(decode('A').value, 0);
    assert.equal(decode('A').read, 1);
  });

  it('round-trips small positives', () => {
    for (const v of [1, 5, 15, 16]) {
      const { value, read } = decode(encode(v));
      assert.equal(value, v);
      assert.equal(read, encode(v).length);
    }
  });

  it('round-trips small negatives', () => {
    for (const v of [-1, -5, -15, -16]) {
      const { value } = decode(encode(v));
      assert.equal(value, v);
    }
  });

  it('round-trips values crossing the 5-bit boundary', () => {
    for (const v of [16, -16, 17, -17, 31, -31, 32, -32, 33, -33]) {
      const { value } = decode(encode(v));
      assert.equal(value, v);
    }
  });

  it('round-trips the 32-bit safe-range endpoints', () => {
    for (const v of [2147483647, -2147483648]) {
      const { value } = decode(encode(v));
      assert.equal(value, v);
    }
  });

  it('encodes the spec-canonical examples correctly', () => {
    // From the source map spec: 0 -> A, 1 -> C, -1 -> B, 16 -> gB
    assert.equal(encode(0), 'A');
    assert.equal(encode(1), 'C');
    assert.equal(encode(-1), 'B');
    assert.equal(encode(16), 'gB');
  });
});

describe('decode error handling', () => {
  it('rejects a non-Base64 character', () => {
    assert.throws(() => decode('!'), RangeError);
  });

  it('rejects a group whose continuation promises more but string ends', () => {
    // 'g' has its continuation bit set, so the decoder expects another group.
    assert.throws(() => decode('g'), RangeError);
  });
});

describe('encodeSequence / decodeSequence', () => {
  it('round-trips an empty sequence', () => {
    assert.equal(encodeSequence([]), '');
    assert.deepEqual(decodeSequence(''), []);
  });

  it('round-trips a single-element sequence', () => {
    const values = [42];
    const s = encodeSequence(values);
    assert.deepEqual(decodeSequence(s), values);
  });

  it('round-trips a multi-element sequence', () => {
    const values = [0, 1, -1, 16, -16, 2147483647, -2147483648];
    const s = encodeSequence(values);
    assert.deepEqual(decodeSequence(s), values);
  });

  it('decodeSequence rejects trailing partial groups', () => {
    // 'gB' decodes as 16; appending a lone 'g' (continuation set, nothing
    // follows) must be flagged as corrupt rather than silently truncated.
    assert.throws(() => decodeSequence('gBg'), RangeError);
  });
});
