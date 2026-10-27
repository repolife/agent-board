import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

/** A modal <dialog>: Escape and backdrop clicks close it. */
export function Modal({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Clicks on the backdrop land on the <dialog> element itself.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-labelledby={labelledBy}
      className="m-auto max-h-[88dvh] w-[calc(100%-2rem)] max-w-lg rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-zinc-950/50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
    >
      {children}
    </dialog>
  );
}

export function DialogHeader({ titleId, title, onClose }: { titleId: string; title: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <h2 id={titleId} className="font-semibold tracking-tight">
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        className="-mt-1 -mr-1 rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        aria-label="Close"
      >
        <X className="size-5" />
      </button>
    </div>
  );
}

export function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// Literal class strings so Tailwind can see them at build time.
const BUTTON_VARIANTS = {
  default:
    "border border-zinc-300 text-zinc-700 enabled:hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:enabled:hover:bg-zinc-800",
  primary: "bg-emerald-600 text-white enabled:hover:bg-emerald-700",
  danger: "bg-rose-600 text-white enabled:hover:bg-rose-700",
};

export function Button({
  variant = "default",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return (
    <button
      {...props}
      type={type}
      className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${props.className ?? ""}`}
    />
  );
}
