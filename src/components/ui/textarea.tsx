import * as React from "react";
import { cn } from "@/lib/utils";
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(({ className, ...props }, ref) => <textarea ref={ref} className={cn("flex min-h-28 w-full resize-y rounded-lg border bg-card px-3 py-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", className)} {...props} />);
Textarea.displayName = "Textarea";
