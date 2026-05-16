import { LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PhotoGridDensity } from '@/lib/gridDensity';

const options: Array<{ value: PhotoGridDensity; label: string }> = [
  { value: 'less', label: '较少' },
  { value: 'more', label: '较多' },
];

interface GridDensityToggleProps {
  value: PhotoGridDensity;
  onChange: (value: PhotoGridDensity) => void;
  className?: string;
}

export function GridDensityToggle({ value, onChange, className }: GridDensityToggleProps) {
  return (
    <div className={cn("flex items-center gap-2 text-sm", className)}>
      <div className="hidden items-center gap-1.5 text-muted-foreground sm:flex">
        <LayoutGrid className="h-4 w-4" />
        <span>显示</span>
      </div>
      <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            aria-label={`${option.label}显示照片`}
            className={cn(
              "h-8 min-w-12 rounded-full px-3 text-sm font-medium transition-colors",
              value === option.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
