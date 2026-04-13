export const REGULAR_GUIDES = [
  { id: 'maddalena', name: 'Maddalena', langs: ['EN', 'IT'], backup: false },
  { id: 'camila',    name: 'Camila',    langs: ['EN', 'IT', 'ES'], backup: false },
  { id: 'alice',     name: 'Alice',     langs: ['EN', 'IT'], backup: false },
  { id: 'aurora',    name: 'Aurora',    langs: ['EN', 'IT'], backup: false },
  { id: 'valentina', name: 'Valentina', langs: ['EN', 'IT'], backup: false },
  { id: 'jacob',     name: 'Jacob',     langs: ['EN', 'IT'], backup: false },
  { id: 'daniela',   name: 'Daniela',   langs: ['EN', 'ES'], backup: false },
  { id: 'deborah',   name: 'Deborah',   langs: ['EN', 'IT', 'FR'], backup: false },
];

export const BACKUP_GUIDES = [
  { id: 'yayun',   name: 'Yayun',    langs: ['EN', 'ZH'], backup: true },
  { id: 'lorenzo', name: 'Lorenzo',  langs: ['EN', 'IT'], backup: true },
  { id: 'ange',    name: 'Ange',     langs: ['EN', 'FR'], backup: true },
  { id: 'flori',   name: 'Flori',    langs: ['EN', 'IT', 'FR'], backup: true },
  { id: 'aliceL',  name: 'Alice L.', langs: ['EN', 'IT', 'ES'], backup: true },
];

export const ALL_GUIDES = [...REGULAR_GUIDES, ...BACKUP_GUIDES];

export const TOUR_TYPES = {
  'self-guided': { label: 'Self-Guided', duration: 30, langRequired: false },
  'mune':        { label: 'MuNe',        duration: 90, langRequired: true },
  'mune-hq':     { label: 'MuNe+HQ',    duration: 135, langRequired: true },
};

export const INFOPOINT_SHIFTS = [
  { id: 's0', label: '9:00–11:00',  start: 9 * 60,      end: 11 * 60,   opener: true,  closer: false },
  { id: 's1', label: '11:00–13:00', start: 11 * 60,     end: 13 * 60,   opener: false, closer: false },
  { id: 's2', label: '14:00–15:30', start: 14 * 60,     end: 15.5 * 60, opener: false, closer: false },
  { id: 's3', label: '15:30–17:00', start: 15.5 * 60,   end: 17 * 60,   opener: false, closer: true  },
];

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
