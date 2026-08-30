import { cn } from "@/lib/cn";

export function Container({
  className,
  children,
  wide = false,
}: {
  className?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-6 sm:px-8",
        wide ? "max-w-[1400px]" : "max-w-5xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
