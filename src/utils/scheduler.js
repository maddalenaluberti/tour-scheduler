import { ALL_GUIDES, REGULAR_GUIDES, TOUR_TYPES, INFOPOINT_SHIFTS } from '../data/guides.js';

// ---- Time utilities ----

export function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

export function tourEnd(tour) {
  return timeToMinutes(tour.time) + TOUR_TYPES[tour.type].duration;
}

export function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ---- Constraint checkers ----

function isUnavailable(guideId, dayIndex, availability) {
  return !!(availability[guideId] && availability[guideId][dayIndex]);
}

function isBusyAtTime(guideId, dayIndex, startMin, endMin, tours, infopoint, excludeTourId = null, excludeShiftId = null) {
  const busyTour = tours.some(t => {
    if (t.guideId !== guideId || t.day !== dayIndex || t.id === excludeTourId) return false;
    const tStart = timeToMinutes(t.time);
    const tEnd = tStart + TOUR_TYPES[t.type].duration;
    return startMin < tEnd && tStart < endMin;
  });
  if (busyTour) return true;

  const busyShift = infopoint.some(s => {
    if (s.guideId !== guideId || s.day !== dayIndex || s.id === excludeShiftId) return false;
    const shift = INFOPOINT_SHIFTS.find(x => x.id === s.shiftId);
    return startMin < shift.end && shift.start < endMin;
  });
  return busyShift;
}

export function canAssignTour(guide, tour, tours, infopoint, availability, excludeTourId = null) {
  if (isUnavailable(guide.id, tour.day, availability)) return { ok: false, reason: 'unavailable' };

  const type = TOUR_TYPES[tour.type];
  if (type.langRequired && !guide.langs.includes(tour.lang)) return { ok: false, reason: 'language' };

  const tStart = timeToMinutes(tour.time);
  const tEnd = tStart + type.duration;

  if (isBusyAtTime(guide.id, tour.day, tStart, tEnd, tours, infopoint, excludeTourId)) {
    return { ok: false, reason: 'overlap' };
  }

  // No multiple MuNe or MuNe+HQ per day for the same guide
  if (tour.type !== 'self-guided') {
    const existingHeavy = tours.filter(t =>
      t.guideId === guide.id &&
      t.day === tour.day &&
      t.type !== 'self-guided' &&
      t.id !== excludeTourId
    );
    if (existingHeavy.length > 0) return { ok: false, reason: 'max-tours-day' };
  }

  return { ok: true };
}

export function canAssignShift(guide, shift, tours, infopoint, availability, excludeShiftId = null) {
  if (guide.backup) return { ok: false, reason: 'backup-guide' };
  if (isUnavailable(guide.id, shift.day, availability)) return { ok: false, reason: 'unavailable' };

  const shiftDef = INFOPOINT_SHIFTS.find(s => s.id === shift.shiftId);
  if (isBusyAtTime(guide.id, shift.day, shiftDef.start, shiftDef.end, tours, infopoint, null, excludeShiftId)) {
    return { ok: false, reason: 'overlap' };
  }

  // No closing then opening rule
  if (shiftDef.opener) {
    const prevDay = shift.day - 1;
    if (prevDay >= 0) {
      const hadCloser = infopoint.some(s => {
        if (s.guideId !== guide.id || s.day !== prevDay || s.id === excludeShiftId) return false;
        const sd = INFOPOINT_SHIFTS.find(x => x.id === s.shiftId);
        return sd.closer;
      });
      if (hadCloser) return { ok: false, reason: 'no-close-open' };
    }
  }

  if (shiftDef.closer) {
    const nextDay = shift.day + 1;
    if (nextDay <= 6) {
      const hasOpener = infopoint.some(s => {
        if (s.guideId !== guide.id || s.day !== nextDay || s.id === excludeShiftId) return false;
        const sd = INFOPOINT_SHIFTS.find(x => x.id === s.shiftId);
        return sd.opener;
      });
      if (hasOpener) return { ok: false, reason: 'no-close-open' };
    }
  }

  // No more than 2 shifts per day
  const shiftsToday = infopoint.filter(s =>
    s.guideId === guide.id && s.day === shift.day && s.id !== excludeShiftId
  ).length;
  if (shiftsToday >= 2) return { ok: false, reason: 'too-many-shifts-day' };

  // No having both opener and closer on same day
  const hasOpener = infopoint.some(s => {
    if (s.guideId !== guide.id || s.day !== shift.day || s.id === excludeShiftId) return false;
    const sd = INFOPOINT_SHIFTS.find(x => x.id === s.shiftId);
    return sd.opener;
  });
  const hasCloser = infopoint.some(s => {
    if (s.guideId !== guide.id || s.day !== shift.day || s.id === excludeShiftId) return false;
    const sd = INFOPOINT_SHIFTS.find(x => x.id === s.shiftId);
    return sd.closer;
  });
  if (shiftDef.opener && hasCloser) return { ok: false, reason: 'uneven-distribution' };
  if (shiftDef.closer && hasOpener) return { ok: false, reason: 'uneven-distribution' };

  return { ok: true };
}

// ---- Fairness scoring ----

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function guideTotalScore(guideId, type, cumulative, tours, infopoint) {
  const cum = cumulative[guideId] || {};
  if (type === 'infopoint') {
    return (cum.infopoint || 0) + infopoint.filter(s => s.guideId === guideId).length;
  }
  return (cum.tours || 0) + tours.filter(t => t.guideId === guideId).length;
}

// ---- Auto-assign algorithms ----

export function autoAssignTours(tours, infopoint, availability, cumulative) {
  const unassigned = tours.filter(t => !t.guideId);
  if (unassigned.length === 0) return { tours, assigned: 0, failed: 0, message: 'already-assigned' };

  const newTours = tours.map(t => ({ ...t }));
  const sorted = [...unassigned].sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return timeToMinutes(a.time) - timeToMinutes(b.time);
  });

  let assigned = 0;
  let failed = 0;

  for (const tourRef of sorted) {
    const tour = newTours.find(t => t.id === tourRef.id);
    const candidates = shuffle(ALL_GUIDES).sort((a, b) =>
      guideTotalScore(a.id, 'tours', cumulative, newTours, infopoint) -
      guideTotalScore(b.id, 'tours', cumulative, newTours, infopoint)
    );

    let picked = null;
    for (const guide of candidates) {
      const check = canAssignTour(guide, tour, newTours, infopoint, availability);
      if (check.ok) { picked = guide; break; }
    }

    if (picked) {
      tour.guideId = picked.id;
      assigned++;
    } else {
      failed++;
    }
  }

  return { tours: newTours, assigned, failed };
}

export function autoAssignInfopoint(tours, infopoint, availability, cumulative, weekOffset) {
  // Ensure all shifts exist
  const newInfopoint = [...infopoint];
  for (let day = 0; day < 7; day++) {
    for (const shift of INFOPOINT_SHIFTS) {
      const exists = newInfopoint.some(s =>
        s.day === day && s.shiftId === shift.id && s.weekOffset === weekOffset
      );
      if (!exists) {
        newInfopoint.push({ id: genId(), day, shiftId: shift.id, guideId: null, weekOffset });
      }
    }
  }

  const unassigned = newInfopoint.filter(s => !s.guideId && s.weekOffset === weekOffset);
  if (unassigned.length === 0) return { infopoint: newInfopoint, assigned: 0, failed: 0, message: 'already-assigned' };

  const shiftOrder = { s0: 0, s1: 1, s2: 2, s3: 3 };
  const sorted = [...unassigned].sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return shiftOrder[a.shiftId] - shiftOrder[b.shiftId];
  });

  let assigned = 0;
  let failed = 0;

  for (const shiftRef of sorted) {
    const shift = newInfopoint.find(s => s.id === shiftRef.id);
    const candidates = shuffle(REGULAR_GUIDES).sort((a, b) =>
      guideTotalScore(a.id, 'infopoint', cumulative, tours, newInfopoint) -
      guideTotalScore(b.id, 'infopoint', cumulative, tours, newInfopoint)
    );

    let picked = null;
    for (const guide of candidates) {
      const check = canAssignShift(guide, shift, tours, newInfopoint, availability);
      if (check.ok) { picked = guide; break; }
    }

    if (picked) {
      shift.guideId = picked.id;
      assigned++;
    } else {
      failed++;
    }
  }

  return { infopoint: newInfopoint, assigned, failed };
}

export function ensureInfopointShifts(infopoint, weekOffset) {
  const newInfopoint = [...infopoint];
  for (let day = 0; day < 7; day++) {
    for (const shift of INFOPOINT_SHIFTS) {
      const exists = newInfopoint.some(s =>
        s.day === day && s.shiftId === shift.id && s.weekOffset === weekOffset
      );
      if (!exists) {
        newInfopoint.push({ id: genId(), day, shiftId: shift.id, guideId: null, weekOffset });
      }
    }
  }
  return newInfopoint;
}

export function computeCurrentWeekStats(tours, infopoint) {
  const stats = {};
  ALL_GUIDES.forEach(g => {
    stats[g.id] = { tours: 0, selfGuided: 0, mune: 0, muneHq: 0, infopoint: 0, daysWorked: 0 };
  });

  tours.forEach(t => {
    if (!t.guideId || !stats[t.guideId]) return;
    const s = stats[t.guideId];
    s.tours++;
    if (t.type === 'self-guided') s.selfGuided++;
    else if (t.type === 'mune') s.mune++;
    else if (t.type === 'mune-hq') s.muneHq++;
  });

  infopoint.forEach(s => {
    if (!s.guideId || !stats[s.guideId]) return;
    stats[s.guideId].infopoint++;
  });

  ALL_GUIDES.forEach(g => {
    const days = new Set();
    tours.forEach(t => { if (t.guideId === g.id) days.add(t.day); });
    infopoint.forEach(s => { if (s.guideId === g.id) days.add(s.day); });
    stats[g.id].daysWorked = days.size;
  });

  return stats;
}
