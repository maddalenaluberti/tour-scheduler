import { useState, useCallback } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage.js';
import { ALL_GUIDES } from './data/guides.js';
import {
  autoAssignTours,
  autoAssignInfopoint,
  ensureInfopointShifts,
  computeCurrentWeekStats,
  genId,
} from './utils/scheduler.js';
import Tours from './components/Tours.jsx';
import Infopoint from './components/Infopoint.jsx';
import Dashboard from './components/Dashboard.jsx';
import Modal from './components/Modal.jsx';
import Toast from './components/Toast.jsx';

// ---- Defaults ----
function buildDefaultCumulative() {
  const c = {};
  ALL_GUIDES.forEach(g => {
    c[g.id] = { tours: 0, selfGuided: 0, mune: 0, muneHq: 0, infopoint: 0, daysWorked: 0, weeksWorked: 0 };
  });
  return c;
}

function buildDefaultAvailability() {
  const a = {};
  ALL_GUIDES.forEach(g => { a[g.id] = {}; });
  return a;
}

const DEFAULT_STATE = {
  weekOffset: 0,
  tours: [],
  infopoint: [],
  availability: buildDefaultAvailability(),
  cumulative: buildDefaultCumulative(),
  savedWeeks: [],
};

// ---- Week utilities ----
function getWeekStart(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getWeekDates(offset = 0) {
  const start = getWeekStart(offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function formatWeekLabel(offset = 0) {
  const dates = getWeekDates(offset);
  const fmt = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${fmt(dates[0])} – ${fmt(dates[6])} ${dates[0].getFullYear()}`;
}

function isToday(dayIndex, weekOffset) {
  const dates = getWeekDates(weekOffset);
  const today = new Date();
  const d = dates[dayIndex];
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

// ---- Main App ----
export default function App() {
  const [persisted, setPersisted] = useLocalStorage('tourSchedulerState', DEFAULT_STATE);

  // Merge in defaults for any missing keys
  const state = {
    ...DEFAULT_STATE,
    ...persisted,
    cumulative: {
      ...buildDefaultCumulative(),
      ...(persisted.cumulative || {}),
    },
    availability: {
      ...buildDefaultAvailability(),
      ...(persisted.availability || {}),
    },
  };

  const setState = useCallback((updater) => {
    setPersisted(prev => {
      const current = { ...DEFAULT_STATE, ...prev };
      const next = typeof updater === 'function' ? updater(current) : updater;
      return next;
    });
  }, [setPersisted]);

  const [activeTab, setActiveTab] = useState('tours');
  const [modal, setModal] = useState(null);
  const [toasts, setToasts] = useState([]);

  // ---- Toast ----
  function addToast(message, type = 'info') {
    const id = genId();
    setToasts(prev => [...prev, { id, message, type }]);
  }

  function removeToast(id) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  // ---- Week navigation ----
  function changeWeek(dir) {
    setState(s => ({ ...s, weekOffset: s.weekOffset + dir }));
  }

  function goToToday() {
    setState(s => ({ ...s, weekOffset: 0 }));
  }

  // ---- Tours ----
  function handleAddTour(tour) {
    setState(s => ({ ...s, tours: [...s.tours, tour] }));
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    addToast(`Added tour on ${dayNames[tour.day]} at ${tour.time}.`);
  }

  function handleDeleteTour(tourId) {
    setState(s => ({ ...s, tours: s.tours.filter(t => t.id !== tourId) }));
  }

  function handleClearTour(tourId) {
    setState(s => ({
      ...s,
      tours: s.tours.map(t => t.id === tourId ? { ...t, guideId: null } : t),
    }));
    addToast('Guide cleared. Run Auto-Assign to reassign.', 'warning');
  }

  function handleAutoAssignTours() {
    const weekTours = state.tours.filter(t => t.weekOffset === state.weekOffset);
    const result = autoAssignTours(
      weekTours,
      state.infopoint,
      state.availability,
      state.cumulative
    );
    if (result.message === 'already-assigned') {
      addToast('All tours already assigned!', 'warning');
      return;
    }
    const otherTours = state.tours.filter(t => t.weekOffset !== state.weekOffset);
    setState(s => ({ ...s, tours: [...otherTours, ...result.tours] }));
    if (result.failed > 0) {
      addToast(`Assigned ${result.assigned} tours. ${result.failed} could not be assigned (check constraints/availability).`, 'warning');
    } else {
      addToast(`Auto-assigned ${result.assigned} tour${result.assigned !== 1 ? 's' : ''} successfully!`, 'success');
    }
  }

  function handleBulkImport(tours) {
    setState(s => ({ ...s, tours: [...s.tours, ...tours] }));
    addToast(`Imported ${tours.length} tour${tours.length !== 1 ? 's' : ''} successfully!`, 'success');
  }

  function handleWipeTours() {
    setModal({
      title: 'Wipe Tours?',
      body: 'This will remove ALL tours for the currently viewed week.<br>This action cannot be undone.',
      buttons: [
        { label: 'Cancel', cls: 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50', action: () => setModal(null) },
        {
          label: 'Wipe Tours', cls: 'bg-red-500 text-white hover:bg-red-600', action: () => {
            setState(s => ({ ...s, tours: s.tours.filter(t => t.weekOffset !== s.weekOffset) }));
            addToast('All tours wiped for this week.', 'warning');
            setModal(null);
          }
        },
      ],
    });
  }

  // ---- Infopoint ----
  function handleAutoAssignInfopoint() {
    const result = autoAssignInfopoint(
      state.tours,
      state.infopoint,
      state.availability,
      state.cumulative,
      state.weekOffset
    );
    if (result.message === 'already-assigned') {
      addToast('All infopoint shifts already assigned!', 'warning');
      return;
    }
    setState(s => ({ ...s, infopoint: result.infopoint }));
    if (result.failed > 0) {
      addToast(`Assigned ${result.assigned} shifts. ${result.failed} could not be assigned (check constraints).`, 'warning');
    } else {
      addToast(`Auto-assigned ${result.assigned} infopoint shift${result.assigned !== 1 ? 's' : ''}!`, 'success');
    }
  }

  function handleClearShift(shiftId) {
    setState(s => ({
      ...s,
      infopoint: s.infopoint.map(sh => sh.id === shiftId ? { ...sh, guideId: null } : sh),
    }));
    addToast('Shift guide cleared. Re-run Auto-Assign to fill.', 'warning');
  }

  function handleWipeInfopoint() {
    setModal({
      title: 'Wipe Infopoint Shifts?',
      body: 'This will clear all guide assignments from infopoint shifts for the current week.<br>This action cannot be undone.',
      buttons: [
        { label: 'Cancel', cls: 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50', action: () => setModal(null) },
        {
          label: 'Wipe Shifts', cls: 'bg-red-500 text-white hover:bg-red-600', action: () => {
            setState(s => ({ ...s, infopoint: s.infopoint.filter(sh => sh.weekOffset !== s.weekOffset) }));
            addToast('All infopoint shifts wiped for this week.', 'warning');
            setModal(null);
          }
        },
      ],
    });
  }

  function handleTabSwitch(tab) {
    setActiveTab(tab);
    if (tab === 'infopoint') {
      const weekShifts = state.infopoint.filter(s => s.weekOffset === state.weekOffset);
      if (weekShifts.length === 0) {
        const newInfopoint = ensureInfopointShifts(state.infopoint, state.weekOffset);
        setState(s => ({ ...s, infopoint: newInfopoint }));
      }
    }
  }

  // ---- Availability ----
  function handleToggleAvailability(guideId, dayIndex) {
    setState(s => {
      const avail = { ...s.availability };
      const guideAvail = { ...(avail[guideId] || {}) };
      guideAvail[dayIndex] = !guideAvail[dayIndex];
      avail[guideId] = guideAvail;
      return { ...s, availability: avail };
    });
  }

  // ---- Dashboard ----
  function handleSaveWeek() {
    const weekStats = computeCurrentWeekStats(state.tours, state.infopoint);
    const label = formatWeekLabel(state.weekOffset);

    setState(s => {
      const newCumulative = { ...s.cumulative };
      ALL_GUIDES.forEach(g => {
        const wk = weekStats[g.id] || {};
        const cum = { ...(newCumulative[g.id] || {}) };
        cum.tours = (cum.tours || 0) + (wk.tours || 0);
        cum.selfGuided = (cum.selfGuided || 0) + (wk.selfGuided || 0);
        cum.mune = (cum.mune || 0) + (wk.mune || 0);
        cum.muneHq = (cum.muneHq || 0) + (wk.muneHq || 0);
        cum.infopoint = (cum.infopoint || 0) + (wk.infopoint || 0);
        cum.daysWorked = (cum.daysWorked || 0) + (wk.daysWorked || 0);
        if ((wk.tours || 0) > 0 || (wk.infopoint || 0) > 0) cum.weeksWorked = (cum.weeksWorked || 0) + 1;
        newCumulative[g.id] = cum;
      });

      return {
        ...s,
        cumulative: newCumulative,
        savedWeeks: [
          ...s.savedWeeks,
          { weekLabel: label, savedAt: new Date().toISOString(), weekStats },
        ],
      };
    });

    addToast(`Week stats saved: ${label}`, 'success');
  }

  function handleResetCumulative() {
    setModal({
      title: 'Reset Cumulative Stats?',
      body: 'This will clear all cumulative fairness data (but keep saved week history).<br>Current week data and tours are not affected.',
      buttons: [
        { label: 'Cancel', cls: 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50', action: () => setModal(null) },
        {
          label: 'Reset', cls: 'bg-red-500 text-white hover:bg-red-600', action: () => {
            setState(s => ({ ...s, cumulative: buildDefaultCumulative() }));
            addToast('Cumulative stats reset.', 'success');
            setModal(null);
          }
        },
      ],
    });
  }

  function handleDeleteSavedWeek(idx) {
    setState(s => ({
      ...s,
      savedWeeks: s.savedWeeks.filter((_, i) => i !== idx),
    }));
  }

  const weekDates = getWeekDates(state.weekOffset);
  const isTodayFn = (dayIndex) => isToday(dayIndex, state.weekOffset);

  const tabs = [
    { key: 'tours', label: 'Tours' },
    { key: 'infopoint', label: 'Infopoint Shifts' },
    { key: 'dashboard', label: 'Fairness Dashboard' },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="bg-teal-700 text-white px-6 flex items-center h-[60px] shadow-md sticky top-0 z-10">
        <h1 className="text-lg font-semibold tracking-tight">🏛 Tour Scheduler</h1>
        <span className="text-[0.78rem] opacity-75 ml-3 pl-3 border-l border-white/30">Museum Guide Manager</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button
            className="bg-white/15 hover:bg-white/25 text-white border-none rounded px-2 py-1.5 cursor-pointer text-sm transition-colors"
            onClick={() => changeWeek(-1)}
          >
            ←
          </button>
          <span className="text-sm font-medium min-w-[200px] text-center">
            {formatWeekLabel(state.weekOffset)}
          </span>
          <button
            className="bg-white/15 hover:bg-white/25 text-white border-none rounded px-2 py-1.5 cursor-pointer text-sm transition-colors"
            onClick={() => changeWeek(1)}
          >
            →
          </button>
          <button
            className="bg-white/15 hover:bg-white/25 text-white border-none rounded px-2.5 py-1.5 cursor-pointer text-sm font-medium transition-colors ml-1"
            onClick={goToToday}
          >
            Today
          </button>
        </div>
      </header>

      {/* Tabs bar */}
      <div className="bg-white border-b border-slate-200 flex px-6 gap-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`px-5 py-3 border-none bg-transparent cursor-pointer text-sm font-medium transition-all border-b-2 ${
              activeTab === tab.key
                ? 'text-teal-700 border-teal-600'
                : 'text-slate-500 border-transparent hover:text-slate-700'
            }`}
            onClick={() => handleTabSwitch(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 'calc(100vh - 100px)' }}>
        {activeTab === 'tours' && (
          <Tours
            state={state}
            weekDates={weekDates}
            isToday={isTodayFn}
            onAddTour={handleAddTour}
            onAutoAssign={handleAutoAssignTours}
            onClearTour={handleClearTour}
            onDeleteTour={handleDeleteTour}
            onWipeTours={handleWipeTours}
            onBulkImport={handleBulkImport}
            onToggleAvailability={handleToggleAvailability}
          />
        )}
        {activeTab === 'infopoint' && (
          <Infopoint
            state={state}
            weekDates={weekDates}
            isToday={isTodayFn}
            onAutoAssign={handleAutoAssignInfopoint}
            onWipeInfopoint={handleWipeInfopoint}
            onClearShift={handleClearShift}
            onToggleAvailability={handleToggleAvailability}
          />
        )}
        {activeTab === 'dashboard' && (
          <Dashboard
            state={state}
            onSaveWeek={handleSaveWeek}
            onResetCumulative={handleResetCumulative}
            onDeleteSavedWeek={handleDeleteSavedWeek}
          />
        )}
      </div>

      {/* Modal */}
      {modal && (
        <Modal
          title={modal.title}
          body={modal.body}
          buttons={modal.buttons}
          onClose={() => setModal(null)}
        />
      )}

      {/* Toast */}
      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
