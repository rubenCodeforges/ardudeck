//! ArduDeck SITL physics engine, as a library.
//!
//! Two execution surfaces share this crate: the real-time SIM_JSON FDM server
//! (`main.rs`, unchanged behavior) and the headless batch / Monte-Carlo harness
//! (`bin/batch.rs`). Both drive the same pure `step_copter` physics; the batch
//! path adds a deterministic guidance controller and a parallel scenario sweep on
//! top, without touching the physics or the real-time path.

#![allow(dead_code)]

pub mod battery;
pub mod collision;
pub mod copter;
pub mod fault;
pub mod fdm_server;
pub mod frame;
pub mod frame_geometry;
pub mod guidance;
pub mod math;
pub mod motor;
pub mod obstacle;
pub mod protocol;
pub mod record;
pub mod rng;
pub mod runner;
pub mod scenario;
pub mod sensors;
pub mod state_stream;
pub mod terrain;
pub mod wake;
pub mod wind;
pub mod world;
pub mod world_env;
