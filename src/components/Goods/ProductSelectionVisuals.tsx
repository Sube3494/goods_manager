import Image from "next/image";
import { Check, Package } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProductSelectionIndicator({ selected, alreadySelected, className }: {
  selected: boolean;
  alreadySelected?: boolean;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={cn(
      "flex size-5 shrink-0 items-center justify-center rounded-full border transition-all",
      selected
        ? "border-foreground bg-foreground text-background shadow-xs dark:border-white dark:bg-white dark:text-black"
        : alreadySelected
          ? "border-emerald-500 bg-emerald-500 text-white"
          : "border-muted-foreground/50 group-hover:border-foreground",
      className,
    )}>
      {(selected || alreadySelected) && <Check size={11} strokeWidth={3.5} />}
    </span>
  );
}

export function ProductSelectionThumbnail({ image, name, grid = false }: {
  image?: string | null;
  name: string;
  grid?: boolean;
}) {
  const size = grid ? 220 : 40;
  return (
    <div className={cn("relative overflow-hidden bg-muted", grid ? "aspect-square w-full" : "size-10 shrink-0 rounded-lg border border-border/50")}>
      {image ? (
        <Image src={image} alt={name} width={size} height={size} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" unoptimized />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <Package size={grid ? 24 : 18} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
