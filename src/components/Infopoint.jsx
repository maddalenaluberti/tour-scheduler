import { ALL_GUIDES, INFOPOINT_SHIFTS, DAY_SHORT, DAYS } from '../data/guides.js';

function ShiftCard({ shift, onClear }) {
  const shiftDef = INFOPOINT_SHIFTS.find(s => s.id === shift.shiftId);
  const guide = ALL_GUIDES.find(g => g.id === shift.guideId);

  return (
    <div
      className={`relative rounded p-2 mb-1.5 border-[1.5px] cursor-pointer group transition-all hover:brightness-95 ${
        guide
          ? 'bg-teal-50 border-teal-200'
          : 'bg-red-50 border-red-400 border-dashed'
      }`}
      title={guide ? `Click to clear ${guide.name}'s assignment` : 'Unassigned'}
      onClick={guide ? () => onClear(shift.id) : undefined}
    >
      <button
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 hover:bg-red-50 text-xs px-1 py-0.5 rounded transition-all border-none bg-transparent cursor-pointer"
        title="Clear guide"
        onClick={e => { e.stopPropagation(); onClear(shift.id); }}
      >
        ✕
      </button>
      <div className={`text-[0.7rem] font-bold tracking-wide ${guide ? 'text-teal-700' : 'text-red-500'}`}>
        {shiftDef.label}
      </div>
      {guide ? (
        <div className="text-[0.78rem] font-semibold text-slate-700 mt-0.5">{guide.name}</div>
      ) : (
        <div className="text-[0.72rem] font-semibold text-red-500 mt-0.5">⚠ Unassigned</div>
      )}
    </div>
  );
}

function DayColumn({ dayIndex, date, shifts, isToday, onClearShift }) {
  const dateStr = date.getDate() + ' ' + date.toLocaleDateString('en-GB', { month: 'short' });
  const shiftOrder = { s0: 0, s1: 1, s2: 2, s3: 3 };
  const dayShifts = shifts
    .filter(s => s.day === dayIndex)
    .sort((a, b) => shiftOrder[a.shiftId] - shiftOrder[b.shiftId]);

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
        {dayShifts.length === 0 ? (
          <div className="text-slate-400 text-[0.75rem] text-center py-4 italic">No shifts loaded</div>
        ) : (
          dayShifts.map(shift => (
            <ShiftCard key={shift.id} shift={shift} onClear={onClearShift} />
          ))
        )}
      </div>
    </div>
  );
}

export default function Infopoint({ state, weekDates, isToday, onAutoAssign, onWipeInfopoint, onClearShift, onToggleAvailability }) {
  const weekShifts = state.infopoint.filter(s => s.weekOffset === state.weekOffset);

  return (
    <div className="flex flex-1 min-h-0">
      {/* Sidebar */}
      <div className="w-72 min-w-[272px] bg-white border-r border-slate-200 p-4 flex flex-col gap-4 overflow-y-auto">

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
          <h3 className="text-[0.72rem] font-bold uppercase tracking-widest text-slate-500 mb-2">Infopoint Shifts</h3>
          <p className="text-[0.8rem] text-slate-500 leading-relaxed">
            4 shifts per day, Mon–Sun.<br />
            Regular guides only.<br />
            Shifts: 9–11 · 11–13 · 14–15:30 · 15:30–17
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
          <h3 className="text-[0.72rem] font-bold uppercase tracking-widest text-slate-500 mb-3">Actions</h3>
          <div className="flex flex-col gap-2">
            <button
              className="bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm py-1.5 px-3 rounded cursor-pointer border-none transition-colors"
              onClick={onAutoAssign}
            >
              ⚡ Auto-Assign Shifts
            </button>
            <button
              className="bg-white hover:bg-slate-50 text-slate-700 font-medium text-sm py-1.5 px-3 rounded cursor-pointer border border-slate-200 shadow-sm transition-colors"
              onClick={onWipeInfopoint}
            >
              🗑 Wipe Infopoint
            </button>
          </div>
          <p className="text-[0.72rem] text-slate-400 italic mt-2">Click a shift to clear its guide. Re-run auto-assign to fill gaps.</p>
        </div>

        {/* Availability */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
          <h3 className="text-[0.72rem] font-bold uppercase tracking-widest text-slate-500 mb-3">Availability</h3>
          <div className="max-h-80 overflow-y-auto">
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
      </div>

      {/* Main grid */}
      <div className="flex-1 p-5 overflow-x-auto">
        <div className="grid grid-cols-7 gap-2.5 min-w-[900px]">
          {Array.from({ length: 7 }, (_, i) => (
            <DayColumn
              key={i}
              dayIndex={i}
              date={weekDates[i]}
              shifts={weekShifts}
              isToday={isToday(i)}
              onClearShift={onClearShift}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
