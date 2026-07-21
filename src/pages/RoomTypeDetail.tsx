import { Link, useParams, useNavigate } from "react-router-dom";
import { useRef, useState } from "react";
import { ArrowLeft, Edit, Trash2, Wifi, Wind, Tv, Coffee, Bath, Mountain, Plus, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import { supabase } from "@/lib/supabase";
import { getSeasonalPricing, deleteSeasonalPricing } from "@/services/roomService";
import { useDeleteRoomType, useUpdateRoomType } from "@/hooks/useRooms";
import { useToast } from "@/hooks/use-toast";
import RoomTypeFormDialog from "@/components/rooms/RoomTypeFormDialog";
import RoomFormDialog from "@/components/rooms/RoomFormDialog";
import SeasonalPricingDialog from "@/components/rooms/SeasonalPricingDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { RoomType, Room, SeasonalPricing } from "@/types/database.types";

const amenityIcons: Record<string, React.ElementType> = {
  WiFi: Wifi, AC: Wind, TV: Tv, "Mini Bar": Coffee, Bathtub: Bath, "Sea View": Mountain,
};

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

export default function RoomTypeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [editOpen, setEditOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const deleteType = useDeleteRoomType();
  const updateType = useUpdateRoomType();

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

  const removePricing = useMutation({
    mutationFn: (pid: string) => deleteSeasonalPricing(pid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seasonal-pricing", id] }),
  });

  async function handleDelete() {
    try {
      await deleteType.mutateAsync(id!);
      toast({ title: "Tipe kamar dinonaktifkan", description: roomType?.name });
      navigate("/rooms/types");
    } catch (e) {
      toast({ title: "Gagal menghapus", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file || !roomType) return;
    setUploadError(null);
    setUploading(true);
    try {
      const path = `${roomType.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("room-photos").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("room-photos").getPublicUrl(path);
      await updateType.mutateAsync({ id: roomType.id, payload: { photos: [...roomType.photos, pub.publicUrl] } });
      qc.invalidateQueries({ queryKey: ["room-types", id] });
      toast({ title: "Foto diunggah" });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Gagal mengunggah foto.");
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto(url: string) {
    if (!roomType) return;
    try {
      await updateType.mutateAsync({ id: roomType.id, payload: { photos: roomType.photos.filter((p) => p !== url) } });
      qc.invalidateQueries({ queryKey: ["room-types", id] });
    } catch (e) {
      toast({ title: "Gagal menghapus foto", variant: "destructive" });
    }
  }

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
            <button onClick={() => setEditOpen(true)} className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors btn-press">
              <Edit className="w-4 h-4" /> <span className="hidden sm:inline">Edit</span>
            </button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-lg border border-destructive bg-card text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors btn-press">
                  <Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">Delete</span>
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Nonaktifkan {roomType.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tipe kamar disembunyikan dari portal dan tidak bisa dipesan lagi. Riwayat booking tetap aman.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Nonaktifkan</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="lg:col-span-2 space-y-4 md:space-y-6">
            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-foreground">Photos</h2>
                <button onClick={() => fileRef.current?.click()} disabled={uploading} className="text-sm text-primary font-medium hover:underline flex items-center gap-1 disabled:opacity-50">
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Upload
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
              </div>
              {uploadError && <div className="mb-3 bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 text-sm text-destructive">{uploadError}</div>}
              {roomType.photos.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {roomType.photos.map((url, i) => (
                    <div key={i} className="relative aspect-[4/3] bg-muted rounded-lg overflow-hidden group">
                      <img src={url} alt={`${roomType.name} ${i + 1}`} className="w-full h-full object-cover" />
                      <button onClick={() => removePhoto(url)} aria-label="Hapus foto" className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">Belum ada foto. Klik Upload untuk menambah.</div>
              )}
            </motion.div>

            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-3">Description</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{roomType.description ?? "No description set."}</p>
            </motion.div>

            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-3">Amenities</h2>
              <div className="flex flex-wrap gap-2">
                {roomType.amenities.length === 0 && <p className="text-sm text-muted-foreground">Belum ada fasilitas.</p>}
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
                <button onClick={() => setPricingOpen(true)} className="text-sm text-primary font-medium hover:underline flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add Rule</button>
              </div>
              {pricing.length === 0 ? (
                <p className="text-sm text-muted-foreground">No seasonal pricing rules set.</p>
              ) : (
                <div className="space-y-3">
                  {pricing.map((o) => (
                    <div key={o.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-foreground">{o.label}</p>
                        <p className="text-xs text-muted-foreground">{o.start_date} → {o.end_date}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-primary tabular-nums">{formatIDR(o.rate)}/night</span>
                        <button onClick={() => removePricing.mutate(o.id)} disabled={removePricing.isPending} aria-label="Hapus aturan" className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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
                    <div key={r.id} className="flex items-center justify-between p-2.5 bg-muted rounded-lg">
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
              <button onClick={() => setRoomOpen(true)} className="mt-3 w-full flex items-center justify-center gap-1.5 text-sm text-primary font-medium hover:underline">
                <Plus className="w-3.5 h-3.5" /> Add Room
              </button>
            </motion.div>
          </motion.div>
        </div>

        <RoomTypeFormDialog open={editOpen} onOpenChange={setEditOpen} roomType={roomType} />
        <RoomFormDialog open={roomOpen} onOpenChange={setRoomOpen} defaultTypeId={roomType.id} />
        <SeasonalPricingDialog open={pricingOpen} onOpenChange={setPricingOpen} roomTypeId={roomType.id} />
      </div>
    </PageTransition>
  );
}
