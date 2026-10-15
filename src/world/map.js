// ---------------------------------------------------------------------------
// Building layout: rooms, connections and camera metadata.
//
//   [BACKSTAGE]--[ MAIN STAGE ]          [KITCHEN]
//        \             |              /     |
//         \-------[  DINING  ]-------/  [SERVICE]
//   [STORAGE]      |         |              |
//        \--[WEST HALL]   [EAST HALL]-------/
//               |               |
//          (LEFT DOOR)-OFFICE-(RIGHT DOOR)
// ---------------------------------------------------------------------------

export const ROOMS = {
  STAGE:     { cam: '01', name: 'Main Stage',       links: ['DINING', 'BACKSTAGE'],          pan: 0,     depth: 0.22 },
  DINING:    { cam: '02', name: 'Dining Room',      links: ['STAGE', 'BACKSTAGE', 'WEST', 'EAST', 'KITCHEN'], pan: 0, depth: 0.35 },
  WEST:      { cam: '03', name: 'West Hall',        links: ['DINING', 'STORAGE', 'LDOOR'],   pan: -0.75, depth: 0.7 },
  EAST:      { cam: '04', name: 'East Hall',        links: ['DINING', 'SERVICE', 'RDOOR'],   pan: 0.75,  depth: 0.7 },
  KITCHEN:   { cam: '05', name: 'Kitchen',          links: ['DINING', 'SERVICE'],            pan: 0.5,   depth: 0.3 },
  STORAGE:   { cam: '06', name: 'Storage Room',     links: ['WEST'],                         pan: -0.65, depth: 0.45 },
  BACKSTAGE: { cam: '07', name: 'Backstage',        links: ['STAGE', 'DINING'],              pan: -0.5,  depth: 0.25 },
  SERVICE:   { cam: '08', name: 'Service Corridor', links: ['KITCHEN', 'EAST'],              pan: 0.65,  depth: 0.5 },
  LDOOR:     { cam: null, name: 'Left Door',        links: ['WEST'],  door: 'left',  pan: -1, depth: 1 },
  RDOOR:     { cam: null, name: 'Right Door',       links: ['EAST'],  door: 'right', pan: 1,  depth: 1 },
};

export const CAMERA_ROOMS = ['STAGE', 'DINING', 'WEST', 'EAST', 'KITCHEN', 'STORAGE', 'BACKSTAGE', 'SERVICE'];

export const DOOR_ROOM = { left: 'LDOOR', right: 'RDOOR' };

/** Layout of the camera map (in px inside a 360x290 box). */
export const MAP_LAYOUT = {
  BACKSTAGE: { x: 8,   y: 10,  w: 78,  h: 52 },
  STAGE:     { x: 100, y: 10,  w: 130, h: 52 },
  KITCHEN:   { x: 262, y: 10,  w: 90,  h: 62 },
  STORAGE:   { x: 8,   y: 82,  w: 66,  h: 56 },
  DINING:    { x: 96,  y: 76,  w: 152, h: 90 },
  SERVICE:   { x: 274, y: 88,  w: 78,  h: 60 },
  WEST:      { x: 34,  y: 150, w: 44,  h: 104 },
  EAST:      { x: 284, y: 162, w: 44,  h: 92 },
  OFFICE:    { x: 132, y: 226, w: 96,  h: 52 },
};

/**
 * Breadth-first distance between rooms, optionally restricted to an allowed set.
 * Returns Infinity when unreachable.
 */
export function roomDistance(from, to, allowed = null) {
  if (from === to) return 0;
  const seen = new Set([from]);
  let frontier = [from];
  let d = 0;
  while (frontier.length) {
    d++;
    const next = [];
    for (const r of frontier) {
      for (const n of ROOMS[r].links) {
        if (seen.has(n) || (allowed && !allowed.has(n))) continue;
        if (n === to) return d;
        seen.add(n);
        next.push(n);
      }
    }
    frontier = next;
  }
  return Infinity;
}
