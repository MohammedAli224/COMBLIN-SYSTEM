import { useEffect } from "react";
import { AlertCircle, X } from "lucide-react";

interface ErrorToastProps {
  message: string | null;
  onDismiss: () => void;
  /** Localized label for the close control, for screen readers. */
  dismissLabel: string;
  /** Milliseconds before auto-dismiss. Errors always stay dismissible by hand. */
  duration?: number;
}

/**
 * Lightweight error toast for transient submission failures.
 *
 * Rendered in an aria-live region so screen readers announce network and
 * validation errors without stealing focus from the form.
 */
export function ErrorToast({ message, onDismiss, dismissLabel, duration = 6000 }: ErrorToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [message, duration, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="mb-5 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive shadow-sm"
    >
      <AlertCircle className="mt-0.5 size-5 shrink-0" />
      <p className="flex-1 leading-6">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="rounded-md p-1 transition hover:bg-destructive/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
