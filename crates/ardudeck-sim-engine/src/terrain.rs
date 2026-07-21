//! Terrain heightfield under the vehicle. Replaces the flat NED z=0 plane so
//! ground effect, contact, friction and AGL key on the real ground.
//!
//! Coordinate convention (spec 1): NED. Terrain height `h(n,e)` is metres ABOVE
//! the home datum, positive UP. `Terrain::Flat` is `h = 0` everywhere, which
//! reproduces the legacy flat-plane behaviour byte-for-byte (regression default).

use crate::math::Vec3;

/// Ground model. `Flat` is the calm/regression default (datum plane, h=0).
#[derive(Debug, Clone)]
pub enum Terrain {
    /// Flat plane at the home datum: `h(n,e) = 0` everywhere.
    Flat,
    /// A sampled square heightfield (a DEM tile projected to local NED).
    Grid(HeightGrid),
}

/// A row-major square heightfield. Sample [row, col] sits at world NED
/// `(north0 + row*spacing, east0 + col*spacing)`, height metres above datum.
#[derive(Debug, Clone)]
pub struct HeightGrid {
    /// NED north of cell [0,0], metres relative to home.
    pub north0: f64,
    /// NED east of cell [0,0], metres relative to home.
    pub east0: f64,
    /// Metres between samples (square grid).
    pub spacing: f64,
    pub rows: usize,
    pub cols: usize,
    /// Row-major `[row*cols + col]`, metres above the home datum (+up).
    pub heights: Vec<f64>,
}

impl HeightGrid {
    fn at(&self, row: usize, col: usize) -> f64 {
        // Clamp to the last valid index; heights is validated non-empty at load.
        let r = row.min(self.rows.saturating_sub(1));
        let c = col.min(self.cols.saturating_sub(1));
        self.heights
            .get(r * self.cols + c)
            .copied()
            .unwrap_or(0.0)
    }
}

impl Terrain {
    /// Terrain height at (north, east), metres above datum (+up). Bilinear on the
    /// four surrounding samples so the surface is continuous (a discontinuous
    /// ground would make the AGL-based GE factor and contact test jitter).
    /// Positions outside the grid clamp to the nearest edge (no cliff to 0).
    pub fn height(&self, north: f64, east: f64) -> f64 {
        match self {
            Terrain::Flat => 0.0,
            Terrain::Grid(g) => {
                if g.rows == 0 || g.cols == 0 || g.spacing <= 0.0 {
                    return 0.0;
                }
                let fr = ((north - g.north0) / g.spacing).clamp(0.0, (g.rows - 1) as f64);
                let fc = ((east - g.east0) / g.spacing).clamp(0.0, (g.cols - 1) as f64);
                let r0 = fr.floor() as usize;
                let c0 = fc.floor() as usize;
                let r1 = (r0 + 1).min(g.rows - 1);
                let c1 = (c0 + 1).min(g.cols - 1);
                let tr = fr - r0 as f64;
                let tc = fc - c0 as f64;
                let h00 = g.at(r0, c0);
                let h01 = g.at(r0, c1);
                let h10 = g.at(r1, c0);
                let h11 = g.at(r1, c1);
                let top = h00 * (1.0 - tc) + h01 * tc;
                let bot = h10 * (1.0 - tc) + h11 * tc;
                top * (1.0 - tr) + bot * tr
            }
        }
    }

    /// Upward surface normal (NED, so "up" is -Z) at (north, east). Phase-1 stub:
    /// central-difference slope for later slope-normal reaction; the physics keeps
    /// the reaction vertical for now (spec 1.b), so this is diagnostics only.
    pub fn normal(&self, north: f64, east: f64) -> Vec3 {
        match self {
            Terrain::Flat => Vec3::new(0.0, 0.0, -1.0),
            Terrain::Grid(g) => {
                let d = g.spacing.max(1e-6);
                // dh/dn and dh/de by central difference (heights are +up).
                let dhdn = (self.height(north + d, east) - self.height(north - d, east)) / (2.0 * d);
                let dhde = (self.height(north, east + d) - self.height(north, east - d)) / (2.0 * d);
                // Surface z_up = h(n,e); NED down-positive normal is (-dhdn, -dhde, -1).
                Vec3::new(-dhdn, -dhde, -1.0).normalize()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A 3x3 ramp rising 10 m per cell to the north (row index), flat in east.
    fn ramp() -> Terrain {
        // row r -> height 10*r; spacing 30 m; origin at (0,0).
        let mut heights = Vec::new();
        for r in 0..3 {
            for _c in 0..3 {
                heights.push(10.0 * r as f64);
            }
        }
        Terrain::Grid(HeightGrid { north0: 0.0, east0: 0.0, spacing: 30.0, rows: 3, cols: 3, heights })
    }

    #[test]
    fn flat_is_zero_everywhere() {
        let t = Terrain::Flat;
        assert_eq!(t.height(0.0, 0.0), 0.0);
        assert_eq!(t.height(123.4, -56.7), 0.0);
    }

    #[test]
    fn bilinear_matches_hand_computed_interpolation() {
        let t = ramp();
        // On a sample: exact.
        assert!((t.height(0.0, 0.0) - 0.0).abs() < 1e-12);
        assert!((t.height(30.0, 0.0) - 10.0).abs() < 1e-12);
        assert!((t.height(60.0, 60.0) - 20.0).abs() < 1e-12);
        // Halfway north between row 0 (h=0) and row 1 (h=10): 5.
        assert!((t.height(15.0, 0.0) - 5.0).abs() < 1e-9);
        // Quarter of the way: 2.5. East position does not matter on this ramp.
        assert!((t.height(7.5, 45.0) - 2.5).abs() < 1e-9);
    }

    #[test]
    fn clamps_to_edge_outside_grid() {
        let t = ramp();
        // South/west of the grid clamps to cell [0,0] (h=0).
        assert!((t.height(-100.0, -100.0) - 0.0).abs() < 1e-9);
        // Far north-east clamps to the max corner (row 2 => h=20).
        assert!((t.height(1000.0, 1000.0) - 20.0).abs() < 1e-9);
    }

    #[test]
    fn flat_normal_is_straight_up() {
        let n = Terrain::Flat.normal(5.0, 5.0);
        assert_eq!((n.x, n.y, n.z), (0.0, 0.0, -1.0));
    }

    #[test]
    fn ramp_normal_tilts_toward_downhill() {
        // The ramp rises to the north, so the up-normal leans south (-north): its
        // north component is negative and it is unit length.
        let n = ramp().normal(30.0, 30.0);
        assert!(n.x < 0.0, "normal should lean away from the uphill (+north): {:?}", n);
        assert!((n.length() - 1.0).abs() < 1e-9);
    }
}
