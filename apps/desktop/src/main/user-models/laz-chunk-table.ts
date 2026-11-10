// Decoding half of LASzip's arithmetic coder, enough to read the arithmetic-coded chunk table.

const AC_MIN_LENGTH = 0x01000000;
const DM_LENGTH_SHIFT = 15;
const DM_MAX_COUNT = 1 << 15;
const BM_LENGTH_SHIFT = 13;
const BM_MAX_COUNT = 1 << 13;

class SymbolModel {
  readonly symbols: number;
  readonly lastSymbol: number;
  readonly distribution: Uint32Array;
  readonly symbolCount: Uint32Array;
  readonly decoderTable: Uint32Array | null;
  readonly tableSize: number;
  readonly tableShift: number;
  totalCount = 0;
  updateCycle: number;
  symbolsUntilUpdate: number;

  constructor(symbols: number) {
    this.symbols = symbols;
    this.lastSymbol = symbols - 1;
    if (symbols > 16) {
      let bits = 3;
      while (symbols > 1 << (bits + 2)) ++bits;
      this.tableSize = 1 << bits;
      this.tableShift = DM_LENGTH_SHIFT - bits;
      this.decoderTable = new Uint32Array(this.tableSize + 2);
    } else {
      this.tableSize = 0;
      this.tableShift = 0;
      this.decoderTable = null;
    }
    this.distribution = new Uint32Array(symbols);
    this.symbolCount = new Uint32Array(symbols).fill(1);
    this.updateCycle = symbols;
    this.symbolsUntilUpdate = 0;
    this.update();
    this.symbolsUntilUpdate = this.updateCycle = (symbols + 6) >> 1;
  }

  update(): void {
    if ((this.totalCount += this.updateCycle) > DM_MAX_COUNT) {
      this.totalCount = 0;
      for (let n = 0; n < this.symbols; n++) this.totalCount += this.symbolCount[n] = (this.symbolCount[n]! + 1) >>> 1;
    }
    const scale = Math.floor(0x80000000 / this.totalCount);
    let sum = 0;
    let s = 0;
    const t = this.decoderTable;
    for (let k = 0; k < this.symbols; k++) {
      this.distribution[k] = Math.floor((scale * sum) / 2 ** (31 - DM_LENGTH_SHIFT));
      sum += this.symbolCount[k]!;
      if (t) {
        const w = this.distribution[k]! >>> this.tableShift;
        while (s < w) t[++s] = k - 1;
      }
    }
    if (t) {
      t[0] = 0;
      while (s <= this.tableSize) t[++s] = this.symbols - 1;
    }
    this.updateCycle = (5 * this.updateCycle) >>> 2;
    const max = (this.symbols + 6) << 3;
    if (this.updateCycle > max) this.updateCycle = max;
    this.symbolsUntilUpdate = this.updateCycle;
  }
}

class BitModel {
  bit0Count = 1;
  bitCount = 2;
  bit0Prob = 1 << (BM_LENGTH_SHIFT - 1);
  updateCycle = 4;
  bitsUntilUpdate = 4;

  update(): void {
    if ((this.bitCount += this.updateCycle) > BM_MAX_COUNT) {
      this.bitCount = (this.bitCount + 1) >>> 1;
      this.bit0Count = (this.bit0Count + 1) >>> 1;
      if (this.bit0Count === this.bitCount) ++this.bitCount;
    }
    const scale = Math.floor(0x80000000 / this.bitCount);
    this.bit0Prob = Math.floor((this.bit0Count * scale) / 2 ** (31 - BM_LENGTH_SHIFT));
    this.updateCycle = (5 * this.updateCycle) >>> 2;
    if (this.updateCycle > 64) this.updateCycle = 64;
    this.bitsUntilUpdate = this.updateCycle;
  }
}

class ArithmeticDecoder {
  private pos: number;
  private value = 0;
  private length = 0xffffffff;

  constructor(private readonly bytes: Uint8Array, start = 0) {
    this.pos = start;
    for (let i = 0; i < 4; i++) this.value = this.value * 256 + this.byte();
  }

  private byte(): number {
    if (this.pos >= this.bytes.length) throw new Error('LAZ chunk table is truncated'); // i18n-exempt: internal
    return this.bytes[this.pos++]!;
  }

  private renorm(): void {
    do {
      this.value = (this.value * 256 + this.byte()) % 0x100000000;
      this.length *= 256;
    } while (this.length < AC_MIN_LENGTH);
  }

  bit(m: BitModel): number {
    this.length = this.length >>> BM_LENGTH_SHIFT;
    const x = m.bit0Prob * this.length;
    let sym: number;
    if (this.value < x) {
      sym = 0;
      this.length = x;
      ++m.bit0Count;
    } else {
      sym = 1;
      this.value -= x;
      this.length -= x;
    }
    if (this.length < AC_MIN_LENGTH) this.renorm();
    if (--m.bitsUntilUpdate === 0) m.update();
    return sym;
  }

  symbol(m: SymbolModel): number {
    let sym: number;
    let x: number;
    let y = this.length;
    if (m.decoderTable) {
      this.length = this.length >>> DM_LENGTH_SHIFT;
      const dv = Math.floor(this.value / this.length);
      const t = dv >>> m.tableShift;
      sym = m.decoderTable[t]!;
      let n = m.decoderTable[t + 1]! + 1;
      while (n > sym + 1) {
        const k = (sym + n) >>> 1;
        if (m.distribution[k]! > dv) n = k;
        else sym = k;
      }
      x = m.distribution[sym]! * this.length;
      if (sym !== m.lastSymbol) y = m.distribution[sym + 1]! * this.length;
    } else {
      x = sym = 0;
      this.length = this.length >>> DM_LENGTH_SHIFT;
      let n = m.symbols;
      let k = n >>> 1;
      do {
        const z = this.length * m.distribution[k]!;
        if (z > this.value) {
          n = k;
          y = z;
        } else {
          sym = k;
          x = z;
        }
      } while ((k = (sym + n) >>> 1) !== sym);
    }
    this.value -= x;
    this.length = y - x;
    if (this.length < AC_MIN_LENGTH) this.renorm();
    m.symbolCount[sym] = m.symbolCount[sym]! + 1;
    if (--m.symbolsUntilUpdate === 0) m.update();
    return sym;
  }

  private shortBits(): number {
    this.length = this.length >>> 16;
    const sym = Math.floor(this.value / this.length);
    this.value -= this.length * sym;
    if (this.length < AC_MIN_LENGTH) this.renorm();
    return sym;
  }

  bits(n: number): number {
    if (n > 19) {
      const lo = this.shortBits();
      return this.bits(n - 16) * 65536 + lo;
    }
    this.length = this.length >>> n;
    const sym = Math.floor(this.value / this.length);
    this.value -= this.length * sym;
    if (this.length < AC_MIN_LENGTH) this.renorm();
    return sym;
  }
}

/** IntegerCompressor(dec, 32 bits, `contexts`, bits_high 8) in decompress mode. */
class IntegerDecoder {
  private readonly bitsModels: SymbolModel[];
  private readonly bit0 = new BitModel();
  private readonly correctors: SymbolModel[] = [];
  private readonly corrBits = 32;
  private readonly bitsHigh = 8;

  constructor(private readonly dec: ArithmeticDecoder, contexts: number) {
    this.bitsModels = Array.from({ length: contexts }, () => new SymbolModel(this.corrBits + 1));
    for (let i = 1; i <= this.corrBits; i++) this.correctors[i] = new SymbolModel(i <= this.bitsHigh ? 1 << i : 1 << this.bitsHigh);
  }

  decompress(pred: number, context: number): number {
    return (pred + this.corrector(this.bitsModels[context]!)) | 0;
  }

  private corrector(model: SymbolModel): number {
    const k = this.dec.symbol(model);
    if (k === 0) return this.dec.bit(this.bit0);
    if (k >= 32) return -0x80000000;
    let c: number;
    if (k <= this.bitsHigh) c = this.dec.symbol(this.correctors[k]!);
    else {
      const k1 = k - this.bitsHigh;
      c = this.dec.symbol(this.correctors[k]!) * 2 ** k1 + this.dec.bits(k1);
    }
    return c >= 2 ** (k - 1) ? c + 1 : c - (2 ** k - 1);
  }
}

export interface LazChunk {
  /** Absolute file offset of the chunk's compressed bytes. */
  start: number;
  bytes: number;
  points: number;
}

/** The chunk table body after its version and count words; chunkSize 0xFFFFFFFF means variable chunks. */
export function decodeChunkTable(
  body: Uint8Array, chunkCount: number, chunkSize: number, firstChunkStart: number, totalPoints: number,
): LazChunk[] {
  const chunks: LazChunk[] = [];
  if (chunkCount === 0) return chunks;
  const dec = new ArithmeticDecoder(body);
  const ic = new IntegerDecoder(dec, 2);
  const variable = chunkSize === 0xffffffff;
  let prevCount = 0;
  let prevBytes = 0;
  let start = firstChunkStart;
  let remaining = totalPoints;
  for (let i = 0; i < chunkCount; i++) {
    let points = chunkSize;
    if (variable) points = prevCount = ic.decompress(i ? prevCount : 0, 0);
    const bytes = prevBytes = ic.decompress(i ? prevBytes : 0, 1);
    if (!variable) points = Math.min(chunkSize, Math.max(0, remaining));
    remaining -= points;
    chunks.push({ start, bytes, points });
    start += bytes;
  }
  return chunks;
}
