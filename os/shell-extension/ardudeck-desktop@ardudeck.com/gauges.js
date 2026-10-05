// Cairo port of the ArduDeck app's map instruments (RoundGauge.tsx and
// AttitudePanel.tsx), so the desktop reads like the app. Geometry is drawn in
// the app's own coordinate space (104 px gauge, 200 px attitude ball) and
// scaled, and colours are the app's dark-theme --gauge-* values.
import Cairo from 'cairo';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';

const BASE = 104;
const C = BASE / 2;
const FACE_R = 44;

export const COLORS = {
    bezel: '#1b2230',
    bezel2: '#0b0e14',
    face: '#16181d',
    tickMajor: '#e5e7eb',
    tickMinor: '#6b7280',
    text: '#ffffff',
    textDim: '#b6bcc6',
    needle: '#ffffff',
    north: '#ef4444',
    green: '#34d399',
    amber: '#f59e0b',
    red: '#f87171',
    teal: '#2dd4bf',
};

function rgba(hex, a = 1) {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a];
}

function setColor(cr, hex, a = 1) {
    cr.setSourceRGBA(...rgba(hex, a));
}

/** Point at radius r, angle in degrees (0 = up, clockwise), like gaugePoint(). */
function point(r, deg) {
    const rad = (deg * Math.PI) / 180;
    return [C + r * Math.sin(rad), C - r * Math.cos(rad)];
}

function arc(cr, r, fromDeg, toDeg) {
    const toCairo = d => ((d - 90) * Math.PI) / 180;
    cr.newSubPath();
    cr.arc(C, C, r, toCairo(fromDeg), toCairo(toDeg));
}

export function valueToAngle(value, scale) {
    const clamped = Math.max(scale.min, Math.min(scale.max, value));
    const t = (clamped - scale.min) / (scale.max - scale.min || 1);
    return scale.startAngle + t * (scale.endAngle - scale.startAngle);
}

function measure(cr, str, font, size) {
    const layout = PangoCairo.create_layout(cr);
    layout.set_font_description(Pango.FontDescription.from_string(`${font} ${size}px`));
    layout.set_text(str, -1);
    return layout.get_pixel_size()[0];
}

/** Draw text centred on (x, y). */
function text(cr, str, x, y, {font = 'JetBrains Mono Bold', size = 15, color = COLORS.text, alpha = 1, letterSpacing = 0} = {}) {
    const layout = PangoCairo.create_layout(cr);
    const desc = Pango.FontDescription.from_string(`${font} ${size}px`);
    layout.set_font_description(desc);
    if (letterSpacing) {
        const attrs = new Pango.AttrList();
        attrs.insert(Pango.attr_letter_spacing_new(letterSpacing * Pango.SCALE));
        layout.set_attributes(attrs);
    }
    layout.set_text(str, -1);
    const [w, h] = layout.get_pixel_size();
    setColor(cr, color, alpha);
    cr.moveTo(x - w / 2, y - h / 2);
    PangoCairo.show_layout(cr, layout);
    return [w, h];
}

/**
 * RoundGauge: bezel, face, zones, ticks, optional extra layer, centre value,
 * label pill, rim pointer and sheen, in the same order as the React version.
 */
export function drawRoundGauge(cr, size, opts) {
    const {label, scale, needleValue, value, unit, sub, valueColor = COLORS.text, extra, dim} = opts;
    cr.save();
    cr.scale(size / BASE, size / BASE);
    if (dim) cr.pushGroup();

    // Bezel
    const bezel = new Cairo.LinearGradient(0, 0, 0, BASE);
    bezel.addColorStopRGBA(0, ...rgba(COLORS.bezel));
    bezel.addColorStopRGBA(1, ...rgba(COLORS.bezel2));
    cr.arc(C, C, C - 0.75, 0, 2 * Math.PI);
    cr.setSource(bezel);
    cr.fillPreserve();
    cr.setSourceRGBA(0, 0, 0, 0.4);
    cr.setLineWidth(1);
    cr.stroke();
    cr.arc(C, C, FACE_R + 1.5, 0, 2 * Math.PI);
    cr.setSourceRGBA(0, 0, 0, 0.45);
    cr.setLineWidth(2.5);
    cr.stroke();
    cr.arc(C, C, FACE_R, 0, 2 * Math.PI);
    setColor(cr, COLORS.face);
    cr.fill();

    if (scale) {
        for (const z of scale.zones ?? []) {
            arc(cr, 41, valueToAngle(z.from, scale), valueToAngle(z.to, scale));
            setColor(cr, z.color);
            cr.setLineWidth(3.5);
            cr.stroke();
        }
        const tick = (v, r2, color, w) => {
            const a = valueToAngle(v, scale);
            const [x1, y1] = point(43, a);
            const [x2, y2] = point(r2, a);
            cr.moveTo(x1, y1);
            cr.lineTo(x2, y2);
            setColor(cr, color);
            cr.setLineWidth(w);
            cr.stroke();
        };
        for (const v of scale.minorTicks ?? []) tick(v, 39.5, COLORS.tickMinor, 1);
        for (const v of scale.majorTicks ?? []) tick(v, 37, COLORS.tickMajor, 1.5);
    }

    // Centre value
    const hasSub = sub !== undefined && sub !== null && sub !== '';
    const vy = hasSub ? C - 5 : C;
    const shown = value ?? '--';
    const withUnit = unit && shown !== '--';
    // Centre value + unit as one group, unit baseline-ish below the value's midline.
    const vw = measure(cr, shown, 'JetBrains Mono Bold', 15);
    const uw = withUnit ? measure(cr, unit, 'JetBrains Mono', 8) + 1.5 : 0;
    const left = C - (vw + uw) / 2;
    text(cr, shown, left + vw / 2, vy, {size: 15, color: valueColor});
    if (withUnit) text(cr, unit, left + vw + uw / 2 + 0.75, vy + 2.5, {font: 'JetBrains Mono', size: 8, color: COLORS.textDim});
    if (hasSub) text(cr, sub, C, C + 9, {font: 'JetBrains Mono', size: 9, color: COLORS.textDim});

    // Label pill
    const layout = PangoCairo.create_layout(cr);
    layout.set_font_description(Pango.FontDescription.from_string('Inter Variable Semi-Bold 9px'));
    layout.set_text(label.toUpperCase(), -1);
    const [lw, lh] = layout.get_pixel_size();
    setColor(cr, COLORS.face);
    cr.rectangle(C - lw / 2 - 2, BASE - 12 - lh - 1, lw + 4, lh + 2);
    cr.fill();
    text(cr, label.toUpperCase(), C, BASE - 12 - lh / 2, {font: 'Inter Variable Semi-Bold', size: 9, color: COLORS.textDim, letterSpacing: 1});

    // Moving layer above the printed text
    extra?.(cr, {C, point, arc, setColor, text});

    if (scale && needleValue !== undefined) {
        const angle = valueToAngle(needleValue ?? scale.min, scale);
        cr.save();
        cr.translate(C, C);
        cr.rotate((angle * Math.PI) / 180);
        cr.moveTo(0, -40);
        cr.lineTo(-2, -22);
        cr.lineTo(2, -22);
        cr.closePath();
        setColor(cr, COLORS.needle);
        cr.fillPreserve();
        cr.setSourceRGBA(0, 0, 0, 0.5);
        cr.setLineWidth(0.5);
        cr.stroke();
        cr.restore();
    }

    const sheen = new Cairo.RadialGradient(C, BASE * 0.32, 0, C, BASE * 0.32, BASE * 0.7);
    sheen.addColorStopRGBA(0, 1, 1, 1, 0.09);
    sheen.addColorStopRGBA(1, 1, 1, 1, 0);
    cr.arc(C, C, FACE_R, 0, 2 * Math.PI);
    cr.setSource(sheen);
    cr.fill();

    if (dim) {
        cr.popGroupToSource();
        cr.paintWithAlpha(0.35);
    }
    cr.restore();
}

/** HeadingRose: rotating 30° ticks with cardinals, fixed amber lubber mark. */
export function headingRose(heading) {
    return (cr, {point, setColor, text}) => {
        cr.save();
        cr.translate(C, C);
        cr.rotate((-heading * Math.PI) / 180);
        cr.translate(-C, -C);
        const letters = ['N', 'E', 'S', 'W'];
        for (let i = 0; i < 12; i++) {
            const d = i * 30;
            const cardinal = d % 90 === 0;
            const [x1, y1] = point(43, d);
            const [x2, y2] = point(cardinal ? 36.5 : 39.5, d);
            cr.moveTo(x1, y1);
            cr.lineTo(x2, y2);
            setColor(cr, d === 0 ? COLORS.north : cardinal ? '#ffffff' : COLORS.tickMajor);
            cr.setLineWidth(cardinal ? 1.8 : 1);
            cr.stroke();
            if (cardinal) {
                cr.save();
                cr.translate(C, C);
                cr.rotate((d * Math.PI) / 180);
                cr.translate(-C, -C);
                text(cr, letters[d / 90], C, 21, {font: 'Inter Variable Semi-Bold', size: 8, color: '#ffffff'});
                cr.restore();
            }
        }
        cr.restore();
        cr.moveTo(52, 17);
        cr.lineTo(48, 9);
        cr.lineTo(56, 9);
        cr.closePath();
        setColor(cr, COLORS.amber);
        cr.fill();
    };
}

/** Climb arc on the right half: up for climb, down for sink, full deflection at 5 m/s. */
export function vsiArc(climb) {
    return (cr, {arc, setColor}) => {
        if (!Number.isFinite(climb) || Math.abs(climb) < 0.05) return;
        const deflect = Math.max(-60, Math.min(60, (climb / 5) * 60));
        if (deflect > 0) arc(cr, 41, 90 - deflect, 90);
        else arc(cr, 41, 90, 90 - deflect);
        setColor(cr, Math.abs(climb) > 3 ? COLORS.amber : COLORS.teal);
        cr.setLineWidth(3.5);
        cr.stroke();
    };
}

/** AttitudeIndicator: compass ring around a sky/ground ball with fixed aircraft symbol. */
export function drawAttitude(cr, size, {roll, pitch, heading, dim}) {
    const S = 200;
    const c = S / 2;
    cr.save();
    cr.scale(size / S, size / S);
    if (dim) cr.pushGroup();

    // Backing disc, like the app's bg-surface-overlay-light circle
    cr.arc(c, c, c + 2, 0, 2 * Math.PI);
    cr.setSourceRGBA(0.04, 0.05, 0.08, 0.85);
    cr.fill();
    cr.arc(c, c, c - 2, 0, 2 * Math.PI);
    setColor(cr, '#374151');
    cr.setLineWidth(1);
    cr.stroke();

    const letters = ['N', 'E', 'S', 'W'];
    for (let i = 0; i < 360; i += 10) {
        const major = i % 30 === 0;
        const cardinal = i % 90 === 0;
        const len = cardinal ? 10 : major ? 6 : 3;
        cr.save();
        cr.translate(c, c);
        cr.rotate(((i - heading) * Math.PI) / 180);
        cr.moveTo(0, -c + 18);
        cr.lineTo(0, -c + 18 + len);
        setColor(cr, cardinal ? '#ffffff' : major ? '#9ca3af' : '#4b5563');
        cr.setLineWidth(cardinal ? 2 : 1);
        cr.stroke();
        if (cardinal) {
            cr.translate(-c, -c);
            text(cr, letters[i / 90], c, 13, {font: 'Inter Variable Semi-Bold', size: 10, color: '#ffffff'});
        }
        cr.restore();
    }
    cr.moveTo(c, 2);
    cr.lineTo(c - 5, 8);
    cr.lineTo(c + 5, 8);
    cr.closePath();
    setColor(cr, COLORS.amber);
    cr.fill();

    // Ball
    const ring = 30;
    const inner = S - ring * 2;
    const r = inner / 2;
    const p = Math.max(-60, Math.min(60, pitch));
    const pitchOffset = (p / 60) * (inner * 0.4);
    cr.save();
    cr.arc(c, c, r, 0, 2 * Math.PI);
    cr.clip();
    cr.translate(c, c);
    cr.rotate((-roll * Math.PI) / 180);
    const sky = new Cairo.LinearGradient(0, -inner * 1.5 + pitchOffset, 0, pitchOffset);
    sky.addColorStopRGBA(0, ...rgba('#2563eb'));
    sky.addColorStopRGBA(1, ...rgba('#3b82f6'));
    cr.rectangle(-inner, -inner * 1.5 + pitchOffset, inner * 2, inner * 1.5);
    cr.setSource(sky);
    cr.fill();
    const ground = new Cairo.LinearGradient(0, pitchOffset, 0, inner * 1.5 + pitchOffset);
    ground.addColorStopRGBA(0, ...rgba('#b45309'));
    ground.addColorStopRGBA(1, ...rgba('#92400e'));
    cr.rectangle(-inner, pitchOffset, inner * 2, inner * 1.5);
    cr.setSource(ground);
    cr.fill();
    // Horizon line and pitch ladder (10° steps)
    cr.moveTo(-inner, pitchOffset);
    cr.lineTo(inner, pitchOffset);
    cr.setSourceRGBA(1, 1, 1, 0.9);
    cr.setLineWidth(1.5);
    cr.stroke();
    for (const deg of [-20, -10, 10, 20]) {
        const y = pitchOffset - (deg / 60) * (inner * 0.4);
        const half = Math.abs(deg) === 20 ? 18 : 10;
        cr.moveTo(-half, y);
        cr.lineTo(half, y);
        cr.setSourceRGBA(1, 1, 1, 0.6);
        cr.setLineWidth(1);
        cr.stroke();
    }
    cr.restore();
    cr.arc(c, c, r, 0, 2 * Math.PI);
    setColor(cr, '#4b5563');
    cr.setLineWidth(2);
    cr.stroke();

    // Fixed aircraft symbol
    setColor(cr, COLORS.amber);
    cr.setLineWidth(3);
    cr.moveTo(c - 32, c);
    cr.lineTo(c - 10, c);
    cr.moveTo(c + 10, c);
    cr.lineTo(c + 32, c);
    cr.stroke();
    cr.arc(c, c, 4, 0, 2 * Math.PI);
    cr.fill();

    if (dim) {
        cr.popGroupToSource();
        cr.paintWithAlpha(0.35);
    }
    cr.restore();
}
