import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Edit, Trash2, Wifi, Wind, Tv, Coffee, Bath, Mountain, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getSeasonalPricing } from "@/services/roomService";
import { roomKeys } from "@/hooks/useRooms";
import type { RoomType, Room, SeasonalPricing } from "@/types/database.types";

const amenityIcons: Record<string, React.ElementType> = {
  WiFi: Wifi, AC: Wind, TV: Tv, "Mini Bar": Coffee, Bathtub: Bath, "Sea View": Mountain,
};

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

export default function RoomTypeDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: roomType, isLoading: typeLoading } = useQuery<RoomType>({
    queryKey: ["room-types", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("room_types").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(id),
  });

  const { data: rooms = [], isLoading: roomsLoading } = useQuery<Room[]>({
    queryKey: ["rooms", "by-type", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms").select("*").eq("room_type_id", id!).eq("is_active", true).order("number");
      if (error) throw error;
      return data;
    },
    enabled: Boolean(id),
  });

  const { data: pricing = [] } = useQuery<SeasonalPricing[]>({
    queryKey: ["seasonal-pricing", id],
    queryFn: () => getSeasonalPricing(id!),
    enabled: Boolean(id),
  });

  if (typeLoading || roomsLoading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </PageTransition>
    );
  }

  if (!roomType) {
    return (
      <PageTransition>
        <div className="p-6 text-center text-sm text-destructive">Room type not found.</div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <Link to="/rooms/types" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors shrink-0 self-start btn-press">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold text-foreground">{roomType.name}</h1>
            <p className="text-sm text-muted-foreground">Room Type · {rooms.length} rooms</p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <button className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors btn-press">
              <Edit className="w-4 h-4" /> <span className="hidden sm:inline">Edit</span>
            </button>
            <button className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-lg border border-destructive bg-card text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors btn-press">
              <Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">Delete</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="lg:col-span-2 space-y-4 md:space-y-6">
            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-foreground">Photos</h2>
                <button className="text-sm text-primary font-medium hover:underline flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Upload</button>
              </div>
              {roomType.photos.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {roomType.photos.map((url, i) => (
                    <div key={i} className="aspect-[4/3] bg-muted rounded-lg overflow-hidden">
                      <img src={url} alt={`${roomType.name} ${i + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="aspect-[4/3] bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-xs">Photo {i}</div>
                  ))}
                </div>
              )}
            </motion.div>

            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-3">Description</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{roomType.description ?? "No description set."}</p>
            </motion.div>

            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-3">Amenities</h2>
              <div className="flex flex-wrap gap-2">
                {roomType.amenities.map((a) => {
                  const Icon = amenityIcons[a];
                  return (
                    <span key={a} className="inline-flex items-center gap-1.5 text-sm bg-secondary text-secondary-foreground px-3 py-1.5 rounded-lg">
                      {Icon && <Icon className="w-4 h-4" />} {a}
                    </span>
                  );
                })}
              </div>
            </motion.div>

            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-foreground">Seasonal Pricing</h2>
                <button className="text-sm text-primary font-medium hover:underline flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add Rule</button>
              </div>
              {pricing.length === 0 ? (
                <p className="text-sm text-muted-foreground">No seasonal pricing rules set.</p>
              ) : (
                <div className="space-y-3">
                  {pricing.map((o) => (
                    <div key={o.id} className="flex items-center justify-between p-3 bg-muted rounded-lg hover:bg-accent transition-colors">
                      <div>
                        <p className="text-sm font-medium text-foreground">{o.label}</p>
                        <p className="text-xs text-muted-foreground">{o.start_date} → {o.end_date}</p>
                      </div>
                      <span className="text-sm font-semibold text-primary tabular-nums">{formatIDR(o.rate)}/night</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>

          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4 md:space-y-6">
            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4">Details</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Base Price</span><span className="font-semibold text-foreground tabular-nums">{formatIDR(roomType.base_rate)}/night</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Max Occupancy</span><span className="font-medium text-foreground">{roomType.max_occupancy} guests</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total Rooms</span><span className="font-medium text-foreground">{rooms.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Slug</span><span className="font-mono text-xs text-muted-foreground">{roomType.slug}</span></div>
              </div>
            </motion.div>

            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4">Rooms ({rooms.length})</h2>
              {rooms.length === 0 ? (
                <p className="text-sm text-muted-foreground">No rooms added yet.</p>
              ) : (
                <div className="space-y-2">
                  {rooms.map((r) => (
                    <div key={r.id} className="flex items-center justify-between p-2.5 bg-muted rounded-lg hover:bg-accent transition-colors">
                      <div>
                        <span className="text-sm font-medium text-foreground">Room {r.number}</span>
                        <span className="text-xs text-muted-foreground ml-2">Floor {r.floor}</span>
                      </div>
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", r.is_active ? "bg-secondary text-secondary-foreground" : "badge-destructive")}>
                        {r.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <button className="mt-3 w-full flex items-center justify-center gap-1.5 text-sm text-primary font-medium hover:underline">
                <Plus className="w-3.5 h-3.5" /> Add Room
              </button>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
