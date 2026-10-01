// Little-endian binary writer/reader for the wire protocol (PLAN §5: compact binary WebSocket messages).
// Readers never trust their input: any read past the end throws ProtocolError, which the server
// treats as a bad client message (drop the message, and the connection if it keeps happening).

export class ProtocolError extends Error {}

export class ByteWriter {
  private buf: ArrayBuffer;
  private view: DataView;
  private bytes: Uint8Array;
  private pos = 0;

  constructor(initial = 256) {
    this.buf = new ArrayBuffer(initial);
    this.view = new DataView(this.buf);
    this.bytes = new Uint8Array(this.buf);
  }

  get length(): number {
    return this.pos;
  }

  private need(n: number) {
    if (this.pos + n <= this.buf.byteLength) return;
    let size = this.buf.byteLength * 2;
    while (size < this.pos + n) size *= 2;
    const next = new ArrayBuffer(size);
    new Uint8Array(next).set(this.bytes.subarray(0, this.pos));
    this.buf = next;
    this.view = new DataView(next);
    this.bytes = new Uint8Array(next);
  }

  u8(v: number): this {
    this.need(1);
    this.view.setUint8(this.pos, v);
    this.pos += 1;
    return this;
  }
  i8(v: number): this {
    this.need(1);
    this.view.setInt8(this.pos, v);
    this.pos += 1;
    return this;
  }
  u16(v: number): this {
    this.need(2);
    this.view.setUint16(this.pos, v, true);
    this.pos += 2;
    return this;
  }
  i16(v: number): this {
    this.need(2);
    this.view.setInt16(this.pos, v, true);
    this.pos += 2;
    return this;
  }
  u32(v: number): this {
    this.need(4);
    this.view.setUint32(this.pos, v, true);
    this.pos += 4;
    return this;
  }
  i32(v: number): this {
    this.need(4);
    this.view.setInt32(this.pos, v, true);
    this.pos += 4;
    return this;
  }
  f32(v: number): this {
    this.need(4);
    this.view.setFloat32(this.pos, v, true);
    this.pos += 4;
    return this;
  }
  f64(v: number): this {
    this.need(8);
    this.view.setFloat64(this.pos, v, true);
    this.pos += 8;
    return this;
  }
  /** Unsigned LEB128 varint (small numbers take one byte). */
  varu(v: number): this {
    if (!Number.isInteger(v) || v < 0) throw new RangeError(`varu: ${v}`);
    do {
      let b = v % 128;
      v = Math.floor(v / 128);
      if (v > 0) b |= 0x80;
      this.u8(b);
    } while (v > 0);
    return this;
  }
  /** UTF-8 string with a varint byte length. */
  str(s: string): this {
    const enc = utf8Encode(s);
    this.varu(enc.length);
    this.need(enc.length);
    this.bytes.set(enc, this.pos);
    this.pos += enc.length;
    return this;
  }
  raw(src: Uint8Array): this {
    this.need(src.length);
    this.bytes.set(src, this.pos);
    this.pos += src.length;
    return this;
  }

  /** A copy of the written bytes, sized exactly. */
  finish(): Uint8Array {
    return this.bytes.slice(0, this.pos);
  }
}

export class ByteReader {
  private readonly view: DataView;
  private pos = 0;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get remaining(): number {
    return this.bytes.byteLength - this.pos;
  }

  private take(n: number): number {
    if (this.pos + n > this.bytes.byteLength) throw new ProtocolError("message truncated");
    const at = this.pos;
    this.pos += n;
    return at;
  }

  u8(): number {
    return this.view.getUint8(this.take(1));
  }
  i8(): number {
    return this.view.getInt8(this.take(1));
  }
  u16(): number {
    return this.view.getUint16(this.take(2), true);
  }
  i16(): number {
    return this.view.getInt16(this.take(2), true);
  }
  u32(): number {
    return this.view.getUint32(this.take(4), true);
  }
  i32(): number {
    return this.view.getInt32(this.take(4), true);
  }
  f32(): number {
    return this.view.getFloat32(this.take(4), true);
  }
  f64(): number {
    return this.view.getFloat64(this.take(8), true);
  }
  varu(): number {
    let v = 0;
    let mul = 1;
    for (let i = 0; i < 8; i++) {
      const b = this.u8();
      v += (b & 0x7f) * mul;
      if (!(b & 0x80)) return v;
      mul *= 128;
    }
    throw new ProtocolError("varint too long");
  }
  str(maxBytes = 256): string {
    const n = this.varu();
    if (n > maxBytes) throw new ProtocolError(`string too long (${n} bytes)`);
    const at = this.take(n);
    return utf8Decode(this.bytes.subarray(at, at + n));
  }
  raw(n: number): Uint8Array {
    const at = this.take(n);
    return this.bytes.subarray(at, at + n);
  }
  /** A finite float32, or a protocol error (NaN/Infinity never enter the simulation). */
  finite(): number {
    const v = this.f32();
    if (!Number.isFinite(v)) throw new ProtocolError("non-finite number");
    return v;
  }
}

/** 32-bit FNV-1a over bytes: cheap, deterministic, good enough to detect prediction divergence. */
export function fnv1a(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// UTF-8 without TextEncoder/TextDecoder: shared code has no DOM or Node typings, and only short strings
// (names, room codes) cross the wire. Invalid sequences decode to U+FFFD.
export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

export function utf8Decode(b: Uint8Array): string {
  let out = "";
  for (let i = 0; i < b.length; ) {
    const c = b[i];
    const n = c < 0x80 ? 0 : c >= 0xf0 && c < 0xf8 ? 3 : c >= 0xe0 ? 2 : c >= 0xc0 ? 1 : -1;
    if (n < 0) {
      out += "\ufffd";
      i++;
      continue;
    }
    let cp = n === 0 ? c : c & (0x3f >> n);
    let ok = true;
    for (let k = 1; k <= n; k++) {
      const cc = b[i + k];
      if (cc === undefined || (cc & 0xc0) !== 0x80) {
        ok = false;
        break;
      }
      cp = (cp << 6) | (cc & 63);
    }
    if (!ok || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
      out += "\ufffd";
      i++;
      continue;
    }
    out += String.fromCodePoint(cp);
    i += n + 1;
  }
  return out;
}
