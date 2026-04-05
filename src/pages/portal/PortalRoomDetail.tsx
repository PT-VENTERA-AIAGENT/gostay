import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Star, Users, MapPin, Wifi, Wind, Tv, Coffee, Bath, Mountain, Check } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/shared/PageTransition";

const amenityIcons: Record<string, React.ElementType> = { WiFi: Wifi, AC: Wind, TV: Tv, "Mini Bar": Coffee, Bathtub: Bath, "Sea View": Mountain };
const room = { slug: "deluxe", name: "Deluxe Room", description: "Our Deluxe Room offers a spacious 38 m² of elegantly designed living space with a comfortable king-size bed, modern amenities, and stunning city views.", price: 1250000, rating: 4.7, reviews: 95, maxGuests: 3, size: "38 m²", bedType: "King", amenities: ["WiFi", "AC", "TV", "Mini Bar", "Bathtub", "Sea View", "Room Service", "Safe Box", "Iron"], policies: ["Check-in: 2:00 PM", "Check-out: 12:00 PM", "Free cancellation up to 48 hours before check-in", "No smoking"] };
function formatIDR(n: number) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n); }

export default function PortalRoomDetail() {
  const { slug } = useParams();
  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-6 md:space-y-8">
        <Link to="/portal" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-4 h-4" /> Back to rooms</Link>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 rounded-xl overflow-hidden">
          <div className="col-span-2 row-span-2 aspect-[4/3] bg-muted flex items-center justify-center text-muted-foreground">Main Photo</div>
          {[1,2,3,4].map((i) => <div key={i} className="aspect-[4/3] bg-muted flex items-center justify-center text-muted-foreground text-sm hidden md:flex">Photo {i}</div>)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">{room.name}</h1>
                <div className="flex items-center gap-1"><Star className="w-5 h-5 text-warning fill-warning" /><span className="font-semibold text-foreground">{room.rating}</span><span className="text-muted-foreground">({room.reviews} reviews)</span></div>
              </div>
              <div className="flex items-center gap-3 md:gap-4 text-sm text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><Users className="w-4 h-4" /> Up to {room.maxGuests} guests</span>
                <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {room.size}</span>
                <span>{room.bedType} Bed</span>
              </div>
            </div>
            <div><h2 className="text-lg font-semibold text-foreground mb-3">About this room</h2><p className="text-sm text-muted-foreground leading-relaxed">{room.description}</p></div>
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-3">Amenities</h2>
              <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {room.amenities.map((a) => { const Icon = amenityIcons[a] || Check; return (<motion.div key={a} variants={staggerItem} className="flex items-center gap-2 text-sm text-foreground"><Icon className="w-4 h-4 text-primary" /> {a}</motion.div>); })}
              </motion.div>
            </div>
            <div><h2 className="text-lg font-semibold text-foreground mb-3">Policies</h2><ul className="space-y-2">{room.policies.map((p, i) => <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground"><Check className="w-4 h-4 text-success" /> {p}</li>)}</ul></div>
          </div>
          <div>
            <div className="bg-card rounded-xl border border-border p-5 sticky top-6">
              <p className="text-2xl font-bold text-primary mb-1">{formatIDR(room.price)}</p>
              <p className="text-sm text-muted-foreground mb-5">per night</p>
              <div className="space-y-3 mb-5">
                <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Check-in</label><input type="date" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
                <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Check-out</label><input type="date" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
                <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Guests</label><select className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"><option>1 Guest</option><option>2 Guests</option><option>3 Guests</option></select></div>
              </div>
              <Link to="/portal/book/details" className="block w-full bg-primary text-primary-foreground py-3 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity text-center">Book Now</Link>
              <div className="mt-4 pt-4 border-t border-border space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">3 nights × {formatIDR(room.price)}</span><span className="font-medium text-foreground">{formatIDR(room.price * 3)}</span></div>
                <div className="flex justify-between font-semibold"><span className="text-foreground">Total</span><span className="text-primary">{formatIDR(room.price * 3)}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
