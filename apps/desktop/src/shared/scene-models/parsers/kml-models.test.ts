import { describe, expect, it } from 'vitest';
import { parseKmlModels } from './kml-models';

const model = (mode: string, extra = ''): string => `
  <Placemark><name>Pm ${mode}</name>
    <Model>
      ${mode ? `<altitudeMode>${mode}</altitudeMode>` : ''}${extra}
      <Location><longitude>4.36</longitude><latitude>52.01</latitude><altitude>25</altitude></Location>
      <Link><href>models/untitled.dae</href></Link>
    </Model>
  </Placemark>`;

const doc = (body: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document>${body}</Document></kml>`;

describe('parseKmlModels', () => {
  it('maps every altitudeMode', () => {
    const body = [
      model(''),
      model('clampToGround'),
      model('relativeToGround'),
      model('absolute'),
      model('', '<gx:altitudeMode>relativeToSeaFloor</gx:altitudeMode>'),
      model('', '<gx:altitudeMode>clampToSeaFloor</gx:altitudeMode>'),
    ].join('');
    const models = parseKmlModels(doc(body));
    expect(models.map((m) => m.placement.altitudeMode)).toEqual(['clamp', 'clamp', 'agl', 'amsl', 'agl', 'clamp']);
    expect(models.map((m) => m.placement.alt)).toEqual([0, 0, 25, 25, 25, 0]);
    expect(models[0]).toMatchObject({ href: 'models/untitled.dae', name: 'Pm', placement: { lat: 52.01, lng: 4.36, scale: 1 } });
  });

  it('maps Orientation and Scale', () => {
    const extra = '<Orientation><heading>45</heading><tilt>10</tilt><roll>5</roll></Orientation><Scale><x>1</x><y>2</y><z>3</z></Scale>';
    const [m] = parseKmlModels(doc(model('absolute', extra)));
    expect(m!.placement).toMatchObject({ yawDeg: 45, pitchDeg: -10, rollDeg: -5, scale: 2 });
  });

  it('keeps zero rotations positive zero', () => {
    const [m] = parseKmlModels(doc(model('absolute')));
    expect(m!.placement.pitchDeg).toBe(0);
    expect(m!.placement.rollDeg).toBe(0);
  });

  it('ignores a Placemark without a Model and handles prefixed tags', () => {
    const body = '<Placemark><name>Pin</name><Point><coordinates>4,52,0</coordinates></Point></Placemark>';
    expect(parseKmlModels(doc(body))).toEqual([]);
    const prefixed = `<k:kml xmlns:k="http://www.opengis.net/kml/2.2"><k:Placemark><k:name>P</k:name><k:Model><k:Location><k:longitude>1</k:longitude><k:latitude>2</k:latitude></k:Location><k:Link><k:href>a.dae</k:href></k:Link></k:Model></k:Placemark></k:kml>`;
    expect(parseKmlModels(prefixed)).toMatchObject([{ href: 'a.dae', name: 'P', placement: { lat: 2, lng: 1, altitudeMode: 'clamp' } }]);
  });

  it('throws on broken XML', () => {
    expect(() => parseKmlModels('<kml><Document>')).toThrow();
  });
});
