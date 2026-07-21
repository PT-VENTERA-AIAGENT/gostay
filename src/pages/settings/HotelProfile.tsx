import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { Building2, Loader2, Save, Upload, Trash2, ImageIcon } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { useTenant, useUpdateHotelProfile, uploadHotelLogo, type HotelProfileInput } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";

const empty = { name: "", address: "", phone: "", email: "", description: "", logo_url: "" };

export default function HotelProfile() {
  const t = useT();
  const { tenant, isLoading } = useTenant();
  const update = useUpdateHotelProfile();
  const { toast } = useToast();

  const [form, setForm] = useState(empty);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Hydrate once the tenant loads; nulls become empty strings for the inputs.
  useEffect(() => {
    if (tenant) {
      setForm({
        name: tenant.name ?? "",
        address: tenant.address ?? "",
        phone: tenant.phone ?? "",
        email: tenant.email ?? "",
        description: tenant.description ?? "",
        logo_url: tenant.logo_url ?? "",
      });
    }
  }, [tenant]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onLogoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file || !tenant) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "File harus berupa gambar", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Ukuran logo maksimal 2 MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const url = await uploadHotelLogo(tenant.id, file);
      setForm((f) => ({ ...f, logo_url: url }));
      toast({ title: "Logo terunggah", description: "Klik Simpan untuk menyimpan perubahan." });
    } catch (err) {
      toast({ title: "Gagal mengunggah logo", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  const save = () => {
    if (!tenant) return;
    if (!form.name.trim()) {
      toast({ title: "Nama hotel wajib diisi", variant: "destructive" });
      return;
    }
    // Empty strings are stored as NULL so the fields read as "unset", not "".
    const clean = (v: string) => (v.trim() ? v.trim() : null);
    const input: HotelProfileInput = {
      name: form.name.trim(),
      address: clean(form.address),
      phone: clean(form.phone),
      email: clean(form.email),
      description: clean(form.description),
      logo_url: clean(form.logo_url),
    };
    update.mutate(
      { id: tenant.id, input },
      {
        onSuccess: () => toast({ title: "Profil hotel disimpan" }),
        onError: (e) => toast({ title: "Gagal menyimpan", description: (e as Error).message, variant: "destructive" }),
      },
    );
  };

  const inputCls = "w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <PageTransition>
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-6 h-6 text-primary" />
          <h1 className="text-xl md:text-2xl font-bold text-foreground">{t("Profil Hotel")}</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          {t("Identitas hotelmu — dipakai di seluruh aplikasi dan halaman portal tamu.")}
        </p>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="bg-card rounded-xl border border-border p-4 md:p-6 space-y-4">
            <Field label={t("Nama hotel")} required>
              <input className={inputCls} value={form.name} onChange={set("name")} placeholder={t("mis. Nama Hotel")} />
            </Field>
            <Field label={t("Deskripsi singkat")}>
              <textarea className={`${inputCls} resize-none`} rows={3} value={form.description} onChange={set("description")} placeholder={t("Ceritakan singkat tentang hotelmu…")} />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label={t("Telepon")}>
                <input className={inputCls} value={form.phone} onChange={set("phone")} placeholder="+62 21 1234 5678" />
              </Field>
              <Field label={t("Email")}>
                <input className={inputCls} type="email" value={form.email} onChange={set("email")} placeholder="info@hotel.id" />
              </Field>
            </div>
            <Field label={t("Alamat")}>
              <input className={inputCls} value={form.address} onChange={set("address")} placeholder="Jl. …, Kota" />
            </Field>
            <div className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">{t("Logo hotel (opsional)")}</span>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl border border-border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
                  {form.logo_url ? (
                    <img src={form.logo_url} alt="Logo hotel" className="w-full h-full object-contain" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onLogoPick} />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 text-sm font-medium border border-input px-3 py-2 rounded-lg text-foreground hover:bg-muted transition-colors disabled:opacity-60"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {form.logo_url ? "Ganti logo" : "Unggah logo"}
                  </button>
                  {form.logo_url && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, logo_url: "" }))}
                      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive px-2 py-2 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" /> {t("Hapus")}
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("PNG atau JPG, maks 2 MB.")}</p>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={save}
                disabled={update.isPending}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {update.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t("Simpan")}
              </button>
              <p className="text-xs text-muted-foreground">
                {t("Slug & status hotel dikelola operator (Ventera).")}
              </p>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">
        {label}{required && <span className="text-destructive"> *</span>}
      </span>
      {children}
    </label>
  );
}
