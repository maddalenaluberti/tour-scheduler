import { useEffect, useState } from 'react';

function ToastItem({ message, type, onRemove }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 3200);
    const t2 = setTimeout(() => onRemove(), 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onRemove]);

  const colors = {
    success: 'bg-teal-700',
    error: 'bg-red-500',
    warning: 'bg-orange-500',
    info: 'bg-slate-800',
  };

  return (
    <div
      className={`toast-slide ${colors[type] || colors.info} text-white px-4 py-2.5 rounded-lg text-sm font-medium shadow-xl max-w-[320px] transition-opacity duration-300 ${fading ? 'opacity-0' : 'opacity-100'}`}
    >
      {message}
    </div>
  );
}

export default function Toast({ toasts, onRemove }) {
  return (
    <div className="fixed bottom-5 right-5 z-[300] flex flex-col gap-2">
      {toasts.map(t => (
        <ToastItem key={t.id} message={t.message} type={t.type} onRemove={() => onRemove(t.id)} />
      ))}
    </div>
  );
}
