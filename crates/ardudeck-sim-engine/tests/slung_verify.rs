use ardudeck_sim_engine::copter::{
    initial_state, seed_load, step_copter, DEFAULT_ENVIRONMENT, StepOptions,
};
use ardudeck_sim_engine::frame::{multirotor_params_from_frame, SitlCustomFrame};
use ardudeck_sim_engine::guidance::{tilt_deg, Guidance, GuidanceProfile};
use ardudeck_sim_engine::math::Vec3;

// End-to-end regression: fly the Callisto-class heavy octa with an 8 kg fixed-
// length slung load using the built-in guidance controller, and assert the real
// slung-load behaviour: the load lifts off the ground on climb, hangs on a taut
// cable, swings as a pendulum after a disturbance, and couples that swing back
// into the airframe attitude. Guards the physics the SIM_JSON path streams out.
const FRAME: &str = r#"{
  "mass":32.5,"diagonal_size":1.325,"refSpd":25.0,"refAngle":30.0,
  "refVoltage":46.9,"refCurrent":65.36,"refAlt":26,"refTempC":25,
  "refBatRes":0.024,"maxVoltage":50.4,"battCapacityAh":44,"propExpo":0.5,
  "refRotRate":120,"hoverThrOut":0.36,"pwmMin":1000,"pwmMax":1940,
  "spin_min":0.2,"spin_max":0.975,"slew_max":75,"disc_area":1.82,
  "mdrag_coef":0.10,"num_motors":8,
  "slungLoad":{"loadMass":8.0,"cableLength":3.0,"hardpoint":[0,0,0.15],
    "stiffness":4000,"damping":40,"loadDragCda":0.1,"winchMin":0.5,"winchMax":8.0}
}"#;

#[test]
fn airborne_pendulum_swings_and_couples() {
    let f: SitlCustomFrame = serde_json::from_str(FRAME).unwrap();
    let p = multirotor_params_from_frame(&f);
    let slp = p.slung_load.expect("load configured");
    let env = DEFAULT_ENVIRONMENT;
    let dt = 1.0 / 400.0;

    let mut s = initial_state();
    s.load = Some(seed_load(&slp, &s));
    let mut g = Guidance::new(&p, GuidanceProfile::hover(20.0));

    let mut kicked = false;
    let mut max_swing_e: f64 = 0.0;
    let mut max_tilt_after_kick: f64 = 0.0;
    let mut liftoff_alt: Option<f64> = None;

    let total = (30.0 / dt) as usize;
    for i in 0..total {
        let pwm = g.update(&s, dt);
        s = step_copter(&pwm, &s, &p, &env, dt, StepOptions::default());
        let t = i as f64 * dt;
        let alt = -s.position.z;
        let load = s.load.unwrap();
        let load_alt = -load.position.z;

        if liftoff_alt.is_none() && load_alt > 0.3 {
            liftoff_alt = Some(alt);
        }
        if !kicked && t > 12.0 && alt > 19.0 {
            s.velocity = s.velocity.add(Vec3::new(0.0, 3.0, 0.0));
            kicked = true;
        }
        if kicked {
            let rel_e = load.position.y - s.position.y;
            max_swing_e = max_swing_e.max(rel_e.abs());
            max_tilt_after_kick = max_tilt_after_kick.max(tilt_deg(&s));
        }

        if i % 800 == 0 || (kicked && i % 200 == 0) {
            println!(
                "t={:5.1} phase={:12} alt={:5.2} loadAlt={:5.2} cable={:4.2} tension={:6.1} loadE-vE={:+5.2} tilt={:4.1}",
                t, g.phase_label(), alt, load_alt, load.cable_length, load.tension,
                load.position.y - s.position.y, tilt_deg(&s)
            );
        }
    }

    println!("--- liftoff at vehicle alt {:?}", liftoff_alt);
    println!("--- max load swing {:.2} m, max tilt after kick {:.1} deg", max_swing_e, max_tilt_after_kick);
    assert!(liftoff_alt.is_some(), "load never lifted off");
    assert!(max_swing_e > 0.3, "pendulum barely swung: {max_swing_e}");
    assert!(max_tilt_after_kick > 0.5, "no attitude coupling: {max_tilt_after_kick}");
}
