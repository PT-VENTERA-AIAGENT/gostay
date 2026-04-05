import { MoreHorizontal } from "lucide-react";

const categories = [
  { label: "Facilities", score: 4.4 },
  { label: "Cleanliness", score: 4.7 },
  { label: "Services", score: 4.6 },
  { label: "Comfort", score: 4.8 },
  { label: "Location", score: 4.5 },
];

export default function OverallRating() {
  return (
    <div className="bg-card rounded-xl p-5 border border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Overall Rating</h3>
        <button className="text-muted-foreground hover:text-foreground">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <span className="text-4xl font-bold text-foreground">4.6</span>
        <div>
          <p className="text-sm font-semibold text-foreground">/5 &nbsp;Impressive</p>
          <p className="text-xs text-muted-foreground">from 2546 reviews</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {categories.map((c) => (
          <div key={c.label} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-20">{c.label}</span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${(c.score / 5) * 100}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-foreground w-7 text-right">{c.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
