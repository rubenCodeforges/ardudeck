// Spectral analysis for log signals (vibration / harmonic-notch tuning).
// Pure math, no dependencies: iterative radix-2 FFT with Hann windowing and
// Welch segment averaging. Amplitudes are calibrated so a pure sine of
// amplitude A shows a peak of ~A at its frequency - the number a user needs
// when deciding INS_HNTCH_REF style settings, not an arbitrary PSD unit.

/** In-place iterative radix-2 FFT. Lengths must be a power of two. */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n !== im.length || (n & (n - 1)) !== 0) throw new Error('fft length must be a power of two'); // i18n-exempt: programmer error

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!; re[i] = re[j]!; re[j] = tr;
      const ti = im[i]!; im[i] = im[j]!; im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = i + k + len / 2;
        const tRe = re[b]! * curRe - im[b]! * curIm;
        const tIm = re[b]! * curIm + im[b]! * curRe;
        re[b] = re[a]! - tRe;
        im[b] = im[a]! - tIm;
        re[a] = re[a]! + tRe;
        im[a] = im[a]! + tIm;
        const nRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nRe;
      }
    }
  }
}

/** Median sample interval -> rate in Hz. Robust to scheduling jitter. Null if degenerate. */
export function estimateSampleRate(timesS: ArrayLike<number>): number | null {
  const n = timesS.length;
  if (n < 8) return null;
  const dts: number[] = [];
  for (let i = 1; i < n; i++) {
    const dt = timesS[i]! - timesS[i - 1]!;
    if (dt > 0) dts.push(dt);
  }
  if (dts.length === 0) return null;
  dts.sort((a, b) => a - b);
  const median = dts[dts.length >> 1]!;
  return median > 0 ? 1 / median : null;
}

/** Linear-interpolate (times, values) onto a uniform grid at rateHz. */
export function resampleUniform(timesS: ArrayLike<number>, values: ArrayLike<number>, rateHz: number): Float64Array {
  const n = timesS.length;
  if (n < 2 || rateHz <= 0) return new Float64Array(0);
  const t0 = timesS[0]!;
  const t1 = timesS[n - 1]!;
  const count = Math.max(0, Math.floor((t1 - t0) * rateHz) + 1);
  const out = new Float64Array(count);
  let j = 0;
  for (let i = 0; i < count; i++) {
    const t = t0 + i / rateHz;
    while (j < n - 2 && timesS[j + 1]! < t) j++;
    const ta = timesS[j]!;
    const tb = timesS[j + 1]!;
    const va = values[j]!;
    const vb = values[j + 1]!;
    out[i] = tb > ta ? va + ((vb - va) * (t - ta)) / (tb - ta) : va;
  }
  return out;
}

export interface Spectrum {
  freqHz: Float64Array;
  /** Calibrated single-sided amplitude per bin (sine of amp A peaks at ~A). */
  amplitude: Float64Array;
  segLen: number;
  segments: number;
  /** Frequency resolution (Hz per bin). */
  resolutionHz: number;
}

/**
 * Welch-averaged single-sided amplitude spectrum: Hann window, 50% overlap,
 * per-segment mean removal (so the DC bin does not dwarf the signal).
 * Returns null when there are not enough samples for a meaningful transform.
 */
export function computeSpectrum(
  samples: ArrayLike<number>,
  sampleRateHz: number,
  opts?: { maxSegLen?: number },
): Spectrum | null {
  const n = samples.length;
  if (n < 64 || sampleRateHz <= 0) return null;

  const maxSeg = opts?.maxSegLen ?? 4096;
  let segLen = 64;
  while (segLen * 2 <= Math.min(n, maxSeg)) segLen *= 2;

  // Hann window + its coherent gain (mean), used to restore true amplitude.
  const win = new Float64Array(segLen);
  let winSum = 0;
  for (let i = 0; i < segLen; i++) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (segLen - 1)));
    winSum += win[i]!;
  }
  const coherentGain = winSum / segLen;

  const half = segLen / 2;
  const acc = new Float64Array(half);
  const hop = segLen / 2; // 50% overlap
  let segments = 0;

  const re = new Float64Array(segLen);
  const im = new Float64Array(segLen);

  for (let start = 0; start + segLen <= n; start += hop) {
    let mean = 0;
    for (let i = 0; i < segLen; i++) mean += samples[start + i]!;
    mean /= segLen;
    for (let i = 0; i < segLen; i++) {
      re[i] = (samples[start + i]! - mean) * win[i]!;
      im[i] = 0;
    }
    fftInPlace(re, im);
    for (let k = 0; k < half; k++) {
      // Single-sided amplitude: 2|X_k| / (N * coherentGain)
      acc[k]! += (2 * Math.hypot(re[k]!, im[k]!)) / (segLen * coherentGain);
    }
    segments++;
  }
  if (segments === 0) return null;

  const amplitude = new Float64Array(half);
  const freqHz = new Float64Array(half);
  for (let k = 0; k < half; k++) {
    amplitude[k] = acc[k]! / segments;
    freqHz[k] = (k * sampleRateHz) / segLen;
  }

  return { freqHz, amplitude, segLen, segments, resolutionHz: sampleRateHz / segLen };
}

/** Index of the strongest bin above minFreqHz (skips the DC shoulder). */
export function peakIndex(spec: Spectrum, minFreqHz = 1): number {
  let best = -1;
  let bestAmp = -Infinity;
  for (let i = 0; i < spec.freqHz.length; i++) {
    if (spec.freqHz[i]! < minFreqHz) continue;
    if (spec.amplitude[i]! > bestAmp) { bestAmp = spec.amplitude[i]!; best = i; }
  }
  return best;
}
