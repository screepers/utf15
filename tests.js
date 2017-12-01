'use strict';

const utf15 = require('./utf15');
const Codec = utf15.Codec;
const MAX_DEPTH = utf15.MAX_DEPTH;

const ms        = ()=>(new Date()).getTime();
const do_cycles = (N,f)=>{for(let i = 0; i < N; ++i) f();};
const rand01    = ()=>(Math.random());
const rand_pow2 = (max)=>(Math.floor(Math.pow(2, max * rand01())));
const salt      = ()=>(rand01().toString(36).substr(2, 2 + Math.ceil(rand01() * 10)));

const arr_eq = (a,b)=>(a.length === b.length &&
    a.reduce((s,v,i)=>(s + (v !== b[i])), 0) === 0);

const array_test = (()=>{
    const arr_max_len   = 100;
    const N_codecs      = 100;  // codecs per cycle
    const N_arrays      = 100;  // inputs per codec
    
    // encode(length) + decode(length)
    let total_length = 0, t = ms();
    const len_out = {};
    
    [0,1].forEach((meta)=>{
        
        // Fixed depth
        do_cycles(N_codecs, ()=>{
            const depth = Math.ceil(rand01() * MAX_DEPTH);
            const codec = new Codec({depth, meta, array:1});
            do_cycles(N_arrays, ()=>{
                const length = Math.ceil(rand01() * arr_max_len);
                const arr = Array.from({length}, () => rand_pow2(depth));
                const enc = codec.encode(arr);
                const dec = codec.decode(enc + salt(), len_out);
                if(!arr_eq(arr, dec) || len_out.length !== enc.length) {
                    console.log(arr, enc, dec, enc.length, len_out.length);
                    throw new Error('FAIL 1');
                }
                total_length += length * 2;
            });
        });

        // Variadic depths
        do_cycles(N_codecs, ()=>{
            const length = Math.ceil(rand01() * arr_max_len);
            const depth = Array.from({length}, () => Math.ceil(rand01() * MAX_DEPTH));
            const codec = new Codec({depth, meta, array:1});
            do_cycles(N_arrays, ()=>{
                const arr = Array.from({length}, (v,i) => rand_pow2(depth[i]));
                const enc = codec.encode(arr);
                const dec = codec.decode(enc + salt(), len_out);
                if(!arr_eq(arr, dec) || len_out.length !== enc.length) {
                    console.log(arr, enc, dec);
                    throw new Error('FAIL 2');
                }
                total_length += length * 2;
            });
        });
    });
    
    t = ms() - t;
    console.log(
        `Array codec test finished: ${t} ms, total values = ${total_length},`,
        `~${(1000*t/total_length).toFixed(3)} us/value (encode OR decode)`);
});
const single_test = (()=>{
    const N_codecs = 1000;  // codecs per cycle
    const N_values = 1000;  // inputs per codec

    // encode(length) + decode(length)
    let total_length = 0, t = ms();
    const len_out = {};
    
    [0,1].forEach((meta)=>{
        do_cycles(N_codecs, ()=>{
            const depth = Math.ceil(rand01() * MAX_DEPTH);
            const codec = new Codec({depth, meta, array:0});
            do_cycles(N_values, ()=>{
                const val = rand_pow2(depth);
                const enc = codec.encode(val);
                const dec = codec.decode(enc + salt(), len_out);
                if(val !== dec || len_out.length !== enc.length) {
                    console.log(val, enc, dec);
                    throw new Error('FAIL 3');
                }
                total_length += 2;
            });
        });
    });

    t = ms() - t;
    console.log(
        `Single codec test finished: ${t} ms, total values = ${total_length},`,
        `~${(1000*t/total_length).toFixed(3)} us/value (encode OR decode)`);
});

const perf_test = (()=>{
    const N = 1000;
    
    // Test matrix
    const lengths = [5, 127, 2053];
    const depths = [3, 13, 31];
    
    // Arrays performance
    lengths.forEach((length)=>{
        depths.forEach((depth)=>{
            const data_size_in_bytes = N * length * depth / 8;
            const data_size_in_codes = N * length;

            const codec = new Codec({depth, meta:0, array:1});
            const arr = Array.from({length}, () => rand_pow2(depth));
            let enc, dec, dt, a, b;

            dt = ms();
            for(let i = 0; i < N; ++i) {
                enc = codec.encode(arr);
                // Prevent dead code elimination:
                [a,b] = [enc[0], enc[enc.length-1]]; [a,b] = [b,a];
            }
            dt = ms() - dt;

            console.log(`Array encoding (len=${length}, depth=${depth}):`,
                `${(1000*dt/data_size_in_codes).toFixed(3)} us/value,`,
                `${(1000*dt/data_size_in_bytes).toFixed(3)} us/byte,`,
                `${(data_size_in_bytes/dt/1024).toFixed(3)} MB/s`);

            dt = ms();
            for(let i = 0; i < N; ++i) {
                dec = codec.decode(enc);
                // Prevent dead code elimination:
                [a,b] = [dec[0], dec[dec.length-1]]; [a,b] = [b,a];
            }
            dt = ms() - dt;

            console.log(`Array decoding (len=${length}, depth=${depth}):`,
                `${(1000*dt/data_size_in_codes).toFixed(3)} us/value,`,
                `${(1000*dt/data_size_in_bytes).toFixed(3)} us/byte,`,
                `${(data_size_in_bytes/dt/1024).toFixed(3)} MB/s`);
        });
    });

    // Single performance
    depths.forEach((depth)=>{
        const N = 100000;
        const length = 1;
        
        const data_size_in_bytes = N * length * depth / 8;
        const data_size_in_codes = N * length;

        const codec = new Codec({depth, meta:0, array:0});
        
        const ring_size = 32;
        const vals = Array.from({length:ring_size}, () => rand_pow2(depth));
        let enc, dec, dt, ring_idx = 0;

        dt = ms();
        for(let i = 0; i < N; ++i) {
            const val = vals[ring_idx];
            ring_idx = (ring_idx + 1) % ring_size;
            enc = codec.encode(val);
        }
        dt = ms() - dt;

        console.log(`Single encoding (depth=${depth}):`,
            `${(1000*dt/data_size_in_codes).toFixed(3)} us/value,`,
            `${(1000*dt/data_size_in_bytes).toFixed(3)} us/byte,`,
            `${(data_size_in_bytes/dt/1024).toFixed(3)} MB/s`);

        dt = ms();
        for(let i = 0; i < N; ++i)
            dec = codec.decode(enc);
        dt = ms() - dt;

        console.log(`Single decoding (depth=${depth}):`,
            `${(1000*dt/data_size_in_codes).toFixed(3)} us/value,`,
            `${(1000*dt/data_size_in_bytes).toFixed(3)} us/byte,`,
            `${(data_size_in_bytes/dt/1024).toFixed(3)} MB/s`);
    });
});

const examples = (()=>{
    console.log('Examples:');
    
    const assert = (cond) => {if(!cond) throw new Error('Assertion failed');};
    let enc, dec;
    
    (function single_simple(){
        const value = 1337;

        // depth === 53 bits, default
        const codec1 = new Codec();
        enc = codec1.encode(value);
        dec = codec1.decode(enc);
        assert(value === dec);
        console.log(value, enc, dec);

        // depth === 11 bits, value < 2^depth, enough
        const codec2 = new Codec({ depth:11 });
        enc = codec2.encode(value);
        dec = codec2.decode(enc);
        assert(value === dec);
        console.log(value, enc, dec);
        
        // codec construction from serialized
        const codec3 = new Codec(JSON.parse(JSON.stringify(codec2)));
        dec = codec3.decode(enc); // <-- packed by another codec
        assert(value === dec);
    })();

    (function single_with_meta(){
        const value = 1337;

        // force meta saving
        const codec1 = new Codec({ depth:11, meta:1 });
        enc = codec1.encode(value);
        dec = codec1.decode(enc);
        assert(value === dec);

        // depth will be extracted from string, config's depth ignored
        const codec2 = new Codec({ depth:42, meta:1 });
        dec = codec2.decode(enc); // <-- packed by another codec
        assert(value === dec);
    })();

    (function single_values_to_array(){
        // We will concat single strings
        const values = [0,1,2,3,4,5,6,7,8,9];
        
        const codec = new Codec({ depth:15 });
        
        // Now "enc" is a single string with concatenated encoded values
        enc = values.reduce((acc,x) => (acc + codec.encode(x)), '');
        
        // Lets save copy
        const copy = enc.slice(0);
        
        // Cycle over encoded string
        dec = [];
        while(enc.length) {
            const len_out = {};
            dec.push(codec.decode(enc, len_out));
            enc = enc.slice(len_out.length); // trim
        }
        
        assert(arr_eq(values, dec));
        console.log(values, copy, dec);
    })();

    (function array_simple(){
        const values = [4,8,15,16,23,42,777,1337];

        // depth === 53 bits, default
        const codec1 = new Codec({ array:1 });
        enc = codec1.encode(values);
        dec = codec1.decode(enc);
        assert(arr_eq(values, dec));
        console.log(values, `[str.length=${enc.length}]`, dec);

        // depth === 11 bits
        const codec2 = new Codec({ depth:11, array:1 });
        enc = codec2.encode(values);
        dec = codec2.decode(enc);
        assert(arr_eq(values, dec));
        console.log(values, `[str.length=${enc.length}]`, dec);
    })();

    (function array_meta(){
        const values = [4,8,15,16,23,42,777,1337];

        const codec1 = new Codec({ depth:11, array:1, meta:1 });
        enc = codec1.encode(values);
        dec = codec1.decode(enc);
        assert(arr_eq(values, dec));
        console.log(values, `[str.length=${enc.length}]`, dec);
        
        const codec2 = new Codec({ array:1, meta:1 });
        dec = codec2.decode(enc);
        assert(arr_eq(values, dec));
    })();

    (function array_variadic_depths(){
        const values = [0xFF, 0xAA, 0xFFFF, 0xDEAD];
        const depths = [   8,    8,     16,     16];
        
        // array of depths
        const codec1 = new Codec({ depth:depths, array:1 });
        enc = codec1.encode(values);
        dec = codec1.decode(enc);
        assert(arr_eq(values, dec));
        console.log(values, `[str.length=${enc.length}]`, dec);
    })();

    (function array_variadic_depths_game(){
        // In-game use case example: global coordinates packing
        const values = [3, 101, 97, 24, 42];    // room W101N97 x:24 y:42
        const depths = [2,   7,  7,  6,  6];    // max = [4,128,128,64,64]
        
        // Codec for position coding, oh, exploitable!
        const map_codec = new Codec({ depth:depths, array:1 });
        
        enc = map_codec.encode(values);
        dec = map_codec.decode(enc);
        assert(arr_eq(values, dec));
        console.log(values, `[str.length=${enc.length}]`, dec);
    })();

    (function array_fixed_depth_game(){
        // In-game use case example: directions
        const values = [0,1,2,3,4,5,6,7,6,5];
        const depth = 3; // 3 bits, max 8 values, range [0,8)

        // Codec for directions coding, oh, exploitable!
        const dir_codec = new Codec({ depth, array:1 });

        enc = dir_codec.encode(values);
        dec = dir_codec.decode(enc);
        assert(arr_eq(values, dec));
        console.log(values, `[str.length=${enc.length}]`, dec);
    })();

    (function single_values_to_array_game(){
        const // In-game use case example: id
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
    })();
});

(function main() {
    
    try {
        
        if(1) {
            const N_tests = 1;
            for(let i = 0; i < N_tests; ++i) array_test();
            for(let i = 0; i < N_tests; ++i) single_test();
            perf_test();
        }
        
        examples();
        
    } catch(e) {
        console.log('Test failed with exception:', e);
        throw e;
    }
    
})();
