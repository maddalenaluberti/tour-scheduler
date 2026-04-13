import { ALL_GUIDES } from '../data/guides.js';
import { computeCurrentWeekStats } from '../utils/scheduler.js';

function StatCard({ label, value, danger }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex-1 min-w-[120px] shadow-sm">
      <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 leading-none ${danger ? 'text-red-500' : 'text-teal-700'}`}>
        {value}
      </div>
    </div>
  );
}

function StatBar({ value, max, color = 'bg-teal-600' }) {
  const width = Math.round((value / Math.max(1, max)) * 80) + 4;
  return (
    <div className="flex items-center gap-1.5">
      <div className={`h-2 ${color} rounded`} style={{ width: `${width}px`, minWidth: '2px' }} />
      <span className="text-[0.8rem] font-bold text-slate-700 min-w-[20px]">{value}</span>
    </div>
  );
}

export default function Dashboard({ state, onSaveWeek, onResetCumulative, onDeleteSavedWeek }) {
  const weekStats = computeCurrentWeekStats(state.tours, state.infopoint);

  let totalTours = 0, totalShifts = 0, unassignedTours = 0, unassignedShifts = 0;
  state.tours.forEach(t => { totalTours++; if (!t.guideId) unassignedTours++; });
  state.infopoint.forEach(s => { totalShifts++; if (!s.guideId) unassignedShifts++; });

  const maxTours = Math.max(1, ...ALL_GUIDES.map(g =>
    (state.cumulative[g.id]?.tours || 0) + (weekStats[g.id]?.tours || 0)
  ));
  const maxInfopoint = Math.max(1, ...ALL_GUIDES.map(g =>
    (state.cumulative[g.id]?.infopoint || 0) + (weekStats[g.id]?.infopoint || 0)
  ));

  return (
    <div className="flex flex-1 min-h-0">
      {/* Sidebar */}
      <div className="w-72 min-w-[272px] bg-white border-r border-slate-200 p-4 flex flex-col gap-4 overflow-y-auto">

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
          <h3 className="text-[0.72rem] font-bold uppercase tracking-widest text-slate-500 mb-3">Week Controls</h3>
          <div className="flex flex-col gap-2">
            <button
              className="bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm py-1.5 px-3 rounded cursor-pointer border-none transition-colors"
              onClick={onSaveWeek}
            >
              💾 Save Week Stats
            </button>
            <button
              className="bg-white hover:bg-slate-50 text-slate-700 font-medium text-sm py-1.5 px-3 rounded cursor-pointer border border-slate-200 shadow-sm transition-colors"
              onClick={onResetCumulative}
            >
              ↺ Reset Cumulative Stats
            </button>
          </div>
          <p className="text-[0.72rem] text-slate-400 italic mt-2">Save at end of week to carry stats forward. Stats include current unfinished week.</p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
          <h3 className="text-[0.72rem] font-bold uppercase tracking-widest text-slate-500 mb-3">Saved Weeks</h3>
          {state.savedWeeks.length === 0 ? (
            <p className="text-[0.75rem] text-slate-400 italic">No saved weeks yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {[...state.savedWeeks].reverse().map((wk, i) => {
                const idx = state.savedWeeks.length - 1 - i;
                const d = new Date(wk.savedAt);
                return (
                  <div key={idx} className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-[0.8rem] font-semibold text-slate-700">{wk.weekLabel}</div>
                      <div className="text-[0.72rem] text-slate-400 mt-0.5">
                        Saved {d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <button
                      className="text-[0.75rem] font-medium text-slate-600 hover:text-red-500 bg-white hover:bg-red-50 border border-slate-200 rounded px-2 py-1 cursor-pointer transition-colors"
                      onClick={() => onDeleteSavedWeek(idx)}
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 p-5 overflow-auto">
        <h2 className="text-base font-bold text-slate-800 mb-4 pb-2 border-b-2 border-slate-200">
          Fairness Dashboard — Cumulative Stats
        </h2>

        {/* Summary cards */}
        <div className="flex gap-3 flex-wrap mb-5">
          <StatCard label="Total Tours" value={totalTours} />
          <StatCard label="Unassigned Tours" value={unassignedTours} danger={unassignedTours > 0} />
          <StatCard label="Infopoint Shifts" value={totalShifts} />
          <StatCard label="Unassigned Shifts" value={unassignedShifts} danger={unassignedShifts > 0} />
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
          <table className="w-full border-collapse text-[0.83rem]">
            <thead>
              <tr>
                {['Guide', 'Type', 'Total Tours', 'Self-Guided', 'MuNe', 'MuNe+HQ', 'Infopoint Shifts', 'Days Worked', 'Weeks Worked'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 bg-slate-50 border-b-2 border-slate-200 text-[0.72rem] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_GUIDES.map(guide => {
                const cum = state.cumulative[guide.id] || {};
                const wk = weekStats[guide.id] || {};
                const totalT = (cum.tours || 0) + (wk.tours || 0);
                const totalI = (cum.infopoint || 0) + (wk.infopoint || 0);
                const totalSG = (cum.selfGuided || 0) + (wk.selfGuided || 0);
                const totalMu = (cum.mune || 0) + (wk.mune || 0);
                const totalMuHq = (cum.muneHq || 0) + (wk.muneHq || 0);
                const totalDays = (cum.daysWorked || 0) + (wk.daysWorked || 0);
                const totalWeeks = cum.weeksWorked || 0;

                return (
                  <tr key={guide.id} className="hover:bg-slate-50 border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-2 font-semibold text-slate-800">{guide.name}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[0.68rem] font-semibold ${
                        guide.backup
                          ? 'bg-orange-100 text-orange-600'
                          : 'bg-teal-50 text-teal-700'
                      }`}>
                        {guide.backup ? 'Backup' : 'Regular'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <StatBar value={totalT} max={maxTours} color="bg-teal-500" />
                    </td>
                    <td className="px-3 py-2 text-slate-600">{totalSG}</td>
                    <td className="px-3 py-2 text-slate-600">{totalMu}</td>
                    <td className="px-3 py-2 text-slate-600">{totalMuHq}</td>
                    <td className="px-3 py-2">
                      <StatBar value={totalI} max={maxInfopoint} color="bg-purple-500" />
                    </td>
                    <td className="px-3 py-2 text-slate-600">{totalDays}</td>
                    <td className="px-3 py-2 text-slate-600">{totalWeeks}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
