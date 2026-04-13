export default function Modal({ title, body, buttons, onClose }) {
  if (!title) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl p-7 w-[420px] max-w-[95vw] shadow-xl">
        <h2 className="text-lg font-bold text-slate-800 mb-5">{title}</h2>
        <div className="text-slate-600 leading-relaxed text-sm" dangerouslySetInnerHTML={{ __html: body }} />
        <div className="flex gap-2 justify-end mt-5">
          {buttons.map((btn, i) => (
            <button
              key={i}
              className={`px-4 py-1.5 rounded text-sm font-medium cursor-pointer border-none transition-colors ${btn.cls}`}
              onClick={btn.action}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
