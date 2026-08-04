export default function UndoToast({
  text,
  onUndo,
}: {
  text: string;
  onUndo: () => void;
}) {
  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 overflow-hidden rounded-full bg-neutral-900 px-4 py-2 text-sm text-white shadow-lg anim-slide-up"
    >
      <div className="flex items-center gap-3">
        <span>{text}</span>
        <button
          type="button"
          aria-label="撤销删除"
          onClick={onUndo}
          className="font-medium text-white underline underline-offset-2"
        >
          撤销
        </button>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/20">
        <div className="h-full bg-white anim-toast-progress" />
      </div>
    </div>
  );
}
