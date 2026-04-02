import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "py-20 flex flex-col items-center justify-center text-center",
        className
      )}
    >
      <div className="h-20 w-20 rounded-full bg-muted/30 flex items-center justify-center mb-6 text-muted-foreground/50 border border-dashed border-border transition-transform duration-500">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-foreground">{title}</h3>
      {description && (
        <p className="text-muted-foreground text-sm mt-2 max-w-[280px] leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}
