import { CalendarIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Props {
  /** ISO date string 'yyyy-MM-dd' or "" when unset. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Dates before this (ISO) are disabled. */
  min?: string;
  className?: string;
}

/**
 * A calendar date picker that reads and writes plain 'yyyy-MM-dd' strings — the
 * same format the native <input type="date"> used, so callers and the booking
 * queries need no change. Replaces the native input, whose look and mm/dd/yyyy
 * masking were the complaint.
 *
 * All parsing is local-midnight (parseISO on a date-only string), never UTC, so
 * the day a guest taps is the day that gets stored — no timezone drift.
 */
export default function DatePicker({ value, onChange, placeholder = "Pilih tanggal", min, className }: Props) {
  const selected = value ? parseISO(value) : undefined;
  const minDate = min ? parseISO(min) : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-left focus:outline-none focus:ring-2 focus:ring-ring transition-colors",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="w-4 h-4 shrink-0 text-muted-foreground" />
          {value ? format(selected!, "d MMM yyyy", { locale: idLocale }) : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? minDate}
          onSelect={(d) => onChange(d ? format(d, "yyyy-MM-dd") : "")}
          disabled={minDate ? { before: minDate } : undefined}
          locale={idLocale}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
