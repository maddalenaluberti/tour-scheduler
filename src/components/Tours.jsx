import { useState } from 'react';
import { ALL_GUIDES, REGULAR_GUIDES, BACKUP_GUIDES, TOUR_TYPES, DAY_SHORT, DAYS } from '../data/guides.js';
import { timeToMinutes, minutesToTime, genId } from '../utils/scheduler.js';

// ---- Bulk import parser ----

const MONTH_NAMES = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

function parseDate(raw) {
  if (!raw) return null;
  const s = raw.trim();

  // ISO: 2025-04-21
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));

  // DD/MM/YYYY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));

  // "Monday, 21 April 2025" or "21 April 2025"
  m = s.match(/(?:\w+,\s*)?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) {
    const monthIdx = MONTH_NAMES[m[2].toLowerCase()];
    if (monthIdx !== undefined) return new Date(parseInt(m[3]), monthIdx, parseInt(m[1]));
  }

  // "April 21, 2025"
  m = s.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const monthIdx = MONTH_NAMES[m[1].toLowerCase()];
    if (monthIdx !== undefined) return new Date(parseInt(m[3]), monthIdx, parseInt(m[2]));
  }

  return null;
}

function parseTime(raw) {
  if (!raw) return null;
  const s = raw.trim();
  // HH:MM or H:MM
  let m = s.match(/^(\d{1,2}):(\d{2})(?:\s*[AaPp][Mm])?$/);
  if (m) {
    let h = parseInt(m[1]);
    const min = parseInt(m[2]);
    // Handle AM/PM
    if (/[Pp][Mm]/.test(s) && h < 12) h += 12;
    if (/[Aa][Mm]/.test(s) && h === 12) h = 0;
    return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
  }
  // Just a number like "10" or "14"
  m = s.match(/^(\d{1,2})$/);
  if (m) {
    const h = parseInt(m[1]);
    if (h >= 0 && h < 24) return `${h.toString().padStart(2, '0')}:00`;
  }
  return null;
}

function parseTourType(raw) {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s.includes('hq') || s.includes('mune+hq') || s.includes('mune + hq')) return 'mune-hq';
  if (s.includes('mune') || s.includes('mune') || s === 'mune') return 'mune';
  if (s.includes('self') || s.includes('guided') || s === 'sg') return 'self-guided';
  return null;
}

function parseLang(raw) {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  const langs = ['EN', 'IT', 'ES', 'FR', 'ZH'];
  for (const l of langs) {
    if (s === l || s.startsWith(l)) return l;
  }
  // Try partial
  if (s.includes('ENGL') || s === 'ENGLISH') return 'EN';
  if (s.includes('ITAL') || s === 'ITALIAN') return 'IT';
  if (s.includes('SPAN') || s === 'SPANISH') return 'ES';
  if (s.includes('FREN') || s === 'FRENCH') return 'FR';
  if (s.includes('CHIN') || s.includes('MAND') || s === 'CHINESE') return 'ZH';
  return null;
}

// Returns day-of-week index (0=Mon, 6=Sun) based on a date and weekStart (Monday of that week)
function getWeekDayIndex(date, weekStart) {
  const diffDays = Math.round((date - weekStart) / (1000 * 60 * 60 * 24));
  return diffDays; // 0=Mon,...,6=Sun
}

function getWeekStart(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function parseRows(text) {
  const lines = text.split(/\r?\n/);
  const parsed = [];
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Detect separator: tab preferred, else comma
    const sep = line.includes('\t') ? '\t' : ',';
    const cols = line.split(sep).map(c => c.trim());

    // Skip header rows (no parseable date in first col)
    const date = parseDate(cols[0]);
    if (!date) {
      // Might be a header row — skip silently if it looks like text
      if (/^[a-zA-Z\s]+$/.test(cols[0])) continue;
      errors.push({ row: i + 1, line, reason: `Cannot parse date: "${cols[0]}"` });
      continue;
    }

    const time = parseTime(cols[1]);
    if (!time) {
      errors.push({ row: i + 1, line, reason: `Cannot parse time: "${cols[1]}"` });
      continue;
    }

    const type = parseTourType(cols[2]);
    if (!type) {
      errors.push({ row: i + 1, line, reason: `Cannot parse tour type: "${cols[2]}"` });
      continue;
    }

    // Language: may be col 3 or col 4 (if col 3 is empty or looks like a guide)
    let lang = null;
    for (let ci = 3; ci < Math.min(cols.length, 6); ci++) {
      const candidate = parseLang(cols[ci]);
      if (candidate) { lang = candidate; break; }
    }

    const langRequired = TOUR_TYPES[type].langRequired;
    if (langRequired && !lang) {
      errors.push({ row: i + 1, line, reason: `Language required for ${type} but not found` });
      continue;
    }

    parsed.push({ date, time, type, lang: langRequired ? (lang || 'EN') : null });
  }

  return { parsed, errors };
}

// ---- Bulk Import Modal ----

function BulkImportModal({ weekOffset, onImport, onClose }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);

  const weekStart = getWeekStart(weekOffset);
  // Week ends (inclusive) at Sunday
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  function handleParse() {
    const { parsed, errors } = parseRows(text);

    // Filter to current week
    const inWeek = [];
    const outOfWeek = [];
    for (const p of parsed) {
      const diffDays = Math.round((p.date - weekStart) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 6) {
        inWeek.push({ ...p, dayIndex: diffDays });
      } else {
        outOfWeek.push(p);
      }
    }

    setPreview({ inWeek, outOfWeek, errors });
  }

  function handleImport() {
    if (!preview) return;
    const tours = preview.inWeek.map(p => ({
      id: genId(),
      day: p.dayIndex,
      time: p.time,
      type: p.type,
      lang: p.lang,
      guideId: null,
      weekOffset,
    }));
    onImport(tours);
    onClose();
  }

  const typeLabel = { 'self-guided': 'Self-Guided', 'mune': 'MuNe', 'mune-hq': 'MuNe+HQ' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-[700px] max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">Bulk Import Tours</h2>
          <button
            className="text-slate-400 hover:text-slate-600 text-xl font-bold border-none bg-transparent cursor-pointer"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-[0.8rem] text-slate-500 mb-2">
            Paste tab-separated or comma-separated data from Excel. Expected columns:
            <span className="font-semibold text-slate-700"> Date | Time | Tour Type | Language | Guide (ignored)</span>
          </p>
          <p className="text-[0.75rem] text-slate-400 mb-3">
            Date formats: "Monday, 21 April 2025", "21/04/2025", "2025-04-21" &nbsp;|&nbsp;
            Types: Self-Guided, MuNe, MuNe+HQ &nbsp;|&nbsp;
            Languages: EN, IT, ES, FR, ZH &nbsp;|&nbsp;
            Only rows matching the current week ({weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} – {weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}) will be imported.
          </p>
          <textarea
            className="w-full h-40 border border-slate-300 rounded px-3 py-2 text-sm font-mono text-slate-800 focus:border-teal-500 focus:outline-none resize-y"
            placeholder={"Monday, 21 April 2025\t10:00\tMuNe\tEN\n21/04/2025\t14:00\tSelf-Guided\n2025-04-22\t11:00\tMuNe+HQ\tIT"}
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <button
            className="mt-2 bg-slate-700 hover:bg-slate-800 text-white font-medium text-sm py-1.5 px-4 rounded cursor-pointer border-none transition-colors"
            onClick={handleParse}
          >
            Parse
          </button>

          {preview && (
            <div className="mt-4">
              {preview.inWeek.length > 0 && (
                <div className="mb-3">
                  <div className="text-[0.78rem] font-bold text-teal-700 mb-1.5">
                    Ready to import ({preview.inWeek.length} tour{preview.inWeek.length !== 1 ? 's' : ''}):
                  </div>
                  <div className="border border-teal-200 rounded overflow-hidden">
                    <table className="w-full text-[0.78rem]">
                      <thead>
                        <tr className="bg-teal-50">
                          {['Day', 'Time', 'Type', 'Language'].map(h => (
                            <th key={h} className="text-left px-2 py-1.5 font-semibold text-teal-700">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.inWeek.map((p, i) => (
                          <tr key={i} className="border-t border-teal-100 hover:bg-teal-50/50">
                            <td className="px-2 py-1">{DAYS[p.dayIndex]} {p.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                            <td className="px-2 py-1">{p.time}</td>
                            <td className="px-2 py-1">{typeLabel[p.type]}</td>
                            <td className="px-2 py-1">{p.lang || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {preview.outOfWeek.length > 0 && (
                <div className="mb-3 text-[0.75rem] text-slate-400">
                  {preview.outOfWeek.length} row(s) skipped — outside current week.
                </div>
              )}

              {preview.errors.length > 0 && (
                <div className="mb-3">
                  <div className="text-[0.78rem] font-bold text-red-600 mb-1">Rows that could not be parsed:</div>
                  <div className="bg-red-50 border border-red-200 rounded p-2 max-h-32 overflow-y-auto">
                    {preview.errors.map((e, i) => (
                      <div key={i} className="text-[0.72rem] text-red-700 mb-0.5">
                        Row {e.row}: {e.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.inWeek.length === 0 && preview.errors.length === 0 && (
                <div className="text-[0.78rem] text-slate-500 italic">No tours found for the current week.</div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button
            className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-sm py-1.5 px-4 rounded cursor-pointer transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className={`font-medium text-sm py-1.5 px-4 rounded cursor-pointer border-none transition-colors ${
              preview && preview.inWeek.length > 0
                ? 'bg-teal-600 hover:bg-teal-700 text-white'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
            onClick={handleImport}
            disabled={!preview || preview.inWeek.length === 0}
          >
            Import {preview && preview.inWeek.length > 0 ? `${preview.inWeek.length} Tour${preview.inWeek.length !== 1 ? 's' : ''}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Tour Card ----

function TourCard({ tour, onClear, onDelete }) {
  const guide = ALL_GUIDES.find(g => g.id === tour.guideId);
  const typeInfo = TOUR_TYPES[tour.type];
  const endMin = timeToMinutes(tour.time) + typeInfo.duration;

  const cardColors = {
    'self-guided': 'bg-blue-50 border-blue-200',
    'mune': 'bg-purple-50 border-purple-200',
    'mune-hq': 'bg-orange-100 border-orange-200',
  };
  const unassignedColors = 'bg-red-50 border-red-400 border-dashed opacity-90';

  return (
    <div
      className={`relative rounded p-2 mb-1.5 border-[1.5px] cursor-pointer group transition-all hover:brightness-95 ${guide ? cardColors[tour.type] : unassignedColors}`}
      title={guide ? `Click to clear ${guide.name}'s assignment` : 'Click Auto-Assign to assign'}
      onClick={guide ? () => onClear(tour.id) : undefined}
    >
      <button
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 hover:bg-red-50 text-xs px-1 py-0.5 rounded transition-all border-none bg-transparent cursor-pointer"
        title="Delete tour"
        onClick={e => { e.stopPropagation(); onDelete(tour.id); }}
      >
        ✕
      </button>
      <div className="text-[0.7rem] font-bold text-slate-600 tracking-wide">
        {tour.time} – {minutesToTime(endMin)}
      </div>
      <div className="text-[0.8rem] font-semibold text-slate-800 mt-0.5">
        {typeInfo.label}{tour.lang ? ` · ${tour.lang}` : ''}
      </div>
      {guide ? (
        <div className={`text-[0.75rem] font-semibold mt-1 flex items-center gap-1 ${guide.backup ? 'text-orange-500' : 'text-slate-700'}`}>
          {guide.backup ? '★ ' : ''}{guide.name}
        </div>
      ) : (
        <div className="text-[0.75rem] font-semibold text-red-500 mt-1">⚠ Unassigned</div>
      )}
    </div>
  );
}

function DayColumn({ dayIndex, date, tours, isToday, onClearTour, onDeleteTour }) {
  const dateStr = date.getDate() + ' ' + date.toLocaleDateString('en-GB', { month: 'short' });
  const dayTours = tours
    .filter(t => t.day === dayIndex)
    .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm min-w-0">
      <div className={`px-3 py-2 border-b border-slate-200 text-center ${isToday ? 'bg-teal-50' : 'bg-slate-50'}`}>
        <div className={`text-[0.75rem] font-bold uppercase tracking-wider ${isToday ? 'text-teal-700' : 'text-slate-500'}`}>
          {DAY_SHORT[dayIndex]}
        </div>
        <div className={`text-sm font-semibold mt-0.5 ${isToday ? 'text-teal-700' : 'text-slate-800'}`}>
          {dateStr}
        </div>
      </div>
      <div className="p-2 min-h-[80px]">
        {dayTours.length === 0 ? (
          <div className="text-slate-400 text-[0.75rem] text-center py-4 italic">No tours</div>
        ) : (
          dayTours.map(tour => (
            <TourCard
              key={tour.id}
              tour={tour}
              onClear={onClearTour}
              onDelete={onDeleteTour}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---- Main Tours component ----

export default function Tours({ state, weekDates, isToday, onAddTour, onAutoAssign, onClearTour, onDeleteTour, onWipeTours, onToggleAvailability, onBulkImport }) {
  const [formDay, setFormDay] = useState(0);
  const [formTime, setFormTime] = useState('10:00');
  const [formType, setFormType] = useState('self-guided');
  const [formLang, setFormLang] = useState('EN');
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const weekTours = state.tours.filter(t => t.weekOffset === state.weekOffset);
  const langRequired = TOUR_TYPES[formType]?.langRequired;

  function handleAddTour() {
    if (!formTime) return;
    onAddTour({
      id: genId(),
      day: parseInt(formDay),
      time: formTime,
      type: formType,
      lang: langRequired ? formLang : null,
      guideId: null,
      weekOffset: state.weekOffset,
    });
  }

  function handleCopyAssignments() {
    const typeLabel = { 'self-guided': 'Self-Guided', 'mune': 'MuNe', 'mune-hq': 'MuNe+HQ' };
    const rows = [['Date', 'Time', 'Type', 'Language', 'Guide']];

    const sorted = [...weekTours].sort((a, b) => {
      if (a.day !== b.day) return a.day - b.day;
      return timeToMinutes(a.time) - timeToMinutes(b.time);
    });

    for (const tour of sorted) {
      const guide = ALL_GUIDES.find(g => g.id === tour.guideId);
      const date = weekDates[tour.day];
      const dateStr = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      rows.push([
        dateStr,
        tour.time,
        typeLabel[tour.type] || tour.type,
        tour.lang || '',
        guide ? guide.name : 'Unassigned',
      ]);
    }

    const tsv = rows.map(r => r.join('\t')).join('\n');
    navigator.clipboard.writeText(tsv).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  }

  function handleBulkImport(tours) {
    if (onBulkImport) onBulkImport(tours);
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Sidebar */}
      <div className="w-72 min-w-[272px] bg-white border-r border-slate-200 p-4 flex flex-col gap-4 overflow-y-auto">

        {/* Add Tour Form */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
          <h3 className="text-[0.72rem] font-bold uppercase tracking-widest text-slate-500 mb-3">Add Tour</h3>
          <div className="mb-2">
            <label className="text-[0.72rem] font-semibold text-slate-600 block mb-1">Day</label>
            <select
              className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm bg-white text-slate-800 focus:border-teal-500 focus:outline-none"
              value={formDay}
              onChange={e => setFormDay(e.target.value)}
            >
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <div className="mb-2">
            <label className="text-[0.72rem] font-semibold text-slate-600 block mb-1">Start Time</label>
            <input
              type="time"
              className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm bg-white text-slate-800 focus:border-teal-500 focus:outline-none"
              value={formTime}
              onChange={e => setFormTime(e.target.value)}
            />
          </div>
          <div className="mb-2">
            <label className="text-[0.72rem] font-semibold text-slate-600 block mb-1">Tour Type</label>
            <select
              className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm bg-white text-slate-800 focus:border-teal-500 focus:outline-none"
              value={formType}
              onChange={e => setFormType(e.target.value)}
            >
              <option value="self-guided">Self-Guided (30 min)</option>
              <option value="mune">MuNe (90 min)</option>
              <option value="mune-hq">MuNe+HQ (135 min)</option>
            </select>
          </div>
          {langRequired && (
            <div className="mb-2">
              <label className="text-[0.72rem] font-semibold text-slate-600 block mb-1">Language</label>
              <select
                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm bg-white text-slate-800 focus:border-teal-500 focus:outline-none"
                value={formLang}
                onChange={e => setFormLang(e.target.value)}
              >
                <option value="EN">English</option>
                <option value="IT">Italian</option>
                <option value="ES">Spanish</option>
                <option value="FR">French</option>
                <option value="ZH">Chinese (Mandarin)</option>
              </select>
            </div>
          )}
          <button
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm py-1.5 px-3 rounded cursor-pointer border-none transition-colors"
            onClick={handleAddTour}
          >
            Add Tour
          </button>
          <p className="text-[0.72rem] text-slate-400 italic mt-1.5">Click a tour card to clear its guide assignment.</p>
        </div>

        {/* Actions */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
          <h3 className="text-[0.72rem] font-bold uppercase tracking-widest text-slate-500 mb-3">Actions</h3>
          <div className="flex flex-col gap-2">
            <button
              className="bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm py-1.5 px-3 rounded cursor-pointer border-none transition-colors"
              onClick={onAutoAssign}
            >
              ⚡ Auto-Assign All
            </button>
            <button
              className="bg-white hover:bg-slate-50 text-slate-700 font-medium text-sm py-1.5 px-3 rounded cursor-pointer border border-slate-200 shadow-sm transition-colors"
              onClick={() => setShowBulkImport(true)}
            >
              📋 Bulk Import
            </button>
            <button
              className={`font-medium text-sm py-1.5 px-3 rounded cursor-pointer border transition-colors ${
                copyFeedback
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm'
              }`}
              onClick={handleCopyAssignments}
            >
              {copyFeedback ? '✓ Copied!' : '📤 Copy Assignments'}
            </button>
            <button
              className="bg-white hover:bg-slate-50 text-slate-700 font-medium text-sm py-1.5 px-3 rounded cursor-pointer border border-slate-200 shadow-sm transition-colors"
              onClick={onWipeTours}
            >
              🗑 Wipe Tours
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
          <h3 className="text-[0.72rem] font-bold uppercase tracking-widest text-slate-500 mb-3">Legend</h3>
          <div className="flex flex-wrap gap-3">
            {[
              { color: 'bg-blue-50 border border-blue-200', label: 'Self-Guided' },
              { color: 'bg-purple-50 border border-purple-200', label: 'MuNe' },
              { color: 'bg-orange-100 border border-orange-200', label: 'MuNe+HQ' },
              { color: 'bg-red-50 border border-dashed border-red-400', label: 'Unassigned' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5 text-[0.72rem] text-slate-600 font-medium">
                <div className={`w-3 h-3 rounded-sm ${item.color}`}></div>
                {item.label}
              </div>
            ))}
          </div>
        </div>

        {/* Availability */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
          <h3 className="text-[0.72rem] font-bold uppercase tracking-widest text-slate-500 mb-3">Availability (mark unavailable)</h3>
          <div className="max-h-72 overflow-y-auto">
            {ALL_GUIDES.map(guide => (
              <div key={guide.id} className="mb-2.5">
                <div className="text-[0.78rem] font-medium text-slate-700 mb-1">
                  {guide.name}{guide.backup ? ' (B)' : ''}
                </div>
                <div className="flex gap-1 flex-wrap">
                  {DAY_SHORT.map((d, i) => {
                    const unavail = state.availability[guide.id] && state.availability[guide.id][i];
                    return (
                      <button
                        key={i}
                        title={`${guide.name} – ${DAYS[i]}`}
                        className={`w-[26px] h-[22px] border rounded text-[0.62rem] font-bold cursor-pointer transition-all ${
                          unavail
                            ? 'bg-red-500 border-red-500 text-white'
                            : 'bg-white border-slate-300 text-slate-500 hover:bg-slate-100'
                        }`}
                        onClick={() => onToggleAvailability(guide.id, i)}
                      >
                        {d.charAt(0)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Guide Roster */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
          <h3 className="text-[0.72rem] font-bold uppercase tracking-widest text-slate-500 mb-3">Guide Roster</h3>
          <div className="text-[0.7rem] font-bold text-slate-400 uppercase tracking-wider mb-1">Regular</div>
          <div className="flex flex-wrap mb-2">
            {REGULAR_GUIDES.map(g => (
              <span key={g.id} className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5 text-[0.7rem] font-medium text-slate-700 m-0.5">
                {g.name} <span className="text-slate-400 text-[0.62rem]">{g.langs.join('·')}</span>
              </span>
            ))}
          </div>
          <div className="text-[0.7rem] font-bold text-slate-400 uppercase tracking-wider mb-1 mt-2">Backup</div>
          <div className="flex flex-wrap">
            {BACKUP_GUIDES.map(g => (
              <span key={g.id} className="inline-flex items-center gap-1 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5 text-[0.7rem] font-medium text-orange-600 m-0.5">
                {g.name} <span className="text-orange-300 text-[0.62rem]">{g.langs.join('·')}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="flex-1 p-5 overflow-x-auto">
        <div className="grid grid-cols-7 gap-2.5 min-w-[900px]">
          {Array.from({ length: 7 }, (_, i) => (
            <DayColumn
              key={i}
              dayIndex={i}
              date={weekDates[i]}
              tours={weekTours}
              isToday={isToday(i)}
              onClearTour={onClearTour}
              onDeleteTour={onDeleteTour}
            />
          ))}
        </div>
      </div>

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <BulkImportModal
          weekOffset={state.weekOffset}
          onImport={handleBulkImport}
          onClose={() => setShowBulkImport(false)}
        />
      )}
    </div>
  );
}
