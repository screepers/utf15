# utf15 [![Build Status](https://travis-ci.org/screepers/utf15.svg?branch=master)](https://travis-ci.org/screepers/utf15)

## Library (codec generator) for packing integers to JavaScript UTF-16 strings

The main use cases of the library:

* **Converting integer arrays to UTF-16 string**: in case you know the exact bit depth ("maximum value") of numbers, you can save them with reduced bit depth to a few UTF-16 code units instead of much larger string by `JSON.stringify`. Example:
    
    `[1337,1337,1337] + depth:15 => "թթթ"`
    
* **Converting array with variadic bit depths to UTF-16 string**: values can be effectively packed even if they have different bit depths. Example:
    
    `[0xFF, 0xAA, 0xFFFF, 0xDEAD] + depths:[8,8,16,16] => "ϾЁψ"`
    
* **Converting single integers to UTF-16 string**: you can customize codecs as you wish to create any kind of serialization/deserialization protocol.

Features:

* Output code points range is `[0x0030,  0x8030)` (with length = `2^15` = `32768`), so _control characters_ `[0x0000,  0x0020)` and _surrogate code points_ `[0xD800, 0xDFFF]` will never appear in the output, which could be critical or ineffective while serialization/deserialization.
* Dense binary packing: for example, 3 integer values with `bit_depth=15` will occupy exactly 3 UTF-16 code units, and 10 values with `bit_depth=3` will occupy exactly 2 UTF-16 code units.
* Arrays serialization/deserialization can be performed with variadic bit depths for each element.
* Meta information can be stored within the encoded string for future decoding without knowing a particular encoding codec.
* Lightweight, acceptable performance (see TravisCI output for measurement results).

What the `utf15.js` is not:

* **It's not an `lz-string`** analogue: it won't compress your data in terms of binary size (4 bytes `UInt32` value may become 6 bytes UTF-16 string).
* **It's not an archiver**: see previous point.
* **It's not a `JSON.stringify` replacement**: `utf15.js` can process unsigned integers ∈ `[0,Number.MAX_SAFE_INTEGER]`, arrays of such integers, and only them.

## Examples:

Here some useful examples of library use cases, see more in `tests.js:examples()` section.

### Global `RoomPosition` packing

```javascript
const values = [3, 101, 97, 24, 42];    // room W101N97 x:24 y:42
const depths = [2,   7,  7,  6,  6];    // max = [4,128,128,64,64]

// Codec for position coding, oh, exploitable!
const map_codec = new Codec({ depth:depths, array:1 });

enc = map_codec.encode(values);
dec = map_codec.decode(enc);
assert(arr_eq(values, dec));
console.log(values, `[str.length=${enc.length}]`, dec);
```

`> [ 3, 101, 97, 24, 42 ] '[str.length=2]' [ 3, 101, 97, 24, 42 ]`

### Directions packing

```javascript
const values = [0,1,2,3,4,5,6,7,6,5];
const depth = 3; // 3 bits, max 8 values, range [0,7]

const dir_codec = new Codec({ depth, array:1 });

enc = dir_codec.encode(values);
dec = dir_codec.decode(enc);
assert(arr_eq(values, dec));
console.log(values, `[str.length=${enc.length}]`, dec);
```

`> [ 0, 1, 2, 3, 4, 5, 6, 7, 6, 5 ] '[str.length=3]' [ 0, 1, 2, 3, 4, 5, 6, 7, 6, 5 ]`

### Single integer packing

```javascript
const value = 1337;

// depth === 11 bits, value < 2^depth, enough
const codec = new Codec({ depth:11 });
enc = codec.encode(value);
dec = codec.decode(enc);
assert(value === dec);
console.log(value, enc, dec);
```

`> 1337 'թ' 1337`

### ID packing

```javascript
const
    id = '5a216a3df33b4e435ca8c5ab',    // object.id example
    values = [];                        // array of hex numbers

for(let i = 0, len = id.length; i < len; ++i) {
    const point = parseInt(id[i], 16);
    values.push(point);
}

const id_codec = new Codec({ depth:4, array: 1 });
enc = id_codec.encode(values);
dec = id_codec.decode(enc);

const decoded_id = dec.reduce((acc, x)=> (acc + x.toString(16)), '');

assert(id === decoded_id);
console.log(`${id}.len=${id.length}`, `[str.len=${enc.length}]`, decoded_id);
```

`> 5a216a3df33b4e435ca8c5ab.len=24 [str.len=8] 5a216a3df33b4e435ca8c5ab`

