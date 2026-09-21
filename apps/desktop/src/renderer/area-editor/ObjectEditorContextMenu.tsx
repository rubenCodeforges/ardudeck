/**
 * ObjectEditorContextMenu — right-click menu for the Area Editor.
 *
 * The interaction layer (attachObjectInteractions) decides what was clicked and
 * stores it as `contextMenu` on the objects-store; this component renders the
 * menu at those viewport coordinates with actions scoped to the target kind
 * (object / ruler / empty map). Undo/redo are always available.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useObjectsStore } from './objects-store';

const MENU_WIDTH = 216;

interface ItemProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  hint?: string;
}

function Item({ label, onClick, disabled = false, danger = false, hint }: ItemProps): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        'w-full flex items-center justify-between gap-4 px-3 py-1.5 text-left text-xs rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ' +
        (danger
          ? 'text-rose-400 hover:bg-rose-500/15'
          : 'text-content-secondary hover:bg-surface-raised hover:text-content')
      }
    >
      <span>{label}</span>
      {hint && <span className="text-[10px] text-content-tertiary tabular-nums">{hint}</span>}
    </button>
  );
}

function Divider(): JSX.Element {
  return <div className="my-1 h-px bg-subtle" />;
}

export function ObjectEditorContextMenu(): JSX.Element | null {
  const menu = useObjectsStore((s) => s.contextMenu);
  const objects = useObjectsStore((s) => s.objects);
  const canUndo = useObjectsStore((s) => s.past.length > 0);
  const canRedo = useObjectsStore((s) => s.future.length > 0);
  const measureCount = useObjectsStore((s) => s.measurePoints.length);
  const hasMeasure = measureCount > 0;

  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Clamp the menu inside the viewport once its real size is known.
  useLayoutEffect(() => {
    if (!menu) { setPos(null); return; }
    const h = ref.current?.offsetHeight ?? 240;
    const left = Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8);
    const top = Math.min(menu.y, window.innerHeight - h - 8);
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') useObjectsStore.getState().closeContextMenu(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  if (!menu) return null;

  const {
    closeContextMenu, setTool, selectObject, deleteObject, duplicateObject, reorderObject,
    convertSelectedToPolygon, setObjectRole, mergeOverlapping, clearBranches, mergeCorridors, clearMeasure, editMeasurement,
    insertMeasurePointAt, deleteMeasurePoint, undo, redo,
  } = useObjectsStore.getState();

  const run = (fn: () => void) => () => { fn(); closeContextMenu(); };

  const target = menu.target;
  const obj = target.kind === 'object' ? objects.find((o) => o.id === target.id) ?? null : null;
  const isCorridor = obj?.type === 'corridor';
  const isParametric = obj?.type === 'rectangle' || obj?.type === 'circle';
  const otherCorridors = obj
    ? objects.filter((o) => o.id !== obj.id && o.type === 'corridor' && o.visible && o.base.length >= 2).length
    : 0;

  let body: ReactNode = null;
  if (obj) {
    body = (
      <>
        <Item label={isParametric ? 'Convert to editable polygon' : 'Edit points'}
          onClick={run(() => { if (isParametric) convertSelectedToPolygon(); else setTool('edit'); })} />
        {isParametric && <Item label="Edit points" onClick={run(() => { convertSelectedToPolygon(); setTool('edit'); })} />}
        <Item label="Duplicate" onClick={run(() => duplicateObject(obj.id))} />
        <Divider />
        <Item label="Bring forward" onClick={run(() => reorderObject(obj.id, 1))} />
        <Item label="Send backward" onClick={run(() => reorderObject(obj.id, -1))} />
        {!isCorridor && (
          <>
            <Divider />
            <Item label="Cut hole" onClick={run(() => setTool('hole'))} />
            <Item label="Split with line" onClick={run(() => setTool('split'))} />
            {!obj.fenceType && !obj.role && (
              <Item label="Merge overlapping" hint="union" onClick={run(() => mergeOverlapping(obj.id))} />
            )}
            <Item
              label={obj.role === 'workspace' ? 'Clear workspace role' : 'Mark as workspace'}
              onClick={run(() => setObjectRole(obj.id, obj.role === 'workspace' ? null : 'workspace'))}
            />
            <Item
              label={obj.role === 'guide' ? 'Clear guide role' : 'Mark as guide'}
              hint={obj.role === 'guide' ? undefined : 'no waypoints'}
              onClick={run(() => setObjectRole(obj.id, obj.role === 'guide' ? null : 'guide'))}
            />
          </>
        )}
        {isCorridor && (
          <>
            <Divider />
            <Item label="Add branch" onClick={run(() => { selectObject(obj.id); setTool('branch'); })} />
            {otherCorridors > 0 && (
              <Item
                label="Absorb other corridors"
                hint={`${otherCorridors} into one route`}
                onClick={run(() => mergeCorridors(obj.id))}
              />
            )}
            {(obj.branches?.length ?? 0) > 0 && (
              <Item label="Clear branches" hint={String(obj.branches!.length)} onClick={run(() => clearBranches(obj.id))} />
            )}
          </>
        )}
        <Divider />
        <Item label="Delete" danger onClick={run(() => deleteObject(obj.id))} />
      </>
    );
  } else if (target.kind === 'measure') {
    const { world, pointIndex } = target;
    body = (
      <>
        <Item label="Add point here" onClick={run(() => insertMeasurePointAt(world))} />
        {pointIndex !== undefined && (
          <Item label="Delete this point" disabled={measureCount <= 2} onClick={run(() => deleteMeasurePoint(pointIndex))} />
        )}
        <Item label="Continue measuring" hint="append" onClick={run(editMeasurement)} />
        <Divider />
        <Item label="Clear measurement" danger onClick={run(clearMeasure)} />
      </>
    );
  } else if (hasMeasure) {
    body = <Item label="Clear measurement" danger onClick={run(clearMeasure)} />;
  }

  return (
    <>
      {/* click-away */}
      <div className="fixed inset-0 z-[2000]" onClick={() => closeContextMenu()} onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }} />
      <div
        ref={ref}
        className="fixed z-[2001] py-1 rounded-lg bg-surface-solid border border-subtle shadow-xl select-none"
        style={{ left: pos?.left ?? menu.x, top: pos?.top ?? menu.y, width: MENU_WIDTH, visibility: pos ? 'visible' : 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {body}
        {body && <Divider />}
        <Item label="Undo" disabled={!canUndo} hint="Ctrl+Z" onClick={run(undo)} />
        <Item label="Redo" disabled={!canRedo} hint="Ctrl+Shift+Z" onClick={run(redo)} />
      </div>
    </>
  );
}
