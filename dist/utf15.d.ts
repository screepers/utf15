import 'source-map-support/register';
/** Number.MAX_SAFE_INTEGER === (2^53 - 1) */
declare const MAX_DEPTH = 53;
export interface CodecConfig {
    meta?: boolean;
    array?: boolean;
    depth?: number | number[];
}
type TypedArray = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;
interface LengthOut {
    length?: number;
}
export declare class Codec {
    meta: boolean;
    array: boolean;
    depth: number | number[];
    constructor(cfg?: CodecConfig);
    encode(arg: number | number[] | TypedArray): string;
    decode(str: string, length_out?: LengthOut): number | number[];
}
export { MAX_DEPTH };
