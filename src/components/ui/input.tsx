import * as React from "react";
import { cn } from "@/lib/utils";
export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, ...props }, ref) => <input ref={ref} className={cn("flex h-11 w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", className)} {...props} />);
Input.displayName = "Input";
