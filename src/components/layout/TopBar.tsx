import { Search, Bell } from "lucide-react";

export default function TopBar() {
  return (
    <header className="flex items-center justify-between px-8 py-4 bg-card border-b border-border">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-muted rounded-lg px-4 py-2.5 w-72">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            placeholder="Search room, guest, book, etc"
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <button className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors">
              <Bell className="w-5 h-5" />
            </button>
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-destructive rounded-full border-2 border-card" />
          </div>

          <div className="flex items-center gap-3 ml-2">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-semibold text-sm text-primary">
              JD
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">Jaylon Dorwart</p>
              <p className="text-xs text-muted-foreground">Admin</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
