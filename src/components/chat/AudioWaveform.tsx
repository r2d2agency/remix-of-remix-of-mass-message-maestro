import { cn } from "@/lib/utils";

interface AudioWaveformProps {
  levels: number[];
  className?: string;
}

export function AudioWaveform({ levels, className }: AudioWaveformProps) {
  return (
    <div className={cn("flex items-center gap-0.5 h-8", className)}>
      {levels.map((level, index) => (
        <div
          key={index}
          className="w-1 bg-destructive rounded-full transition-all duration-75"
          style={{
            height: `${Math.max(4, level * 32)}px`,
            opacity: 0.5 + level * 0.5,
          }}
        />
      ))}
    </div>
  );
}
