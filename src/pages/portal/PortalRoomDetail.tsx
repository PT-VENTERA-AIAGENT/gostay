import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Star, Users, MapPin, Wifi, Wind, Tv, Coffee, Bath, Mountain, Check } from "lucide-react";

const amenityIcons: Record<string, React.ElementType> = { WiFi: Wifi, AC: Wind, TV: Tv, "Mini Bar": Coffee, Bathtub: Bath, "Sea View": Mountain };

const room = {
  slug: "deluxe",
  name: "Deluxe Room",
  description: "Our Deluxe Room offers a spacious 38 m² of elegantly designed living space with a comfortable king-size bed, modern amenities, and stunning city views. The room features a marble bathroom with rain shower, a work desk, and a cozy seating area perfect for relaxation. Wake up to natural light flooding through floor-to-ceiling windows and enjoy your morning coffee while taking in the panoramic cityscape.",
  price: 1250000,
  rating: 4.7,
  reviews: 95,
  maxGuests: 3,
  size: "38 m²",
  bedType: "King",
  amenities: ["WiFi", "AC", "TV", "Mini Bar", "Bathtub", "Sea View", "Room Service", "Safe Box", "Iron"],
  policies: ["Check-in: 2:00 PM", "Check-out: 12:00 PM", "Free cancellation up to 48 hours before check-in", "No smoking"],
};

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

export default function PortalRoomDetail() {
  const { slug } = useParams();

  return (
    <div className="max-w-6xl mx-auto px-8 py-8 space-y-8">
      <Link to="/portal" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to rooms
      </Link>

      {/* Gallery */}
      <div className="grid grid-cols-4 gap-3 rounded-xl overflow-hidden">
        <div className="col-span-2 row-span-2 aspect-[4/3] bg-muted flex items-center justify-center text-muted-foreground">Main Photo</div>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="aspect-[4/3] bg-muted flex items-center justify-center text-muted-foreground text-sm">Photo {i}</div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-8">
        {/* Main content */}
        <div className="col-span-2 space-y-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-foreground">{room.name}</h1>
              <div className="flex items-center gap-1">
                <Star className="w-5 h-5 text-warning fill-warning" />
                <span className="font-semibold text-foreground">{room.rating}</span>
                <span className="text-muted-foreground">({room.reviews} reviews)</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Users className="w-4 h-4" /> Up to {room.maxGuests} guests</span>
              <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {room.size}</span>
              <span>{room.bedType} Bed</span>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">About this room</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{room.description}</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">Amenities</h2>
            <div className="grid grid-cols-3 gap-3">
              {room.amenities.map((a) => {
                const Icon = amenityIcons[a] || Check;
                return (
                  <div key={a} className="flex items-center gap-2 text-sm text-foreground">
                    <Icon className="w-4 h-4 text-primary" /> {a}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">Policies</h2>
            <ul className="space-y-2">
              {room.policies.map((p, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 text-success" /> {p}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Booking card */}
        <div>
          <div className="bg-card rounded-xl border border-border p-5 sticky top-6">
            <p className="text-2xl font-bold text-primary mb-1">{formatIDR(room.price)}</p>
            <p className="text-sm text-muted-foreground mb-5">per night</p>

            <div className="space-y-3 mb-5">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Check-in</label>
                <input type="date" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Check-out</label>
                <input type="date" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Guests</label>
                <select className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option>1 Guest</option>
                  <option>2 Guests</option>
                  <option>3 Guests</option>
                </select>
              </div>
            </div>

            <Link to="/portal/book/details" className="block w-full bg-primary text-primary-foreground py-3 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity text-center">
              Book Now
            </Link>

            <div className="mt-4 pt-4 border-t border-border space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">3 nights × {formatIDR(room.price)}</span><span className="font-medium text-foreground">{formatIDR(room.price * 3)}</span></div>
              <div className="flex justify-between font-semibold"><span className="text-foreground">Total</span><span className="text-primary">{formatIDR(room.price * 3)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
