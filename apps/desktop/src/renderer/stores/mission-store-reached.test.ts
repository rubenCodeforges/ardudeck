// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useMissionStore } from './mission-store';
import { useConnectionStore } from './connection-store';

const store = () => useMissionStore.getState();

function connectAs(firmware: 'ardupilot' | 'px4') {
  useConnectionStore.setState((s) => ({
    connectionState: { ...s.connectionState, isConnected: true, protocol: 'mavlink', firmware },
  }));
}

beforeEach(() => {
  store().reset();
});

describe('FC seq alignment', () => {
  it('subtracts ArduPilot HOME even when the stored offset is stale (restored or uploaded list)', () => {
    connectAs('ardupilot');
    useMissionStore.setState({ fcSeqOffset: 0 });
    store().setCurrentSeq(5);
    expect(store().currentSeq).toBe(4);
    store().setReachedSeq(0); // HOME slot, not a waypoint
    expect(store().reachedSeq).toBeNull();
    store().setReachedSeq(4);
    expect(store().reachedSeq).toBe(3);
  });

  it('uses raw seqs on PX4, which has no HOME slot', () => {
    connectAs('px4');
    store().setCurrentSeq(5);
    expect(store().currentSeq).toBe(5);
  });
});

describe('reachedSeq', () => {
  beforeEach(() => connectAs('px4'));

  it('tracks the highest waypoint reached', () => {
    store().setReachedSeq(2);
    store().setReachedSeq(1);
    expect(store().reachedSeq).toBe(2);
  });

  it('keeps a reached waypoint when a stale MISSION_CURRENT still names it', () => {
    store().setReachedSeq(3);
    store().setCurrentSeq(3);
    expect(store().reachedSeq).toBe(3);
    store().setCurrentSeq(4);
    expect(store().reachedSeq).toBe(3);
  });

  it('forgets reached waypoints when the mission restarts behind them', () => {
    store().setReachedSeq(5);
    store().setCurrentSeq(1);
    expect(store().reachedSeq).toBe(0);
    store().setReachedSeq(4);
    store().setCurrentSeq(0);
    expect(store().reachedSeq).toBeNull();
  });

  it('clears on reset', () => {
    store().setReachedSeq(2);
    store().reset();
    expect(store().reachedSeq).toBeNull();
  });
});
