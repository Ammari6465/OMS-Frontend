import { describe, it, expect } from 'vitest';

import { LAYERS, TYPE_STYLES, displayName, fromSvgPoints, styleFor, toSvgPoints } from './detection-layers';
import { DetectedObject, DetectedObjectType } from './workplace.service';

const object = (over: Partial<DetectedObject> = {}): DetectedObject => ({
  id: 1, floorId: 7, type: 'DESK', polygon: [], bbox: { x: 0, y: 0, width: 0, height: 0 },
  center: { x: 0, y: 0 }, rotation: 0, area: 0, confidence: 1, source: 'AUTO', version: 0, ...over,
});

describe('detection layer presentation', () => {
  it('[POSITIVE] gives every object type a style on a known layer', () => {
    const layerKeys = LAYERS.map((l) => l.key);
    for (const [type, style] of Object.entries(TYPE_STYLES)) {
      expect(style.colour, `${type} needs a colour`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(layerKeys, `${type} points at a real layer`).toContain(style.layer);
    }
  });

  it('[POSITIVE] uses the colours the brief specified', () => {
    expect(styleFor('DESK').colour).toBe('#3b82f6');
    expect(styleFor('CONFERENCE_ROOM').colour).toBe('#22c55e');
    expect(styleFor('CABIN').colour).toBe('#a855f7');
    expect(styleFor('PANTRY').colour).toBe('#f97316');
    expect(styleFor('EXIT').colour).toBe('#ef4444');
    expect(styleFor('WALKWAY').colour).toBe('#94a3b8');
  });

  it('[NEGATIVE] falls back to the unclassified style for an unknown type', () => {
    expect(styleFor('SOMETHING_NEW' as DetectedObjectType)).toBe(TYPE_STYLES.UNKNOWN);
  });

  it('[POSITIVE] scales normalised geometry into the map viewBox and back', () => {
    const polygon = [{ x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }, { x: 0.75, y: 0.8 }];

    expect(toSvgPoints(polygon)).toBe('25.000,50.000 75.000,50.000 75.000,80.000');
    expect(fromSvgPoints([{ x: 25, y: 50 }])).toBe('0.25000,0.50000');
  });

  it('[POSITIVE] labels an object by name, then code, then type', () => {
    expect(displayName(object({ name: 'Conference Room A', code: 'C1' }))).toBe('Conference Room A');
    expect(displayName(object({ code: 'A01' }))).toBe('A01');
    expect(displayName(object({ type: 'PANTRY' }))).toBe('Pantry');
    expect(displayName(object({ name: '   ', code: 'A02' }))).toBe('A02');
  });
});
