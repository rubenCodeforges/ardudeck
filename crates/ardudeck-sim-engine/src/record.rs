//! PWM stream recording + replay (batch spec Phase 1, section 4.2.1).
//!
//! During a real-time SITL run the FDM server can record every commanded PWM
//! frame `(dt, pwm[..])` to a `.pwm.bin` file via an OPTIONAL recorder on the
//! vehicle. When no recorder is attached the real-time path is byte-identical to
//! before (the hook is a single `Option` check that clones nothing unless set).
//!
//! The batch harness then replays that exact PWM sequence through the identical
//! pure physics, reproducing the recorded trajectory bit-for-bit: the cleanest
//! proof that the harness plumbing (seeding, dt handling, stepping order) matches
//! the real path, because any divergence is a harness bug, not a physics change.
//!
//! File format (little-endian, self-describing, no external deps):
//!   magic  : 4 bytes  b"APWM"
//!   version: u32      = 1
//!   then per frame, repeated to EOF:
//!     dt   : f64
//!     n    : u32       (motor count for this frame)
//!     pwm  : n * f64

use std::fs::File;
use std::io::{self, BufWriter, Write};
use std::path::Path;

const MAGIC: &[u8; 4] = b"APWM";
const VERSION: u32 = 1;

/// One recorded frame: the interval `dt` (s) and the PWM vector commanded.
#[derive(Debug, Clone, PartialEq)]
pub struct PwmFrame {
    pub dt: f64,
    pub pwm: Vec<f64>,
}

/// Recorder attached to a vehicle. `to_file` streams frames to disk; `in_memory`
/// keeps them in a buffer (used by the bit-exact bridge test without touching the
/// filesystem). Recording never draws RNG and never mutates vehicle state.
pub struct PwmRecorder {
    sink: RecorderSink,
}

enum RecorderSink {
    File(BufWriter<File>),
    Memory(Vec<PwmFrame>),
}

impl PwmRecorder {
    /// Open a `.pwm.bin` file and write the header.
    pub fn to_file(path: impl AsRef<Path>) -> io::Result<PwmRecorder> {
        let mut w = BufWriter::new(File::create(path)?);
        w.write_all(MAGIC)?;
        w.write_all(&VERSION.to_le_bytes())?;
        Ok(PwmRecorder { sink: RecorderSink::File(w) })
    }

    /// A recorder that keeps frames in memory (no file), for tests.
    pub fn in_memory() -> PwmRecorder {
        PwmRecorder { sink: RecorderSink::Memory(Vec::new()) }
    }

    /// Record one commanded frame. Best-effort on a file error (a failed write on
    /// the diagnostics path must never crash a live flight).
    pub fn record(&mut self, dt: f64, pwm: &[f64]) {
        match &mut self.sink {
            RecorderSink::File(w) => {
                let _ = w.write_all(&dt.to_le_bytes());
                let _ = w.write_all(&(pwm.len() as u32).to_le_bytes());
                for v in pwm {
                    let _ = w.write_all(&v.to_le_bytes());
                }
            }
            RecorderSink::Memory(buf) => buf.push(PwmFrame { dt, pwm: pwm.to_vec() }),
        }
    }

    /// Take the in-memory frames (empty for a file recorder). Flushes nothing.
    pub fn take_memory(self) -> Vec<PwmFrame> {
        match self.sink {
            RecorderSink::Memory(buf) => buf,
            RecorderSink::File(_) => Vec::new(),
        }
    }
}

/// Read a `.pwm.bin` file into its frame list.
pub fn read_pwm_log(path: impl AsRef<Path>) -> io::Result<Vec<PwmFrame>> {
    let bytes = std::fs::read(path)?;
    decode_pwm_log(&bytes)
}

/// Decode an in-memory `.pwm.bin` byte buffer into frames.
pub fn decode_pwm_log(bytes: &[u8]) -> io::Result<Vec<PwmFrame>> {
    let err = |m: &str| io::Error::new(io::ErrorKind::InvalidData, m.to_string());
    if bytes.len() < 8 || &bytes[0..4] != MAGIC {
        return Err(err("not a .pwm.bin file (bad magic)"));
    }
    let version = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]);
    if version != VERSION {
        return Err(err("unsupported .pwm.bin version"));
    }
    let mut frames = Vec::new();
    let mut off = 8;
    while off < bytes.len() {
        if off + 12 > bytes.len() {
            return Err(err("truncated frame header"));
        }
        let dt = f64::from_le_bytes(bytes[off..off + 8].try_into().unwrap());
        off += 8;
        let n = u32::from_le_bytes(bytes[off..off + 4].try_into().unwrap()) as usize;
        off += 4;
        if off + n * 8 > bytes.len() {
            return Err(err("truncated frame payload"));
        }
        let mut pwm = Vec::with_capacity(n);
        for _ in 0..n {
            pwm.push(f64::from_le_bytes(bytes[off..off + 8].try_into().unwrap()));
            off += 8;
        }
        frames.push(PwmFrame { dt, pwm });
    }
    Ok(frames)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_recorder_captures_frames_in_order() {
        let mut rec = PwmRecorder::in_memory();
        rec.record(0.0025, &[1000.0, 1500.0, 2000.0]);
        rec.record(0.0025, &[1100.0, 1600.0, 1900.0]);
        let frames = rec.take_memory();
        assert_eq!(frames.len(), 2);
        assert_eq!(frames[0].dt, 0.0025);
        assert_eq!(frames[0].pwm, vec![1000.0, 1500.0, 2000.0]);
        assert_eq!(frames[1].pwm, vec![1100.0, 1600.0, 1900.0]);
    }

    #[test]
    fn file_round_trip_is_exact() {
        let path = std::env::temp_dir().join("ardudeck_pwm_roundtrip.pwm.bin");
        let mut rec = PwmRecorder::to_file(&path).unwrap();
        // Values that must survive as exact bit patterns (not just close).
        let a = [1234.5678, 999.001, 1777.25, 1001.0];
        let b = [1500.0, 1500.0, 1500.0, 1500.0];
        rec.record(0.0025, &a);
        rec.record(1.0 / 300.0, &b);
        drop(rec); // flush + close
        let frames = read_pwm_log(&path).unwrap();
        assert_eq!(frames.len(), 2);
        assert_eq!(frames[0].dt.to_bits(), 0.0025f64.to_bits());
        assert_eq!(frames[1].dt.to_bits(), (1.0f64 / 300.0).to_bits());
        for (r, e) in frames[0].pwm.iter().zip(a.iter()) {
            assert_eq!(r.to_bits(), e.to_bits());
        }
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn rejects_bad_magic() {
        assert!(decode_pwm_log(b"nope....").is_err());
    }
}
