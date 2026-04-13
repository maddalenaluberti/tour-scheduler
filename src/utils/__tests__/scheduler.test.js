import { describe, it, expect } from 'vitest';
import {
  canAssignTour,
  canAssignShift,
  autoAssignTours,
  autoAssignInfopoint,
  timeToMinutes,
  minutesToTime,
  genId,
} from '../scheduler.js';
import { ALL_GUIDES, REGULAR_GUIDES, BACKUP_GUIDES } from '../../data/guides.js';

// ---- Helpers ----

function makeTour(overrides = {}) {
  return {
    id: genId(),
    day: 0,
    time: '10:00',
    type: 'self-guided',
    lang: null,
    guideId: null,
    weekOffset: 0,
    ...overrides,
  };
}

function makeShift(overrides = {}) {
  return {
    id: genId(),
    day: 0,
    shiftId: 's1', // 11:00–13:00
    guideId: null,
    weekOffset: 0,
    ...overrides,
  };
}

function makeAvailability(unavailMap = {}) {
  // unavailMap: { guideId: [dayIndex, ...] }
  const a = {};
  ALL_GUIDES.forEach(g => { a[g.id] = {}; });
  for (const [gid, days] of Object.entries(unavailMap)) {
    days.forEach(d => { a[gid][d] = true; });
  }
  return a;
}

function makeCumulative(overrides = {}) {
  const c = {};
  ALL_GUIDES.forEach(g => {
    c[g.id] = { tours: 0, selfGuided: 0, mune: 0, muneHq: 0, infopoint: 0, daysWorked: 0, weeksWorked: 0, ...overrides[g.id] };
  });
  return c;
}

// ---- canAssignTour tests ----

describe('canAssignTour – language constraint', () => {
  it('blocks guide without required language for MuNe tour', () => {
    // Maddalena speaks EN and IT, not ES
    const guide = ALL_GUIDES.find(g => g.id === 'maddalena');
    const tour = makeTour({ type: 'mune', lang: 'ES' });
    const result = canAssignTour(guide, tour, [], [], makeAvailability());
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('language');
  });

  it('allows guide with the required language', () => {
    // Camila speaks ES
    const guide = ALL_GUIDES.find(g => g.id === 'camila');
    const tour = makeTour({ type: 'mune', lang: 'ES' });
    const result = canAssignTour(guide, tour, [], [], makeAvailability());
    expect(result.ok).toBe(true);
  });

  it('blocks ZH tour for guide without ZH', () => {
    const guide = ALL_GUIDES.find(g => g.id === 'alice');
    const tour = makeTour({ type: 'mune', lang: 'ZH' });
    const result = canAssignTour(guide, tour, [], [], makeAvailability());
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('language');
  });

  it('allows ZH tour for Yayun (backup with ZH)', () => {
    const guide = ALL_GUIDES.find(g => g.id === 'yayun');
    const tour = makeTour({ type: 'mune', lang: 'ZH' });
    const result = canAssignTour(guide, tour, [], [], makeAvailability());
    expect(result.ok).toBe(true);
  });

  it('self-guided tour ignores language constraint', () => {
    const guide = ALL_GUIDES.find(g => g.id === 'alice');
    const tour = makeTour({ type: 'self-guided', lang: null });
    const result = canAssignTour(guide, tour, [], [], makeAvailability());
    expect(result.ok).toBe(true);
  });
});

describe('canAssignTour – availability', () => {
  it('blocks unavailable guide', () => {
    const guide = ALL_GUIDES.find(g => g.id === 'alice');
    const tour = makeTour({ day: 2 });
    const avail = makeAvailability({ alice: [2] });
    const result = canAssignTour(guide, tour, [], [], avail);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unavailable');
  });

  it('allows guide available on a different day', () => {
    const guide = ALL_GUIDES.find(g => g.id === 'alice');
    const tour = makeTour({ day: 3 });
    const avail = makeAvailability({ alice: [2] }); // only Wed blocked
    const result = canAssignTour(guide, tour, [], [], avail);
    expect(result.ok).toBe(true);
  });
});

describe('canAssignTour – overlap', () => {
  it('blocks guide already assigned overlapping tour', () => {
    const guide = ALL_GUIDES.find(g => g.id === 'alice');
    // Existing tour 10:00 self-guided (30 min → ends 10:30)
    const existing = makeTour({ day: 0, time: '10:00', type: 'self-guided', guideId: 'alice' });
    // New tour at 10:15 would overlap
    const newTour = makeTour({ day: 0, time: '10:15', type: 'self-guided' });
    const result = canAssignTour(guide, newTour, [existing], [], makeAvailability());
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('overlap');
  });

  it('allows guide assigned non-overlapping tour', () => {
    const guide = ALL_GUIDES.find(g => g.id === 'alice');
    const existing = makeTour({ day: 0, time: '10:00', type: 'self-guided', guideId: 'alice' });
    // 10:30 = exactly after the 30-min self-guided
    const newTour = makeTour({ day: 0, time: '10:30', type: 'self-guided' });
    const result = canAssignTour(guide, newTour, [existing], [], makeAvailability());
    expect(result.ok).toBe(true);
  });

  it('blocks when tour overlaps infopoint shift', () => {
    const guide = ALL_GUIDES.find(g => g.id === 'alice');
    // Shift s1: 11:00–13:00
    const shift = makeShift({ day: 0, shiftId: 's1', guideId: 'alice' });
    // Tour at 12:00 MuNe (90 min → 13:30): overlaps with 11:00–13:00 shift
    const tour = makeTour({ day: 0, time: '12:00', type: 'mune', lang: 'EN' });
    const result = canAssignTour(guide, tour, [], [shift], makeAvailability());
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('overlap');
  });
});

describe('canAssignTour – max MuNe per day', () => {
  it('blocks second MuNe tour on same day for same guide', () => {
    const guide = ALL_GUIDES.find(g => g.id === 'alice');
    const existing = makeTour({ day: 0, time: '09:00', type: 'mune', lang: 'EN', guideId: 'alice' });
    const newTour = makeTour({ day: 0, time: '14:00', type: 'mune', lang: 'EN' });
    const result = canAssignTour(guide, newTour, [existing], [], makeAvailability());
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('max-tours-day');
  });

  it('blocks MuNe+HQ if guide already has MuNe that day', () => {
    const guide = ALL_GUIDES.find(g => g.id === 'alice');
    const existing = makeTour({ day: 0, time: '09:00', type: 'mune', lang: 'EN', guideId: 'alice' });
    const newTour = makeTour({ day: 0, time: '14:00', type: 'mune-hq', lang: 'EN' });
    const result = canAssignTour(guide, newTour, [existing], [], makeAvailability());
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('max-tours-day');
  });

  it('allows self-guided after MuNe for same guide (different day)', () => {
    const guide = ALL_GUIDES.find(g => g.id === 'alice');
    const existing = makeTour({ day: 0, time: '09:00', type: 'mune', lang: 'EN', guideId: 'alice' });
    // Different day, so no same-day MuNe restriction
    const newTour = makeTour({ day: 1, time: '10:00', type: 'self-guided' });
    const result = canAssignTour(guide, newTour, [existing], [], makeAvailability());
    expect(result.ok).toBe(true);
  });

  it('allows self-guided + self-guided same day same guide', () => {
    const guide = ALL_GUIDES.find(g => g.id === 'alice');
    const existing = makeTour({ day: 0, time: '09:00', type: 'self-guided', guideId: 'alice' });
    const newTour = makeTour({ day: 0, time: '10:00', type: 'self-guided' });
    const result = canAssignTour(guide, newTour, [existing], [], makeAvailability());
    expect(result.ok).toBe(true);
  });
});

// ---- canAssignShift tests ----

describe('canAssignShift – backup guide exclusion', () => {
  it('blocks backup guides from infopoint shifts', () => {
    for (const guide of BACKUP_GUIDES) {
      const shift = makeShift();
      const result = canAssignShift(guide, shift, [], [], makeAvailability());
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('backup-guide');
    }
  });

  it('allows regular guides for infopoint shifts', () => {
    const guide = REGULAR_GUIDES[0];
    const shift = makeShift({ shiftId: 's1' }); // 11:00–13:00
    const result = canAssignShift(guide, shift, [], [], makeAvailability());
    expect(result.ok).toBe(true);
  });
});

describe('canAssignShift – no closing then opening', () => {
  it('blocks opener on day N if guide closed on day N-1', () => {
    const guide = REGULAR_GUIDES[0];
    // Guide closed day 1 (Tuesday)
    const closerShift = makeShift({ day: 1, shiftId: 's3', guideId: guide.id }); // 15:30–17 closer
    // Try to assign opener on day 2 (Wednesday)
    const openerShift = makeShift({ day: 2, shiftId: 's0' }); // 9:00–11:00 opener

    const result = canAssignShift(guide, openerShift, [], [closerShift], makeAvailability());
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no-close-open');
  });

  it('blocks closer on day N if guide opens on day N+1', () => {
    const guide = REGULAR_GUIDES[0];
    // Guide has opener assigned for next day
    const openerShift = makeShift({ day: 3, shiftId: 's0', guideId: guide.id });
    // Try to assign closer on day 2
    const closerShift = makeShift({ day: 2, shiftId: 's3' });

    const result = canAssignShift(guide, closerShift, [], [openerShift], makeAvailability());
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no-close-open');
  });

  it('allows opener when guide closed two days ago', () => {
    const guide = REGULAR_GUIDES[0];
    const closerShift = makeShift({ day: 0, shiftId: 's3', guideId: guide.id });
    const openerShift = makeShift({ day: 2, shiftId: 's0' });
    const result = canAssignShift(guide, openerShift, [], [closerShift], makeAvailability());
    expect(result.ok).toBe(true);
  });
});

describe('canAssignShift – overlap with tour', () => {
  it('blocks shift when guide has an overlapping tour', () => {
    const guide = REGULAR_GUIDES[0];
    // MuNe tour 11:00–12:30 overlaps with s1 shift 11:00–13:00
    const tour = makeTour({ day: 0, time: '11:00', type: 'mune', lang: 'EN', guideId: guide.id });
    const shift = makeShift({ day: 0, shiftId: 's1' });
    const result = canAssignShift(guide, shift, [tour], [], makeAvailability());
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('overlap');
  });
});

// ---- autoAssignTours tests ----

describe('autoAssignTours', () => {
  it('returns already-assigned when no unassigned tours', () => {
    const guide = ALL_GUIDES[0];
    const tours = [makeTour({ guideId: guide.id })];
    const result = autoAssignTours(tours, [], makeAvailability(), makeCumulative());
    expect(result.message).toBe('already-assigned');
  });

  it('handles empty tours list without crashing', () => {
    const result = autoAssignTours([], [], makeAvailability(), makeCumulative());
    expect(result.message).toBe('already-assigned');
    expect(result.tours).toEqual([]);
  });

  it('assigns self-guided tour when guides available', () => {
    const tours = [makeTour({ type: 'self-guided', lang: null })];
    const result = autoAssignTours(tours, [], makeAvailability(), makeCumulative());
    expect(result.assigned).toBeGreaterThan(0);
    expect(result.tours[0].guideId).toBeTruthy();
  });

  it('all guides unavailable → tour stays unassigned, no crash', () => {
    const unavailMap = {};
    ALL_GUIDES.forEach(g => { unavailMap[g.id] = [0]; }); // all unavailable Mon
    const tours = [makeTour({ day: 0, type: 'self-guided', lang: null })];
    const result = autoAssignTours(tours, [], makeAvailability(unavailMap), makeCumulative());
    expect(result.failed).toBe(1);
    expect(result.assigned).toBe(0);
    expect(result.tours[0].guideId).toBeNull();
  });

  it('guide with fewer cumulative tours is preferred (fairness)', () => {
    // Give all guides many tours except one
    const favored = ALL_GUIDES[0];
    const cumOverrides = {};
    ALL_GUIDES.forEach(g => {
      cumOverrides[g.id] = { tours: g.id === favored.id ? 0 : 100 };
    });
    const cum = makeCumulative(cumOverrides);
    const tours = [makeTour({ type: 'self-guided', lang: null })];
    const result = autoAssignTours(tours, [], makeAvailability(), cum);
    expect(result.tours[0].guideId).toBe(favored.id);
  });

  it('only one guide available → gets all tours', () => {
    const theOne = ALL_GUIDES.find(g => g.id === 'yayun'); // backup, has EN
    const unavailMap = {};
    ALL_GUIDES.forEach(g => {
      if (g.id !== theOne.id) {
        unavailMap[g.id] = [0, 1, 2, 3, 4, 5, 6];
      }
    });
    const tours = [
      makeTour({ day: 0, time: '09:00', type: 'self-guided', lang: null }),
      makeTour({ day: 0, time: '10:00', type: 'self-guided', lang: null }),
    ];
    const result = autoAssignTours(tours, [], makeAvailability(unavailMap), makeCumulative());
    expect(result.assigned).toBe(2);
    result.tours.forEach(t => expect(t.guideId).toBe(theOne.id));
  });

  it('does not assign MuNe tour to guide without required language', () => {
    // All ZH-capable guides made unavailable except yayun
    // Others have no ZH
    const unavailMap = {};
    ALL_GUIDES.forEach(g => {
      if (!g.langs.includes('ZH')) {
        unavailMap[g.id] = [0, 1, 2, 3, 4, 5, 6];
      }
    });
    const tours = [makeTour({ type: 'mune', lang: 'ZH' })];
    const result = autoAssignTours(tours, [], makeAvailability(unavailMap), makeCumulative());
    // Only yayun has ZH — should be assigned to yayun
    expect(result.assigned).toBe(1);
    const assigned = result.tours.find(t => t.guideId !== null);
    const guide = ALL_GUIDES.find(g => g.id === assigned.guideId);
    expect(guide.langs).toContain('ZH');
  });

  it('self-guided can repeat for same guide (no daily MuNe cap)', () => {
    // Assign 3 self-guided tours on same day to single available guide
    const theOne = ALL_GUIDES.find(g => g.id === 'alice');
    const unavailMap = {};
    ALL_GUIDES.forEach(g => {
      if (g.id !== theOne.id) unavailMap[g.id] = [0, 1, 2, 3, 4, 5, 6];
    });
    const tours = [
      makeTour({ day: 0, time: '09:00', type: 'self-guided', lang: null }),
      makeTour({ day: 0, time: '10:00', type: 'self-guided', lang: null }),
      makeTour({ day: 0, time: '11:00', type: 'self-guided', lang: null }),
    ];
    const result = autoAssignTours(tours, [], makeAvailability(unavailMap), makeCumulative());
    expect(result.assigned).toBe(3);
    result.tours.forEach(t => expect(t.guideId).toBe(theOne.id));
  });

  it('no multiple MuNe/MuNe+HQ per guide per day', () => {
    const theOne = ALL_GUIDES.find(g => g.id === 'alice'); // EN+IT
    const unavailMap = {};
    ALL_GUIDES.forEach(g => {
      if (g.id !== theOne.id) unavailMap[g.id] = [0, 1, 2, 3, 4, 5, 6];
    });
    // Two MuNe tours on same day — only one should be assigned
    const tours = [
      makeTour({ day: 0, time: '09:00', type: 'mune', lang: 'EN' }),
      makeTour({ day: 0, time: '14:00', type: 'mune', lang: 'EN' }),
    ];
    const result = autoAssignTours(tours, [], makeAvailability(unavailMap), makeCumulative());
    const assignedCount = result.tours.filter(t => t.guideId !== null).length;
    // Only one can be assigned (the other fails)
    expect(assignedCount).toBe(1);
    expect(result.failed).toBe(1);
  });
});

// ---- autoAssignInfopoint tests ----

describe('autoAssignInfopoint', () => {
  it('backup guides never assigned to infopoint', () => {
    const result = autoAssignInfopoint([], [], makeAvailability(), makeCumulative(), 0);
    result.infopoint.forEach(shift => {
      if (shift.guideId) {
        const guide = ALL_GUIDES.find(g => g.id === shift.guideId);
        expect(guide.backup).toBe(false);
      }
    });
  });

  it('handles empty infopoint list without crashing', () => {
    expect(() => autoAssignInfopoint([], [], makeAvailability(), makeCumulative(), 0)).not.toThrow();
  });

  it('assigns shifts when guides available', () => {
    const result = autoAssignInfopoint([], [], makeAvailability(), makeCumulative(), 0);
    expect(result.assigned).toBeGreaterThan(0);
  });

  it('no tour-infopoint time overlaps in assignments', () => {
    // Give alice a MuNe tour at 11:00 on day 0 (overlaps s1 11:00–13:00)
    const alice = REGULAR_GUIDES.find(g => g.id === 'alice');
    const tour = makeTour({ day: 0, time: '11:00', type: 'mune', lang: 'EN', guideId: 'alice' });
    const result = autoAssignInfopoint([tour], [], makeAvailability(), makeCumulative(), 0);
    // Find any s1 shift on day 0 — it should not be assigned to alice
    const s1Day0 = result.infopoint.find(s => s.day === 0 && s.shiftId === 's1');
    if (s1Day0) {
      expect(s1Day0.guideId).not.toBe('alice');
    }
  });
});

// ---- Utility function tests ----

describe('timeToMinutes / minutesToTime', () => {
  it('converts times correctly', () => {
    expect(timeToMinutes('09:00')).toBe(540);
    expect(timeToMinutes('11:30')).toBe(690);
    expect(timeToMinutes('00:00')).toBe(0);
  });

  it('round-trips correctly', () => {
    const times = ['09:00', '11:30', '14:00', '15:30', '17:00'];
    times.forEach(t => {
      expect(minutesToTime(timeToMinutes(t))).toBe(t);
    });
  });
});

describe('genId', () => {
  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => genId()));
    expect(ids.size).toBe(100);
  });
});
