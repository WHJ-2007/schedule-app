export default function UndoToast({
  text,
  onUndo,
  canUndo = false,
}: {
  text: string;
  onUndo: () => void;
  canUndo?: boolean; // 无撤销语义的提示（如顺延/提前结束）不显示撤销按钮
}) {
  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 overflow-hidden rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-900 shadow-xl anim-slide-up"
    >
      <div className="flex items-center gap-3">
        <span>{text}</span>
        {canUndo && (
          <button
            type="button"
            aria-label="撤销删除"
            onClick={onUndo}
            className="font-medium text-neutral-900 underline underline-offset-2"
          >
            撤销
          </button>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-neutral-200">
        <div className="h-full bg-neutral-400 anim-toast-progress" />
      </div>
    </div>
  );
}
