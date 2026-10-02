/**
 * VLQ signed encoder/decoder for source map segment values.
 *
 * Encoding follows the Base64 VLQ scheme from the Source Map specification:
 * each value is first converted to a signed integer via zig-zag, then split
 * into groups of 5 bits. The most significant bit (continuation bit) of every
 * group except the last is set to 1 so a reader knows more groups follow.
 * The low 5 bits of each group are mapped to a Base64 character.
 *
 * We hardcode the Base64 alphabet defined by the source map spec rather than
 * accepting it as a parameter. The spec is closed on this point; making it
 * configurable would invite exactly the kind of "honour two readings at once"
 * failure that ruins small libraries. One alphabet, one interpretation.
 */

const BASE64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const DECODE_MAP = (() => {
  const m = new Uint8Array(128).fill(255);
  for (let i = 0; i < BASE64.length; i++) {
    m[BASE64.charCodeAt(i)] = i;
  }
  return m;
})();

const CONTINUATION_BIT = 0x20; // 0b100000
const VALUE_MASK = 0x1f;       // 0b011111
const SHIFT = 5;

/**
 * Encode a single signed integer into a Base64 VLQ string.
 *
 * @param {number} value - integer in the safe 32-bit range
 * @returns {string} the Base64 VLQ representation
 */
export function encode(value) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`encode expects an integer, got ${typeof value}`);
  }

  // Zig-zag: interleave non-negative and negative integers into the
  // unsigned space so that the sign bit is the LSB, which is cheap to
  // recover on decode. The unsigned right shift `>>> 0` converts the
  // bitwise result into an unsigned 32-bit integer; without it, a leading
  // 1 in bit 31 would produce a negative zig-zag value and corrupt the
  // loop below.
  let zigzag = (value << 1) ^ (value >> 31);
  if (zigzag < 0) zigzag += 0x100000000;

  let out = '';
  do {
    // Take the lowest 5 bits. If any higher bits remain, set the
    // continuation bit so the decoder keeps reading.
    let group = zigzag & VALUE_MASK;
    zigzag >>>= SHIFT;
    if (zigzag > 0) group |= CONTINUATION_BIT;
    out += BASE64[group];
  } while (zigzag > 0);

  return out;
}

/**
 * Decode the next VLQ value from `str` starting at index 0.
 *
 * Returns an object with the decoded integer and the index of the first
 * character that was NOT consumed — convenient for streaming through a
 * sequence of values separated only by their continuation boundaries.
 *
 * @param {string} str - a string whose prefix is a valid VLQ group
 * @param {number} [start=0] - offset at which to begin decoding
 * @returns {{ value: number, read: number }}
 */
export function decode(str, start = 0) {
  if (typeof str !== 'string') {
    throw new TypeError(`decode expects a string, got ${typeof str}`);
  }
  if (!Number.isInteger(start) || start < 0 || start > str.length) {
    throw new RangeError(`decode start index out of range: ${start}`);
  }

  let zigzag = 0;
  let shift = 0;
  let index = start;

  for (;;) {
    if (index >= str.length) {
      throw new RangeError('decode hit end of string mid-VLQ');
    }
    const code = str.charCodeAt(index);
    const group = DECODE_MAP[code];
    if (group === 255) {
      throw new RangeError(
        `decode encountered non-Base64 character at index ${index}: ${JSON.stringify(
          str[index]
        )}`
      );
    }
    index += 1;

    zigzag += (group & VALUE_MASK) << shift;
    shift += SHIFT;

    if ((group & CONTINUATION_BIT) === 0) break;
  }

  // Recover the sign. Bit 0 of zig-zag is the sign bit.
  const value = (zigzag & 1) === 0
    ? zigzag >>> 1
    : -(zigzag >>> 1) - 1;

  return { value, read: index };
}

/**
 * Encode a sequence of signed integers into a single Base64 VLQ string.
 * Adjacent values are simply concatenated; the continuation bit makes
 * the boundary between them unambiguous on decode.
 *
 * @param {number[]} values
 * @returns {string}
 */
export function encodeSequence(values) {
  if (!Array.isArray(values)) {
    throw new TypeError(`encodeSequence expects an array, got ${typeof values}`);
  }
  let out = '';
  for (let i = 0; i < values.length; i++) {
    out += encode(values[i]);
  }
  return out;
}

/**
 * Decode a full string into a list of signed integers.
 *
 * The whole string must be consumed; trailing characters that don't form
 * a complete VLQ are an error rather than silently dropped, because a
 * partial trailing group indicates a corrupted segment.
 *
 * @param {string} str
 * @returns {number[]}
 */
export function decodeSequence(str) {
  if (typeof str !== 'string') {
    throw new TypeError(`decodeSequence expects a string, got ${typeof str}`);
  }

  const out = [];
  let cursor = 0;
  while (cursor < str.length) {
    const { value, read } = decode(str, cursor);
    out.push(value);
    cursor = read;
  }
  return out;
}
