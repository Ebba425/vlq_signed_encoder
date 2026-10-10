# VLQ Signed Encoder

Encode and decode signed variable-length quantities using the Base64 VLQ scheme defined by the Source Map specification.

```js
import { encode, decode, encodeSequence, decodeSequence } from 'vlq-signed-encoder';

encode(16);     // 'gB'
decode('gB');    // { value: 16, read: 2 }
encodeSequence([0, 1, -1, 16]);   // 'ACDgB'
decodeSequence('ACDgB');          // [0, 1, -1, 16]
```

## Why this exists

Source maps encode each segment as a sequence of signed integers packed into a Base64 VLQ string. This library does exactly that transformation and nothing else: one alphabet (the fixed spec alphabet `A-Za-z0-9+/`), one zig-zag signing convention, one continuation-bit rule. The alphabet is not configurable because the spec is not — accepting a custom alphabet would invite interpretation drift, and a small library's worst failure is supporting two readings of the same requirement at once.

## The awkward edge

Values are encoded as 32-bit signed integers. The full range is `[-2147483648, 2147483647]` and both endpoints round-trip. Numbers outside the safe integer range are not supported and `encode` will reject non-integers. On decode, a trailing group whose continuation bit promises another group that never arrives is treated as corruption and throws — a partial trailing group is never silently dropped, because in a real source map that indicates a truncated or damaged segment.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

