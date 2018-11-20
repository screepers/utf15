'use strict';

const Impl = (()=>{
    
    const // #define
        MAX_DEPTH           = 53,       // Number.MAX_SAFE_INTEGER === (2^53 - 1)
        SAFE_BITS           = 15,       // 15 of 16 UTF-16 bits
        UNPRINTABLE_OFFSET  = 48,       // ASCII '0'
        UPPER_BOUND         = 0xFFFF,   // Max 16 bit value
        POWERS_OF_2 = [1,
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
    class RangeCodecError extends RangeError { constructor(msg) { super("[utf15][RangeError]: " + msg); } }
    class TypeCodecError  extends TypeError  { constructor(msg) { super("[utf15][TypeError]: "  + msg); } }

    
    /// Throws runtime exception in case of failed condition
    const assert = (condition, Err, ...str) => {
        if(!condition) throw new Err(str.reduce((o,s) => (o+s+' '), '')); };
    
    /// @returns normalized UTF CodePoint
    const num_to_code_point = (x) => {
        x = +x;
        assert(x >= 0 && x < UPPER_LIMIT, RangeCodecError, 'x out of bounds:', x);
        x += UNPRINTABLE_OFFSET;
        return x;
    };

    /// @returns extracted unsigned value from CodePoint
    const code_point_to_num = (x) => {
        x = +x;
        assert(x >= 0 && x <= UPPER_BOUND, RangeCodecError, 'x out of bounds:', x);
        x -= UNPRINTABLE_OFFSET;
        return x;
    };
    
    const check_cfg = (cfg) => {
        let fail = false;
        fail = fail || isNaN(cfg.meta)  || (cfg.meta  !== 0 && cfg.meta  !== 1);
        fail = fail || isNaN(cfg.array) || (cfg.array !== 0 && cfg.array !== 1);
        if(!fail) (()=>{
            const depth_is_array = Array.isArray(cfg.depth);
            fail = fail || (depth_is_array && !cfg.array);
            if(fail) return;
            
            const fail_depth = (x) => (isNaN(x) || x <= 0 || x > MAX_DEPTH);
            if(depth_is_array) {
                cfg.depth.forEach((d, idx) => {
                    cfg.depth[idx] = +cfg.depth[idx];
                    fail = fail || fail_depth(d);
                });
            } else {
                cfg.depth = +cfg.depth;
                fail = fail || fail_depth(cfg.depth);
            }
        })();
        
        if(fail) {
            let str = '[JSON.stringify() ERROR]';
            try { str = JSON.stringify(cfg); } finally {}
            assert(0, TypeCodecError, 'Codec config is invalid:', str);
        }
    };
    
    const serialize_meta = (str, meta) => {
        const depth = Array.isArray(meta.depth) ? 0 : meta.depth;
        return str + String.fromCodePoint(
            num_to_code_point(meta.array),
            num_to_code_point(depth));
    };
    
    const deserialize_meta = (str, meta, offset) => {
        offset = offset || 0;
        meta.array = code_point_to_num(str.codePointAt(offset    ));
        meta.depth = code_point_to_num(str.codePointAt(offset + 1));
        return [str.slice(offset + 2), 2];
    };
    
    function encode_array(res, values) {
        const depth_is_array = Array.isArray(this.depth);
        
        const fixed_depth = depth_is_array ? 0 : this.depth;
        const depths = depth_is_array ? this.depth : [];

        assert(fixed_depth || depths.length === values.length, TypeCodecError,
            'Wrong depths array length:', depths, values);

        if(!depth_is_array) // Save array length as meta
            res += String.fromCodePoint(num_to_code_point(values.length));

        let symbol_done = 0, symbol_acc = 0;

        // Cycle over values
        for(let i = 0, len = values.length; i < len; ++i) {

            // Current value and its bit depth
            const value = values[i], depth = fixed_depth || depths[i];

            // Cycle over value bits
            for(let value_done = 0; value_done < depth;) {

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
                if(symbol_done === SAFE_BITS) {
                    res += String.fromCodePoint(num_to_code_point(symbol_acc));
                    symbol_done = symbol_acc = 0;
                }
            }
        }

        if(symbol_done !== 0) // Last symbol left
            res += String.fromCodePoint(num_to_code_point(symbol_acc));
        
        return res;
    }
    
    function decode_array(str, meta) {
        assert(!this.meta || meta.depth > 0 || (meta.depth === 0 && Array.isArray(this.depth)),
            TypeCodecError, 'Array decoding error (check inputs and codec config)');

        meta.depth = meta.depth || this.depth;
        const depth_is_array = Array.isArray(meta.depth);

        let it = 0, i = 0;
        const length = depth_is_array ? meta.depth.length : code_point_to_num(str.codePointAt(it++));
        const fixed_depth = depth_is_array ? 0 : meta.depth;
        const depths = depth_is_array ? meta.depth : [];
        const values = new Array(length);
        
        let symbol_done = 0;
        let chunk = code_point_to_num(str.codePointAt(it++));

        // Cycle over values
        while(i < length) {

            const depth = fixed_depth || depths[i];
            let value_acc = 0, value_done = 0;

            // Cycle over value bits
            while(value_done < depth) {
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
                if(symbol_done === SAFE_BITS) {
                    // It was the last code unit, break without iterators changing
                    if((i + 1) === length && value_done === depth) break;
                    chunk = code_point_to_num(str.codePointAt(it++));
                    symbol_done = 0;
                }
            }

            if(value_done > 0)
                values[i++] = value_acc;
        }

        return [values, it];
    }
    
    class Codec {
        
        /// Constructs codec by config or another serialized codec (this <=> cfg)
        constructor(cfg) {
            cfg = cfg || {};
            this.meta   = +(!!cfg.meta);
            this.array  = +(!!cfg.array);
            this.depth  = +cfg.depth || MAX_DEPTH;
            check_cfg(this);
        }
        
        /// @param arg -- single value or array of values to be encoded
        /// @returns encoded string
        encode(arg) {
            assert((+Array.isArray(arg) | +(!!(arg).BYTES_PER_ELEMENT)) ^ !this.array, TypeCodecError,
                'Incompatible codec (array <=> single value), arg =', arg);
            
            let res = '';

            if(this.meta) // Save meta info
                res = serialize_meta(res, this);
            
            if(this.array) {
                // Effectively packs array of numbers
                res = encode_array.call(this, res, arg);
            } else {
                // Packs single value, inline
                let x = +arg % POWERS_OF_2[this.depth];
                const len = Math.ceil(this.depth / SAFE_BITS);
                for(let i = 0; i < len; ++i) {
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
        decode(str, length_out) {
            let meta = null;    // codec config
            let length = 0;     // number of read code units
            
            if(this.meta) {
                // Meta has been saved to str, restore
                [str, length] = deserialize_meta(str, (meta = {}));
            } else {
                // Otherwise, use this config
                meta = this;
            }

            assert(meta.array ^ !this.array, TypeCodecError,
                'Incompatible codec (array <=> single value), str =', str);
            
            if(this.array) { // output is array of integers
                const res = decode_array.call(this, str, meta);
                !!length_out && (length_out.length = length + res[1]);
                return res[0];
            }

            let acc = 0, pow = 0;
            const len = Math.ceil(meta.depth / SAFE_BITS);
            for(let i = 0; i < len; ++i) {
                const x = code_point_to_num(str.codePointAt(i));
                acc += x * POWERS_OF_2[pow];
                pow += SAFE_BITS;
            }

            !!length_out && (length_out.length = length + len);
            return acc;
        }
    }
    
    return { Codec, MAX_DEPTH };
})();

module.exports = Impl;
