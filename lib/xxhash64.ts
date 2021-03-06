import { WASMInterface, IWASMInterface, IHasher } from './WASMInterface';
import Mutex from './mutex';
import wasmJson from '../wasm/xxhash64.wasm.json';
import lockedCreate from './lockedCreate';
import { IDataType } from './util';

const mutex = new Mutex();
let wasmCache: IWASMInterface = null;
const seedBuffer = new ArrayBuffer(8);

function validateSeed(seed: number) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) {
    return new Error('Seed must be given as two valid 32-bit long unsigned integer (lo + high).');
  }
  return null;
}

function writeSeed(low: number, high: number) {
  // write in little-endian format
  const buffer = new DataView(seedBuffer);
  buffer.setUint32(0, low, true);
  buffer.setUint32(4, high, true);
}

export function xxhash64(
  data: IDataType, seedLow = 0, seedHigh = 0,
): Promise<string> {
  if (validateSeed(seedLow)) {
    return Promise.reject(validateSeed(seedLow));
  }

  if (validateSeed(seedHigh)) {
    return Promise.reject(validateSeed(seedHigh));
  }

  if (wasmCache === null) {
    return lockedCreate(mutex, wasmJson, 8)
      .then((wasm) => {
        wasmCache = wasm;
        writeSeed(seedLow, seedHigh);
        wasmCache.writeMemory(new Uint8Array(seedBuffer));
        return wasmCache.calculate(data);
      });
  }

  try {
    writeSeed(seedLow, seedHigh);
    wasmCache.writeMemory(new Uint8Array(seedBuffer));
    const hash = wasmCache.calculate(data);
    return Promise.resolve(hash);
  } catch (err) {
    return Promise.reject(err);
  }
}

export function createXXHash64(seedLow = 0, seedHigh = 0): Promise<IHasher> {
  if (validateSeed(seedLow)) {
    return Promise.reject(validateSeed(seedLow));
  }

  if (validateSeed(seedHigh)) {
    return Promise.reject(validateSeed(seedHigh));
  }

  return WASMInterface(wasmJson, 8).then((wasm) => {
    writeSeed(seedLow, seedHigh);
    wasm.writeMemory(new Uint8Array(seedBuffer));
    wasm.init();
    const obj: IHasher = {
      init: () => {
        wasm.writeMemory(new Uint8Array(seedBuffer));
        wasm.init();
        return obj;
      },
      update: (data) => { wasm.update(data); return obj; },
      digest: (outputType) => wasm.digest(outputType) as any,
      blockSize: 32,
      digestSize: 8,
    };
    return obj;
  });
}
