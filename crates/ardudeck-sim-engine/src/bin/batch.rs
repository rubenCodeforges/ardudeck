//! Headless batch / Monte-Carlo CLI (batch spec section 2.5).
//!
//! A second execution surface over the same physics library as the real-time
//! engine. Model (b) engine-only: drives the pure `step_copter` headless, fans a
//! scenario list or a parameter sweep across cores with deterministic per-scenario
//! seeding, and emits a per-run CSV plus an aggregated pass/fail envelope map.
//!
//!   ardudeck-sim-batch --scenarios one.json          # one/many scenarios -> CSV/JSON
//!   ardudeck-sim-batch --sweep sweep.json \          # grid sweep -> CSV + envelope
//!       --jobs 8 --trials 8 --out results.csv --envelope envelope.json

use std::io::Write;
use std::process::ExitCode;

use clap::{Parser, ValueEnum};

use ardudeck_sim_engine::runner::{aggregate, expand_sweep, flatten, run_many};
use ardudeck_sim_engine::scenario::{Scenario, ScenarioResult, Sweep};

#[derive(Copy, Clone, Debug, PartialEq, Eq, ValueEnum)]
enum Mode {
    /// (b) Engine-only physics + simple guidance / replay. Bit-exact reproducible.
    EngineOnly,
    /// (a) SITL-in-the-loop reference oracle. Not built here (deferred).
    Sitl,
}

#[derive(Parser, Debug)]
#[command(name = "ardudeck-sim-batch", about = "Headless batch / Monte-Carlo flight-envelope discovery")]
struct Args {
    /// A JSON file: a single Scenario or an array of Scenarios.
    #[arg(long)]
    scenarios: Option<String>,
    /// A JSON sweep definition (base scenario + swept axes).
    #[arg(long)]
    sweep: Option<String>,
    /// Execution model. engine-only (default) is the reproducible workhorse.
    #[arg(long, value_enum, default_value_t = Mode::EngineOnly)]
    mode: Mode,
    /// Worker threads for the fan-out. Default: available parallelism.
    #[arg(long)]
    jobs: Option<usize>,
    /// Monte-Carlo repeats per sweep cell (overrides the sweep file's `trials`).
    #[arg(long)]
    trials: Option<u32>,
    /// Base seed for per-(cell,trial) derivation (overrides the sweep file).
    #[arg(long)]
    base_seed: Option<u32>,
    /// Write per-run rows here (CSV). Without it, a single scenario prints JSON.
    #[arg(long)]
    out: Option<String>,
    /// Write the aggregated envelope map here (JSON). Sweep mode only.
    #[arg(long)]
    envelope: Option<String>,
}

fn main() -> ExitCode {
    let args = Args::parse();

    if args.mode == Mode::Sitl {
        eprintln!(
            "[batch] mode 'sitl' (model a, SITL-in-the-loop) is not built in this binary. \
             It is the high-fidelity reference oracle (deterministic:false) and is deferred; \
             use --mode engine-only for the reproducible envelope sweep."
        );
        return ExitCode::FAILURE;
    }

    let jobs = args
        .jobs
        .or_else(|| std::thread::available_parallelism().ok().map(|n| n.get()))
        .unwrap_or(1)
        .max(1);

    match (&args.scenarios, &args.sweep) {
        (Some(path), None) => run_scenarios(path, jobs, args.out.as_deref()),
        (None, Some(path)) => run_sweep(path, jobs, &args),
        (Some(_), Some(_)) => {
            eprintln!("[batch] pass exactly one of --scenarios or --sweep, not both");
            ExitCode::FAILURE
        }
        (None, None) => {
            eprintln!("[batch] nothing to do: pass --scenarios <file> or --sweep <file>");
            ExitCode::FAILURE
        }
    }
}

/// Load one scenario or an array of scenarios from a JSON file.
fn load_scenarios(path: &str) -> anyhow::Result<Vec<Scenario>> {
    let raw = std::fs::read_to_string(path)?;
    // Accept either a single object or an array.
    if let Ok(list) = serde_json::from_str::<Vec<Scenario>>(&raw) {
        return Ok(list);
    }
    let one: Scenario = serde_json::from_str(&raw)?;
    Ok(vec![one])
}

fn run_scenarios(path: &str, jobs: usize, out: Option<&str>) -> ExitCode {
    let scenarios = match load_scenarios(path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[batch] failed to load scenarios {path}: {e}");
            return ExitCode::FAILURE;
        }
    };
    let results = run_many(&scenarios, jobs);

    match out {
        Some(csv_path) => match write_csv(csv_path, &results) {
            Ok(()) => {
                eprintln!("[batch] {} run(s) -> {csv_path}", results.len());
                ExitCode::SUCCESS
            }
            Err(e) => {
                eprintln!("[batch] failed to write {csv_path}: {e}");
                ExitCode::FAILURE
            }
        },
        None => {
            // No output file: print JSON (single result unwrapped, else an array).
            let json = if results.len() == 1 {
                serde_json::to_string_pretty(&results[0]).unwrap()
            } else {
                serde_json::to_string_pretty(&results).unwrap()
            };
            println!("{json}");
            ExitCode::SUCCESS
        }
    }
}

fn run_sweep(path: &str, jobs: usize, args: &Args) -> ExitCode {
    let raw = match std::fs::read_to_string(path) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[batch] failed to read sweep {path}: {e}");
            return ExitCode::FAILURE;
        }
    };
    let mut sweep: Sweep = match serde_json::from_str(&raw) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[batch] failed to parse sweep {path}: {e}");
            return ExitCode::FAILURE;
        }
    };
    if let Some(t) = args.trials {
        sweep.trials = t.max(1);
    }
    if let Some(bs) = args.base_seed {
        sweep.base_seed = bs;
    }

    let expanded = expand_sweep(&sweep);
    let scenarios = flatten(&expanded);
    eprintln!(
        "[batch] sweep: {} cells x {} trials = {} runs on {jobs} thread(s)",
        expanded.cells.len(),
        expanded.trials,
        scenarios.len()
    );
    let results = run_many(&scenarios, jobs);

    if let Some(csv_path) = args.out.as_deref() {
        if let Err(e) = write_csv(csv_path, &results) {
            eprintln!("[batch] failed to write {csv_path}: {e}");
            return ExitCode::FAILURE;
        }
        eprintln!("[batch] per-run rows -> {csv_path}");
    }

    let envelope = aggregate(&expanded, &results);
    let env_path = args.envelope.as_deref().unwrap_or("envelope.json");
    match std::fs::write(env_path, serde_json::to_string_pretty(&envelope).unwrap()) {
        Ok(()) => eprintln!("[batch] envelope map -> {env_path}"),
        Err(e) => {
            eprintln!("[batch] failed to write {env_path}: {e}");
            return ExitCode::FAILURE;
        }
    }
    ExitCode::SUCCESS
}

/// One flat CSV row per run: swept inputs + seed + every metric + verdict. Stable
/// schema for the desktop app and the AI analyst path.
fn write_csv(path: &str, results: &[ScenarioResult]) -> std::io::Result<()> {
    let mut f = std::io::BufWriter::new(std::fs::File::create(path)?);
    writeln!(
        f,
        "scenario_id,payload_kg,wind_intensity,initial_soc,seed,outcome,within_limits,reason,\
         max_tilt_deg,min_alt_margin_m,max_climb_rate_ms,max_descent_rate_ms,peak_motor_saturation,\
         battery_v_min,battery_soc_end,time_to_failure_s,final_upright,final_vertical_speed_ms,deterministic"
    )?;
    for r in results {
        let m = &r.metrics;
        let outcome = serde_json::to_string(&r.outcome).unwrap();
        let outcome = outcome.trim_matches('"');
        let reason = r.reason.as_deref().unwrap_or("");
        let ttf = m
            .time_to_failure_s
            .map(|v| format!("{v}"))
            .unwrap_or_default();
        writeln!(
            f,
            "{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}",
            csv_field(&r.scenario_id),
            r.inputs.payload_kg,
            r.inputs.wind_intensity,
            r.inputs.initial_soc,
            r.inputs.seed,
            outcome,
            r.within_limits,
            csv_field(reason),
            m.max_tilt_deg,
            m.min_alt_margin_m,
            m.max_climb_rate_ms,
            m.max_descent_rate_ms,
            m.peak_motor_saturation,
            m.battery_v_min,
            m.battery_soc_end,
            ttf,
            m.final_upright,
            m.final_vertical_speed_ms,
            r.deterministic,
        )?;
    }
    f.flush()
}

/// Quote a CSV field when it contains a comma, quote or newline.
fn csv_field(s: &str) -> String {
    if s.contains([',', '"', '\n']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}
