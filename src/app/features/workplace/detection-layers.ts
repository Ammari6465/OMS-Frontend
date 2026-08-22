import { DetectedObject, DetectedObjectType, PlanPoint } from './workplace.service';

/**
 * Presentation rules for recognised floor plan regions. Kept apart from the map
 * component so the read-only viewer and the admin editor cannot drift into
 * showing the same object in different colours.
 */
export interface TypeStyle {
  readonly label: string;
  /** Outline colour. Fills reuse it at low opacity so plan detail stays legible. */
  readonly colour: string;
  readonly layer: LayerKey;
}

export type LayerKey = 'desks' | 'rooms' | 'zones' | 'walkways' | 'exits' | 'labels' | 'occupancy';

export const TYPE_STYLES: Readonly<Record<DetectedObjectType, TypeStyle>> = {
  DESK: { label: 'Desk', colour: '#3b82f6', layer: 'desks' },
  CABIN: { label: 'Cabin', colour: '#a855f7', layer: 'rooms' },
  CONFERENCE_ROOM: { label: 'Conference room', colour: '#22c55e', layer: 'rooms' },
  MEETING_ROOM: { label: 'Meeting room', colour: '#14b8a6', layer: 'rooms' },
  RECEPTION: { label: 'Reception', colour: '#06b6d4', layer: 'rooms' },
  PANTRY: { label: 'Pantry', colour: '#f97316', layer: 'rooms' },
  WASHROOM: { label: 'Washroom', colour: '#92400e', layer: 'rooms' },
  SERVER_ROOM: { label: 'Server room', colour: '#6366f1', layer: 'rooms' },
  STORAGE: { label: 'Storage', colour: '#78716c', layer: 'rooms' },
  ZONE: { label: 'Open workspace', colour: '#8b5cf6', layer: 'zones' },
  WALKWAY: { label: 'Walkway', colour: '#94a3b8', layer: 'walkways' },
  DOOR: { label: 'Door', colour: '#0f766e', layer: 'exits' },
  STAIRCASE: { label: 'Staircase', colour: '#475569', layer: 'exits' },
  ELEVATOR: { label: 'Elevator', colour: '#7c3aed', layer: 'exits' },
  EXIT: { label: 'Emergency exit', colour: '#ef4444', layer: 'exits' },
  UNKNOWN: { label: 'Unclassified', colour: '#64748b', layer: 'rooms' },
};

export const LAYERS: ReadonlyArray<{ key: LayerKey; label: string }> = [
  { key: 'desks', label: 'Desks' },
  { key: 'rooms', label: 'Rooms' },
  { key: 'zones', label: 'Zones' },
  { key: 'walkways', label: 'Walkways' },
  { key: 'exits', label: 'Access & exits' },
  { key: 'labels', label: 'Labels' },
  { key: 'occupancy', label: 'Occupancy' },
];

export const styleFor = (type: DetectedObjectType): TypeStyle => TYPE_STYLES[type] ?? TYPE_STYLES.UNKNOWN;

/**
 * Renders a polygon into SVG `points`. The map's viewBox is 0..100 while
 * detections are stored normalised, so everything scales by 100 on the way out.
 */
export const toSvgPoints = (polygon: PlanPoint[]): string =>
  polygon.map((p) => `${(p.x * 100).toFixed(3)},${(p.y * 100).toFixed(3)}`).join(' ');

/** Inverse of {@link toSvgPoints}, for geometry edited in map space. */
export const fromSvgPoints = (points: PlanPoint[]): string =>
  points.map((p) => `${(p.x / 100).toFixed(5)},${(p.y / 100).toFixed(5)}`).join(' ');

/** What to show in the detail panel and as the on-plan label. */
export const displayName = (object: DetectedObject): string =>
  object.name?.trim() || object.code?.trim() || styleFor(object.type).label;
