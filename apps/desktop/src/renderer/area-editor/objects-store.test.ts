/**
 * Tests for objects-store.ts — the object-based Area Editor state.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { LatLng } from '../components/survey/survey-types';
import { useObjectsStore } from './objects-store';
import { makeRectangle, objectWorldRing, makeFromWorldRing, type EditorObject } from './area-object';
import { distanceLatLng } from '../components/survey/geo-math';

const CENTER: LatLng = { lat: 42, lng: 19 };

// A real (non-degenerate) n-gon around CENTER. Earlier this returned collinear
// points, which is a fine corridor centerline but a zero-area "polygon" - holes
// now get clipped to their area, so areas must enclose real space.
function poly(n: number): LatLng[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { lat: 42 + 0.001 * Math.sin(a), lng: 19 + 0.001 * Math.cos(a) };
  });
}

beforeEach(() => {
  useObjectsStore.setState({
    objects: [], selectedId: null, tool: 'select',
    draftPoints: [], draftType: null, selectedVertex: null,
    measurePoints: [], measureDone: false, selectedMeasure: false,
    corridorWidthM: 60, nameSeq: 0, contextMenu: null, past: [], future: [],
  });
});

describe('tool + draft', () => {
  it('selecting the polygon tool starts a draft', () => {
    useObjectsStore.getState().setTool('polygon');
    const s = useObjectsStore.getState();
    expect(s.tool).toBe('polygon');
    expect(s.draftType).toBe('polygon');
    expect(s.draftPoints).toEqual([]);
  });

  it('finishing a polygon draft (>=3 pts) creates and selects an object', () => {
    const st = useObjectsStore.getState();
    st.setTool('polygon');
    poly(4).forEach((p) => st.addDraftPoint(p));
    st.finishDraft();
    const s = useObjectsStore.getState();
    expect(s.objects).toHaveLength(1);
    expect(s.objects[0]!.type).toBe('polygon');
    expect(s.selectedId).toBe(s.objects[0]!.id);
    expect(s.tool).toBe('select');
    expect(s.draftType).toBeNull();
  });

  it('the hole tool cuts an inner ring into the selected area', () => {
    const st = useObjectsStore.getState();
    st.setTool('polygon');
    poly(4).forEach((p) => st.addDraftPoint(p));
    st.finishDraft();
    const areaId = useObjectsStore.getState().objects[0]!.id;

    st.setTool('hole');
    expect(useObjectsStore.getState().draftType).toBe('polygon');
    [{ lat: 42.0001, lng: 19.0001 }, { lat: 42.0003, lng: 19.0001 }, { lat: 42.0002, lng: 19.0003 }]
      .forEach((p) => st.addDraftPoint(p));
    st.finishHole();
    const s = useObjectsStore.getState();
    expect(s.objects).toHaveLength(1); // no new object created
    expect(s.objects[0]!.id).toBe(areaId);
    expect(s.objects[0]!.holes).toHaveLength(1);
    expect(s.objects[0]!.holes[0]!.length).toBe(3);
    expect(s.tool).toBe('select');
  });

  it('cutting a hole with no selection or <3 points is a no-op', () => {
    const st = useObjectsStore.getState();
    st.setTool('hole');
    [{ lat: 42.0002, lng: 19.0002 }, { lat: 42.0008, lng: 19.0002 }].forEach((p) => st.addDraftPoint(p));
    st.finishHole();
    expect(useObjectsStore.getState().objects).toHaveLength(0);
  });

  it('cutting a hole into a parametric rectangle promotes it to an editable polygon', () => {
    const st = useObjectsStore.getState();
    st.addObject(makeRectangle(CENTER, 200, 200, 'Rect'));
    const id = useObjectsStore.getState().objects[0]!.id;
    expect(useObjectsStore.getState().objects[0]!.type).toBe('rectangle');
    st.selectObject(id);
    st.setTool('hole');
    [
      { lat: 42.0002, lng: 19.0002 }, { lat: 42.0008, lng: 19.0002 }, { lat: 42.0005, lng: 19.0008 },
    ].forEach((p) => st.addDraftPoint(p));
    st.finishHole();
    const o = useObjectsStore.getState().objects[0]!;
    expect(o.type).toBe('polygon');
    expect(o.holes).toHaveLength(1);
  });

  function areaWithHole(): string {
    const st = useObjectsStore.getState();
    st.setTool('polygon');
    poly(4).forEach((p) => st.addDraftPoint(p));
    st.finishDraft();
    st.setTool('hole');
    [
      { lat: 42.0001, lng: 19.0001 }, { lat: 42.0003, lng: 19.0001 },
      { lat: 42.0003, lng: 19.0003 }, { lat: 42.0001, lng: 19.0003 },
    ].forEach((p) => st.addDraftPoint(p));
    st.finishHole();
    return useObjectsStore.getState().objects[0]!.id;
  }

  it('moveVertex with a hole index moves a hole point, leaving the outer ring intact', () => {
    const id = areaWithHole();
    const st = useObjectsStore.getState();
    st.selectObject(id);
    const before = useObjectsStore.getState().objects[0]!;
    const outerBefore = before.base.map((p) => ({ ...p }));
    const holePt0 = { ...before.holes[0]![0]! };
    st.moveVertex(0, { lat: 42.0003, lng: 19.0003 }, -1, 0);
    const after = useObjectsStore.getState().objects[0]!;
    expect(after.base).toEqual(outerBefore);
    expect(after.holes[0]![0]).not.toEqual(holePt0);
  });

  it('deleteVertex on a hole removes a point, then drops the hole below 3', () => {
    const id = areaWithHole();
    const st = useObjectsStore.getState();
    st.selectObject(id);
    expect(useObjectsStore.getState().objects[0]!.holes[0]!.length).toBe(4);
    st.deleteVertex(0, -1, 0);
    expect(useObjectsStore.getState().objects[0]!.holes[0]!.length).toBe(3);
    st.deleteVertex(0, -1, 0);
    expect(useObjectsStore.getState().objects[0]!.holes).toHaveLength(0);
  });

  it('insertVertexAfter on a hole adds a point to that hole, not the outer ring', () => {
    const id = areaWithHole();
    const st = useObjectsStore.getState();
    st.selectObject(id);
    const outerLen = useObjectsStore.getState().objects[0]!.base.length;
    st.insertVertexAfter(0, { lat: 42.0005, lng: 19.0002 }, 0);
    const after = useObjectsStore.getState().objects[0]!;
    expect(after.holes[0]!.length).toBe(5);
    expect(after.base.length).toBe(outerLen);
  });

  it('a corridor finishes at 2 points and carries the width', () => {
    const st = useObjectsStore.getState();
    st.setCorridorWidth(80);
    st.setTool('corridor');
    poly(2).forEach((p) => st.addDraftPoint(p));
    st.finishDraft();
    const obj = useObjectsStore.getState().objects[0]!;
    expect(obj.type).toBe('corridor');
    expect(obj.corridorWidthM).toBe(80);
  });

  it('an under-sized draft is discarded', () => {
    const st = useObjectsStore.getState();
    st.setTool('polygon');
    poly(2).forEach((p) => st.addDraftPoint(p));
    st.finishDraft();
    expect(useObjectsStore.getState().objects).toHaveLength(0);
  });

  it('switching tools cancels an in-progress draft', () => {
    const st = useObjectsStore.getState();
    st.setTool('polygon');
    poly(2).forEach((p) => st.addDraftPoint(p));
    st.setTool('select');
    expect(useObjectsStore.getState().draftPoints).toEqual([]);
    expect(useObjectsStore.getState().draftType).toBeNull();
  });
});

describe('addObject + transforms', () => {
  it('addObject pushes, selects, and returns to select tool', () => {
    const rect = makeRectangle(CENTER, 100, 100, 'R');
    useObjectsStore.getState().addObject(rect);
    const s = useObjectsStore.getState();
    expect(s.objects).toHaveLength(1);
    expect(s.selectedId).toBe(rect.id);
    expect(s.tool).toBe('select');
  });

  it('translateSelected moves the selected object', () => {
    const rect = makeRectangle(CENTER, 50, 50, 'R');
    const st = useObjectsStore.getState();
    st.addObject(rect);
    st.translateSelected(0.001, 0);
    expect(useObjectsStore.getState().objects[0]!.center.lat).toBeCloseTo(42.001);
  });

  it('rotateSelected accumulates rotation', () => {
    const rect = makeRectangle(CENTER, 50, 50, 'R');
    const st = useObjectsStore.getState();
    st.addObject(rect);
    st.rotateSelected(30);
    st.rotateSelected(15);
    expect(useObjectsStore.getState().objects[0]!.rotationDeg).toBeCloseTo(45);
  });

  it('scaleSelected resizes about the anchor', () => {
    const rect = makeRectangle(CENTER, 100, 100, 'R');
    const st = useObjectsStore.getState();
    st.addObject(rect);
    st.scaleSelected(2, 2, { x: -50, y: -50 });
    const ring = objectWorldRing(useObjectsStore.getState().objects[0]!);
    // far corner now ~200m diagonal-ish from anchor; just assert it grew
    const span = distanceLatLng(ring[0]!, ring[2]!);
    expect(span).toBeGreaterThan(200);
  });
});

describe('object list ops', () => {
  it('rename / toggleVisible / delete', () => {
    const r = makeRectangle(CENTER, 10, 10, 'R');
    const st = useObjectsStore.getState();
    st.addObject(r);
    st.renameObject(r.id, 'Field A');
    expect(useObjectsStore.getState().objects[0]!.name).toBe('Field A');
    st.toggleVisible(r.id);
    expect(useObjectsStore.getState().objects[0]!.visible).toBe(false);
    st.deleteObject(r.id);
    expect(useObjectsStore.getState().objects).toHaveLength(0);
    expect(useObjectsStore.getState().selectedId).toBeNull();
  });

  it('reorder swaps with the neighbor', () => {
    const a = makeRectangle(CENTER, 10, 10, 'A');
    const b = makeRectangle(CENTER, 10, 10, 'B');
    const st = useObjectsStore.getState();
    st.addObject(a);
    st.addObject(b);
    st.reorderObject(b.id, -1); // move B up
    expect(useObjectsStore.getState().objects[0]!.id).toBe(b.id);
  });

  it('splits an area the line crosses even with nothing selected', () => {
    const sq = makeRectangle(CENTER, 200, 200, 'Sq');
    const st = useObjectsStore.getState();
    st.addObject(sq);
    st.selectObject(null); // no selection
    st.splitSelectedByLine({ lat: 42.01, lng: 19 }, { lat: 41.99, lng: 19 });
    expect(useObjectsStore.getState().objects).toHaveLength(2);
  });

  it('convertSelectedToPolygon changes the type', () => {
    const r = makeRectangle(CENTER, 10, 10, 'R');
    const st = useObjectsStore.getState();
    st.addObject(r);
    st.convertSelectedToPolygon();
    expect(useObjectsStore.getState().objects[0]!.type).toBe('polygon');
  });
});

describe('workspace role', () => {
  it('setObjectRole grants and clears the workspace role', () => {
    const r = makeRectangle(CENTER, 10, 10, 'R');
    const st = useObjectsStore.getState();
    st.addObject(r);
    st.setObjectRole(r.id, 'workspace');
    expect(useObjectsStore.getState().objects[0]!.role).toBe('workspace');
    st.setObjectRole(r.id, null);
    expect(useObjectsStore.getState().objects[0]!.role).toBeUndefined();
  });

  it('granting the role to one object strips it from any other', () => {
    const a = makeRectangle(CENTER, 10, 10, 'A');
    const b = makeRectangle(CENTER, 20, 20, 'B');
    const st = useObjectsStore.getState();
    st.addObject(a);
    st.addObject(b);
    st.setObjectRole(a.id, 'workspace');
    st.setObjectRole(b.id, 'workspace');
    const s = useObjectsStore.getState();
    expect(s.objects.find((o) => o.id === a.id)!.role).toBeUndefined();
    expect(s.objects.find((o) => o.id === b.id)!.role).toBe('workspace');
    expect(s.objects.filter((o) => o.role === 'workspace')).toHaveLength(1);
  });

  it('duplicating a workspace object does not copy the role', () => {
    const r = makeRectangle(CENTER, 10, 10, 'R');
    const st = useObjectsStore.getState();
    st.addObject(r);
    st.setObjectRole(r.id, 'workspace');
    st.duplicateObject(r.id);
    const s = useObjectsStore.getState();
    expect(s.objects).toHaveLength(2);
    expect(s.objects.filter((o) => o.role === 'workspace')).toHaveLength(1);
  });

  it('setObjectRole is undoable', () => {
    const r = makeRectangle(CENTER, 10, 10, 'R');
    const st = useObjectsStore.getState();
    st.addObject(r);
    st.setObjectRole(r.id, 'workspace');
    st.undo();
    expect(useObjectsStore.getState().objects[0]!.role).toBeUndefined();
  });
});

describe('vertex editing', () => {
  it('moves, inserts, and deletes vertices on the selected object', () => {
    const st = useObjectsStore.getState();
    st.setTool('polygon');
    poly(4).forEach((p) => st.addDraftPoint(p));
    st.finishDraft();
    const id = useObjectsStore.getState().selectedId!;
    const before = useObjectsStore.getState().objects[0]!.base.length;

    st.insertVertexAfter(0, { lat: 42.0005, lng: 19.0005 });
    expect(useObjectsStore.getState().objects[0]!.base.length).toBe(before + 1);

    st.deleteVertex(0);
    expect(useObjectsStore.getState().objects[0]!.base.length).toBe(before);

    // moving a vertex keeps the count, changes geometry
    const ringBefore = objectWorldRing(useObjectsStore.getState().objects[0]!);
    st.moveVertex(0, { lat: 42.01, lng: 19.01 });
    const ringAfter = objectWorldRing(useObjectsStore.getState().objects[0]!);
    expect(distanceLatLng(ringBefore[0]!, ringAfter[0]!)).toBeGreaterThan(1);
    expect(id).toBeTruthy();
  });

  it('will not delete below the minimum vertex count', () => {
    const st = useObjectsStore.getState();
    st.setTool('polygon');
    poly(3).forEach((p) => st.addDraftPoint(p));
    st.finishDraft();
    st.deleteVertex(0);
    expect(useObjectsStore.getState().objects[0]!.base.length).toBe(3);
  });
});

describe('measure + width', () => {
  it('only records measure points while the measure tool is active', () => {
    const st = useObjectsStore.getState();
    st.addMeasurePoint({ lat: 42, lng: 19 });
    expect(useObjectsStore.getState().measurePoints).toHaveLength(0);
    st.setTool('measure');
    st.addMeasurePoint({ lat: 42, lng: 19 });
    expect(useObjectsStore.getState().measurePoints).toHaveLength(1);
    st.clearMeasure();
    expect(useObjectsStore.getState().measurePoints).toHaveLength(0);
  });

  it('moveMeasurePoint relocates one point of the measurement', () => {
    const st = useObjectsStore.getState();
    st.setTool('measure');
    st.addMeasurePoint({ lat: 42, lng: 19 });
    st.addMeasurePoint({ lat: 42.001, lng: 19.001 });
    st.moveMeasurePoint(0, { lat: 42.5, lng: 19.5 });
    const pts = useObjectsStore.getState().measurePoints;
    expect(pts[0]).toEqual({ lat: 42.5, lng: 19.5 });
    expect(pts[1]).toEqual({ lat: 42.001, lng: 19.001 });
  });

  it('editMeasurement re-enters the measure tool to extend', () => {
    const st = useObjectsStore.getState();
    st.setTool('measure');
    st.addMeasurePoint({ lat: 42, lng: 19 });
    st.addMeasurePoint({ lat: 42.001, lng: 19.001 });
    st.endMeasure();
    st.setTool('select');
    st.selectMeasure();
    st.editMeasurement();
    const s = useObjectsStore.getState();
    expect(s.tool).toBe('measure');
    expect(s.measureDone).toBe(false);
    expect(s.measurePoints).toHaveLength(2); // existing points kept
  });

  it('setCorridorWidth clamps and updates a selected corridor', () => {
    const st = useObjectsStore.getState();
    st.setTool('corridor');
    poly(2).forEach((p) => st.addDraftPoint(p));
    st.finishDraft();
    st.setCorridorWidth(0);
    expect(useObjectsStore.getState().corridorWidthM).toBe(1);
    expect(useObjectsStore.getState().objects[0]!.corridorWidthM).toBe(1);
  });
});

describe('undo / redo', () => {
  it('undo reverts a delete and redo re-applies it', () => {
    const r = makeRectangle(CENTER, 10, 10, 'R');
    const st = useObjectsStore.getState();
    st.addObject(r);
    st.deleteObject(r.id);
    expect(useObjectsStore.getState().objects).toHaveLength(0);

    st.undo();
    expect(useObjectsStore.getState().objects).toHaveLength(1);
    expect(useObjectsStore.getState().objects[0]!.id).toBe(r.id);

    st.redo();
    expect(useObjectsStore.getState().objects).toHaveLength(0);
  });

  it('undo with empty history is a no-op', () => {
    useObjectsStore.getState().undo();
    expect(useObjectsStore.getState().objects).toHaveLength(0);
  });

  it('a new edit clears the redo stack', () => {
    const a = makeRectangle(CENTER, 10, 10, 'A');
    const b = makeRectangle(CENTER, 10, 10, 'B');
    const st = useObjectsStore.getState();
    st.addObject(a);
    st.undo(); // a removed, future has the add
    expect(useObjectsStore.getState().future.length).toBe(1);
    st.addObject(b); // a fresh edit
    expect(useObjectsStore.getState().future.length).toBe(0);
  });

  it('undo returns to the select tool (never stranded in a draw/cut tool)', () => {
    const r = makeRectangle(CENTER, 10, 10, 'R');
    const st = useObjectsStore.getState();
    st.addObject(r);
    st.setTool('hole'); // e.g. just picked "Cut hole" from the context menu
    st.undo();
    const s = useObjectsStore.getState();
    expect(s.tool).toBe('select');
    expect(s.draftType).toBeNull();
    expect(s.contextMenu).toBeNull();
  });

  it('rename is undoable', () => {
    const r = makeRectangle(CENTER, 10, 10, 'R');
    const st = useObjectsStore.getState();
    st.addObject(r);
    st.renameObject(r.id, 'Renamed');
    expect(useObjectsStore.getState().objects[0]!.name).toBe('Renamed');
    st.undo();
    expect(useObjectsStore.getState().objects[0]!.name).toBe('R');
  });
});

describe('duplicate', () => {
  it('clones the object under a new id, offsets it, and selects the copy', () => {
    const r = makeRectangle(CENTER, 40, 40, 'Field');
    const st = useObjectsStore.getState();
    st.addObject(r);
    st.duplicateObject(r.id);
    const s = useObjectsStore.getState();
    expect(s.objects).toHaveLength(2);
    const copy = s.objects[1]!;
    expect(copy.id).not.toBe(r.id);
    expect(copy.name).toBe('Field copy');
    expect(s.selectedId).toBe(copy.id);
    // offset, so the centers are not identical
    expect(copy.center.lat === r.center.lat && copy.center.lng === r.center.lng).toBe(false);
    // duplicate is undoable
    st.undo();
    expect(useObjectsStore.getState().objects).toHaveLength(1);
  });
});

describe('measure selection + context menu', () => {
  it('selectMeasure marks the ruler selected and clears object selection', () => {
    const r = makeRectangle(CENTER, 10, 10, 'R');
    const st = useObjectsStore.getState();
    st.addObject(r);
    st.selectMeasure();
    const s = useObjectsStore.getState();
    expect(s.selectedMeasure).toBe(true);
    expect(s.selectedId).toBeNull();
  });

  it('selecting an object clears the measure selection', () => {
    const r = makeRectangle(CENTER, 10, 10, 'R');
    const st = useObjectsStore.getState();
    st.addObject(r);
    st.selectMeasure();
    st.selectObject(r.id);
    expect(useObjectsStore.getState().selectedMeasure).toBe(false);
  });

  it('open/close context menu sets and clears the menu state', () => {
    const st = useObjectsStore.getState();
    st.openContextMenu({ x: 10, y: 20, target: { kind: 'empty' } });
    expect(useObjectsStore.getState().contextMenu).toEqual({ x: 10, y: 20, target: { kind: 'empty' } });
    st.closeContextMenu();
    expect(useObjectsStore.getState().contextMenu).toBeNull();
  });
});

describe('loadWorldRings + reset', () => {

  it('imports a bare centreline as a corridor', () => {
    const st = useObjectsStore.getState();
    st.loadWorldRings([
      { ring: [{ lat: 53.566, lng: 9.0701 }, { lat: 53.5733, lng: 9.0999 }, { lat: 53.5722, lng: 9.1052 }], type: 'corridor' },
    ]);
    const objs = useObjectsStore.getState().objects;
    expect(objs).toHaveLength(1);
    expect(objs[0]!.type).toBe('corridor');
    expect(objs[0]!.base.length).toBe(3);
  });
  it('loads rings as objects and reset clears them', () => {
    const st = useObjectsStore.getState();
    st.loadWorldRings([{ ring: poly(4) }, { ring: poly(3), type: 'polygon' }]);
    expect(useObjectsStore.getState().objects).toHaveLength(2);
    st.reset();
    expect(useObjectsStore.getState().objects).toHaveLength(0);
    expect(useObjectsStore.getState().selectedId).toBeNull();
  });
});

describe('corridor branches', () => {
  function makeCorridor(): string {
    const st = useObjectsStore.getState();
    st.setTool('corridor');
    [{ lat: 42, lng: 19 }, { lat: 42, lng: 19.003 }].forEach((p) => st.addDraftPoint(p));
    st.finishDraft();
    return useObjectsStore.getState().selectedId!;
  }

  it('finishBranch attaches a branch to the selected corridor', () => {
    const id = makeCorridor();
    const st = useObjectsStore.getState();
    st.setTool('branch');
    [{ lat: 42, lng: 19.0015 }, { lat: 42.003, lng: 19.0015 }].forEach((p) => st.addDraftPoint(p));
    st.finishBranch();
    const obj = useObjectsStore.getState().objects.find((o) => o.id === id)!;
    expect(obj.branches).toHaveLength(1);
    expect(obj.branches![0]!.length).toBe(2);
    expect(useObjectsStore.getState().tool).toBe('select');
  });

  it('finishBranch is a no-op when the selection is not a corridor', () => {
    const st = useObjectsStore.getState();
    st.addObject(makeRectangle(CENTER, 100, 100, 'R'));
    st.setTool('branch');
    [{ lat: 42, lng: 19 }, { lat: 42.001, lng: 19 }].forEach((p) => st.addDraftPoint(p));
    st.finishBranch();
    const rect = useObjectsStore.getState().objects[0]!;
    expect(rect.branches).toBeUndefined();
  });

  it('clearBranches removes all branches from the corridor', () => {
    const id = makeCorridor();
    const st = useObjectsStore.getState();
    st.setTool('branch');
    [{ lat: 42, lng: 19.0015 }, { lat: 42.003, lng: 19.0015 }].forEach((p) => st.addDraftPoint(p));
    st.finishBranch();
    st.clearBranches(id);
    expect(useObjectsStore.getState().objects.find((o) => o.id === id)!.branches).toBeUndefined();
  });

  function corridorWithBranch(): string {
    const id = makeCorridor();
    const st = useObjectsStore.getState();
    st.setTool('branch');
    [{ lat: 42, lng: 19.0015 }, { lat: 42.003, lng: 19.0015 }, { lat: 42.004, lng: 19.0015 }].forEach((p) => st.addDraftPoint(p));
    st.finishBranch();
    return id;
  }

  it('moveVertex with a branch index edits the branch, not the base', () => {
    const id = corridorWithBranch();
    const before = useObjectsStore.getState().objects.find((o) => o.id === id)!;
    const baseBefore = JSON.stringify(before.base);
    useObjectsStore.getState().moveVertex(2, { lat: 42.01, lng: 19.02 }, 0);
    const after = useObjectsStore.getState().objects.find((o) => o.id === id)!;
    expect(JSON.stringify(after.base)).toBe(baseBefore); // base untouched
    expect(after.branches![0]![2]).not.toEqual(before.branches![0]![2]); // branch moved
  });

  it('deleteVertex on a branch drops below 2 points by removing the whole branch', () => {
    const id = corridorWithBranch();
    const st = useObjectsStore.getState();
    st.deleteVertex(2, 0); // 3 -> 2 points
    expect(useObjectsStore.getState().objects.find((o) => o.id === id)!.branches![0]!.length).toBe(2);
    st.deleteVertex(1, 0); // 2 -> would be 1, so the branch is dropped
    expect(useObjectsStore.getState().objects.find((o) => o.id === id)!.branches).toBeUndefined();
  });
});

/**
 * A power-line network arrives as separate corridor objects (one per spur,
 * from an import or from drawing). Flown that way it is several missions with
 * transit legs between them.
 */
describe('mergeCorridors', () => {
  const corridor = (name: string, pts: Array<[number, number]>): EditorObject =>
    makeFromWorldRing('corridor', pts.map(([lat, lng]) => ({ lat, lng })), name, { corridorWidthM: 60 });

  beforeEach(() => {
    useObjectsStore.setState({ objects: [], selectedId: null, past: [], future: [] });
  });

  it('folds the other corridors in as branches and removes them', () => {
    const trunk = corridor('Trunk', [[53.50, 9.00], [53.50, 9.20]]);
    const spurA = corridor('Spur A', [[53.505, 9.05], [53.51, 9.06]]);
    const spurB = corridor('Spur B', [[53.505, 9.15], [53.51, 9.16]]);
    useObjectsStore.setState({ objects: [trunk, spurA, spurB], selectedId: trunk.id });

    const absorbed = useObjectsStore.getState().mergeCorridors(trunk.id);

    expect(absorbed).toBe(2);
    const objects = useObjectsStore.getState().objects;
    expect(objects).toHaveLength(1);
    expect(objects[0]!.branches).toHaveLength(2);
  });

  it('keeps the branches a spur already carried', () => {
    const trunk = corridor('Trunk', [[53.50, 9.00], [53.50, 9.20]]);
    const spur = corridor('Spur', [[53.505, 9.05], [53.51, 9.06]]);
    spur.branches = [[{ x: 0, y: 0 }, { x: 50, y: 50 }]];
    useObjectsStore.setState({ objects: [trunk, spur], selectedId: trunk.id });

    useObjectsStore.getState().mergeCorridors(trunk.id);

    expect(useObjectsStore.getState().objects[0]!.branches).toHaveLength(2);
  });

  it('attaches each spur by whichever end is nearer the network', () => {
    // Drawn running AWAY from the trunk, so its first point is the far end.
    const trunk = corridor('Trunk', [[53.50, 9.00], [53.50, 9.20]]);
    const spur = corridor('Spur', [[53.60, 9.10], [53.501, 9.10]]);
    useObjectsStore.setState({ objects: [trunk, spur], selectedId: trunk.id });

    useObjectsStore.getState().mergeCorridors(trunk.id);

    const merged = useObjectsStore.getState().objects[0]!;
    const branch = merged.branches![0]!;
    // The attached end sits on the trunk; the free end is the far one.
    expect(Math.abs(branch[0]!.y)).toBeLessThan(Math.abs(branch[branch.length - 1]!.y));
  });

  it('does nothing without another corridor to absorb', () => {
    const trunk = corridor('Trunk', [[53.50, 9.00], [53.50, 9.20]]);
    useObjectsStore.setState({ objects: [trunk], selectedId: trunk.id });
    expect(useObjectsStore.getState().mergeCorridors(trunk.id)).toBe(0);
    expect(useObjectsStore.getState().objects).toHaveLength(1);
  });

  it('leaves areas alone', () => {
    const trunk = corridor('Trunk', [[53.50, 9.00], [53.50, 9.20]]);
    const area = makeFromWorldRing('polygon', [
      { lat: 53.6, lng: 9.0 }, { lat: 53.6, lng: 9.1 }, { lat: 53.61, lng: 9.1 },
    ], 'Field');
    useObjectsStore.setState({ objects: [trunk, area], selectedId: trunk.id });

    useObjectsStore.getState().mergeCorridors(trunk.id);

    const objects = useObjectsStore.getState().objects;
    expect(objects).toHaveLength(2);
    expect(objects.some((o) => o.type === 'polygon')).toBe(true);
  });
});
