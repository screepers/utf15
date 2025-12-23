import 'source-map-support/register';

/** Number.MAX_SAFE_INTEGER === (2^53 - 1) */
const MAX_DEPTH           = 53;
/** 15 of 16 UTF-16 bits are safe to use */
const SAFE_BITS           = 15;
/** Added to UTF16 values to avoid control characters. Chosen so value 0 becomes ASCII "0" */
const UNPRINTABLE_OFFSET  = 0x30;
/** Beginning of the surrogate range which should never be encoded */
const UTF16_SURROGATE_MIN = 0xD800;
/** Max value safely representable in one code point of the utf15 encoding */
const UPPER_BOUND         = UTF16_SURROGATE_MIN - UNPRINTABLE_OFFSET - 1;
const POWERS_OF_2: number[] = [1,
    2,                      4,                      8,                      16,
    32,                     64,                     128,                    256,
    512,                    1024,                   2048,                   4096,
    8192,                   16384,                  32768,                  65536,
    131072,                 262144,                 524288,                 1048576,
    2097152,                4194304,                8388608,                16777216,
    33554432,               67108864,               134217728,              268435456,
    536870912,              1073741824,             2147483648,             4294967296,
    8589934592,             17179869184,            34359738368,            68719476736,
    137438953472,           274877906944,           549755813888,           1099511627776,
    2199023255552,          4398046511104,          8796093022208,          17592186044416,
    35184372088832,         70368744177664,         140737488355328,        281474976710656,
    562949953421312,        1125899906842624,       2251799813685248,       4503599627370496,
    9007199254740992        // 2^53 max
  ];

/// Maximum representable by SAFE_BITS number + 1
const UPPER_LIMIT = POWERS_OF_2[SAFE_BITS];

/// Set of lib errors
class RangeCodecError extends RangeError {
  constructor(msg: string) {
    super("[utf15][RangeError]: " + msg);
  }
}

class TypeCodecError extends TypeError {
  constructor(msg: string) {
    super("[utf15][TypeError]: " + msg);
  }
}

type ErrorConstructor = typeof RangeCodecError | typeof TypeCodecError;

/// Throws runtime exception in case of failed condition
const assert = (condition: boolean, Err: ErrorConstructor, ...str: (string|{toString:()=>string})[]): void => {
  if (!condition) throw new Err(str.join(" "));
};

/// @returns normalized UTF CodePoint
const num_to_code_point = (x: number): number => {
  x = +x;
  assert(x >= 0 && x < UPPER_LIMIT, RangeCodecError, 'x out of bounds:', x);
  x += UNPRINTABLE_OFFSET;
  return x;
};

/// @returns extracted unsigned value from CodePoint
const code_point_to_num = (x: number): number => {
  x = +x;
  assert(x >= 0 && x <= UPPER_BOUND, RangeCodecError, 'x out of bounds:', x);
  x -= UNPRINTABLE_OFFSET;
  return x;
};

export interface CodecConfig {
  meta?: boolean;
  array?: boolean;
  depth?: number | number[];
}

interface NormalizedConfig {
  meta: boolean;
  array: boolean;
  depth: number | number[];
}

const check_cfg = (cfg: NormalizedConfig): void => {
  let fail = false;

  const depth_is_array = Array.isArray(cfg.depth);
  fail = fail || (depth_is_array && !cfg.array);
  if (fail) return;

  const fail_depth = (x: number): boolean => (isNaN(x) || x <= 0 || x > MAX_DEPTH);
  if (depth_is_array) {
    (cfg.depth as number[]).forEach((d, idx) => {
      (cfg.depth as number[])[idx] = +(cfg.depth as number[])[idx];
      fail = fail || fail_depth(d);
    });
  } else {
    cfg.depth = +cfg.depth;
    fail = fail || fail_depth(cfg.depth as number);
  }

  if (fail) {
    let str = '[JSON.stringify() ERROR]';
    try { str = JSON.stringify(cfg); } finally {}
    assert(false, TypeCodecError, 'Codec config is invalid:', str);
  }
};

const serialize_meta = (str: string, meta: NormalizedConfig): string => {
  const depth = Array.isArray(meta.depth) ? 0 : meta.depth;
  return str + String.fromCodePoint(
    num_to_code_point(+meta.array),
    num_to_code_point(depth));
};

interface MetaInfo {
  array?: boolean;
  depth?: number | number[];
}

const deserialize_meta = (str: string, meta: MetaInfo, offset?: number): [string, number] => {
  offset = offset || 0;
  meta.array = !!code_point_to_num(str.codePointAt(offset)!);
  meta.depth = code_point_to_num(str.codePointAt(offset + 1)!);
  return [str.slice(offset + 2), 2];
};

type TypedArray = Int8Array | Uint8Array | Int16Array | Uint16Array |
                  Int32Array | Uint32Array | Float32Array | Float64Array;

function encode_array(this: NormalizedConfig, res: string, values: number[] | TypedArray): string {
  const depth_is_array = Array.isArray(this.depth);

  const fixed_depth = depth_is_array ? 0 : this.depth as number;
  const depths = depth_is_array ? this.depth as number[] : [];

  assert(!!fixed_depth || depths.length === values.length, TypeCodecError,
    'Wrong depths array length:', depths, values);

  if (!depth_is_array) // Save array length as meta
    res += String.fromCodePoint(num_to_code_point(values.length));

  let symbol_done = 0, symbol_acc = 0;

  // Cycle over values
  for (let i = 0, len = values.length; i < len; ++i) {

    // Current value and its bit depth
    const value = values[i], depth = fixed_depth || depths[i];

    // Cycle over value bits
    for (let value_done = 0; value_done < depth;) {

      const symbol_left   = SAFE_BITS - symbol_done;
      const value_left    = depth - value_done;
      const bits_to_write = Math.min(symbol_left, value_left);

      let mask = Math.floor(value / POWERS_OF_2[value_done]);
      mask %= POWERS_OF_2[bits_to_write];
      mask *= POWERS_OF_2[symbol_done];

      symbol_acc  += mask;
      value_done  += bits_to_write;
      symbol_done += bits_to_write;

      // Output symbol ready, push it
      if (symbol_done === SAFE_BITS) {
        res += String.fromCodePoint(num_to_code_point(symbol_acc));
        symbol_done = symbol_acc = 0;
      }
    }
  }

  if (symbol_done !== 0) // Last symbol left
    res += String.fromCodePoint(num_to_code_point(symbol_acc));

  return res;
}

function decode_array(this: NormalizedConfig, str: string, meta: MetaInfo): [number[], number] {
  assert(!this.meta || (meta.depth as number) > 0 || ((meta.depth as number) === 0 && Array.isArray(this.depth)),
    TypeCodecError, 'Array decoding error (check inputs and codec config)');

  meta.depth = meta.depth || this.depth;
  const depth_is_array = Array.isArray(meta.depth);

  let it = 0, i = 0;
  const length = depth_is_array ? (meta.depth as number[]).length : code_point_to_num(str.codePointAt(it++)!);
  const fixed_depth = depth_is_array ? 0 : meta.depth as number;
  const depths = depth_is_array ? meta.depth as number[] : [];
  const values = new Array<number>(length);

  let symbol_done = 0;
  let chunk = code_point_to_num(str.codePointAt(it++)!);

  // Cycle over values
  while (i < length) {

    const depth = fixed_depth || depths[i];
    let value_acc = 0, value_done = 0;

    // Cycle over value bits
    while (value_done < depth) {
      const symbol_left   = SAFE_BITS - symbol_done;
      const value_left    = depth - value_done;
      const bits_to_read  = Math.min(symbol_left, value_left);

      let data = Math.floor(chunk / POWERS_OF_2[symbol_done]);
      data %= POWERS_OF_2[bits_to_read];
      data *= POWERS_OF_2[value_done];

      value_acc   += data;
      value_done  += bits_to_read;
      symbol_done += bits_to_read;

      // The whole symbol has been processed, move to next
      if (symbol_done === SAFE_BITS) {
        // It was the last code unit, break without iterators changing
        if ((i + 1) === length && value_done === depth) break;
        chunk = code_point_to_num(str.codePointAt(it++)!);
        symbol_done = 0;
      }
    }

    if (value_done > 0)
      values[i++] = value_acc;
  }

  return [values, it];
}

interface LengthOut {
  length?: number;
}

export class Codec {
  meta: boolean;
  array: boolean;
  depth: number | number[];

  /// Constructs codec by config or another serialized codec (this <=> cfg)
  constructor(cfg?: CodecConfig) {
    cfg = cfg || {};
    this.meta   = !!cfg.meta;
    this.array  = !!cfg.array;
    this.depth  = cfg.depth || MAX_DEPTH;
    check_cfg(this as NormalizedConfig);
  }

  /// @param arg -- single value or array of values to be encoded
  /// @returns encoded string
  encode(arg: number | number[] | TypedArray): string {
    assert((Array.isArray(arg) || !!(arg as TypedArray).BYTES_PER_ELEMENT) === this.array, TypeCodecError,
      'Incompatible codec (array <=> single value), arg =', arg);

    let res = '';

    if (this.meta) // Save meta info
      res = serialize_meta(res, this as NormalizedConfig);

    if (this.array) {
      // Effectively packs array of numbers
      res = encode_array.call(this as NormalizedConfig, res, arg as number[] | TypedArray);
    } else {
      // Packs single value, inline
      let x = +(arg as number) % POWERS_OF_2[this.depth as number];
      const len = Math.ceil((this.depth as number) / SAFE_BITS);
      for (let i = 0; i < len; ++i) {
        const cp = num_to_code_point(x % UPPER_LIMIT);
        res += String.fromCodePoint(cp);
        x = Math.floor(x / UPPER_LIMIT);
      }
    }

    return res;
  }

  /// @param str -- string to be decoded
  /// @param length_out -- output, read length will be saved as "length_out.length" (optional)
  /// @returns decoded single value or array of values
  decode(str: string, length_out?: LengthOut): number | number[] {
    let meta: MetaInfo | NormalizedConfig = this as NormalizedConfig;
    let length = 0;     // number of read code units

    if (this.meta) {
      // Meta has been saved to str, restore
      [str, length] = deserialize_meta(str, (meta = {}));
    }

    assert(meta.array === this.array, TypeCodecError,
      'Incompatible codec (array <=> single value), str =', str);

    if (this.array) { // output is array of integers
      const res = decode_array.call(this as NormalizedConfig, str, meta);
      !!length_out && (length_out.length = length + res[1]);
      return res[0];
    }

    let acc = 0, pow = 0;
    const depth = (meta.depth ?? this.depth) as number;
    const len = Math.ceil(depth / SAFE_BITS);
    for (let i = 0; i < len; ++i) {
      const x = code_point_to_num(str.codePointAt(i)!);
      acc += x * POWERS_OF_2[pow];
      pow += SAFE_BITS;
    }

    !!length_out && (length_out.length = length + len);
    return acc;
  }
}

export { MAX_DEPTH };
