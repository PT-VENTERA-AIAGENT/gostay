import { Link } from "react-router-dom";
import { Search, Star, Wifi, Wind, Tv, Coffee, Bath, Mountain, Users, MapPin, ArrowRight } from "lucide-react";

const featuredRooms = [
  { slug: "standard", name: "Standard Room", price: 850000, image: null, rating: 4.5, reviews: 128, description: "Comfortable room with essential amenities for a pleasant stay.", amenities: ["WiFi", "AC", "TV"], maxGuests: 2, size: "28 m²" },
  { slug: "deluxe", name: "Deluxe Room", price: 1250000, image: null, rating: 4.7, reviews: 95, description: "Spacious room with premium amenities and city views.", amenities: ["WiFi", "AC", "TV", "Mini Bar"], maxGuests: 3, size: "38 m²" },
  { slug: "suite", name: "Suite", price: 2500000, image: null, rating: 4.9, reviews: 42, description: "Luxurious suite with separate living area and stunning sea views.", amenities: ["WiFi", "AC", "TV", "Mini Bar", "Bathtub", "Sea View"], maxGuests: 4, size: "55 m²" },
  { slug: "family", name: "Family Room", price: 1800000, image: null, rating: 4.6, reviews: 67, description: "Perfect for families with extra space and kid-friendly amenities.", amenities: ["WiFi", "AC", "TV", "Mini Bar"], maxGuests: 5, size: "48 m²" },
];

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

export default function PortalHome() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-primary/5 px-8 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl font-bold text-foreground mb-3">Find Your Perfect Stay</h1>
          <p className="text-lg text-muted-foreground mb-8">Discover comfort and luxury at BookMe Hotel. Book directly for the best rates.</p>

          <div className="bg-card rounded-2xl border border-border p-6 shadow-sm max-w-3xl mx-auto">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Check-in</label>
                <input type="date" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Check-out</label>
                <input type="date" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Guests</label>
                <select className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option>1 Guest</option>
                  <option>2 Guests</option>
                  <option>3 Guests</option>
                  <option>4 Guests</option>
                  <option>5+ Guests</option>
                </select>
              </div>
              <div className="flex items-end">
                <button className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
                  <Search className="w-4 h-4" /> Search
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Rooms */}
      <section className="px-8 py-12 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Our Rooms</h2>
            <p className="text-sm text-muted-foreground mt-1">Choose from our carefully designed room types</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {featuredRooms.map((room) => (
            <Link
              key={room.slug}
              to={`/portal/rooms/${room.slug}`}
              className="bg-card rounded-xl border border-border overflow-hidden hover:shadow-lg transition-shadow group"
            >
              <div className="aspect-[16/9] bg-muted flex items-center justify-center text-muted-foreground text-sm">
                Room Photo
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">{room.name}</h3>
                  <div className="flex items-center gap-1 text-sm">
                    <Star className="w-4 h-4 text-warning fill-warning" />
                    <span className="font-medium text-foreground">{room.rating}</span>
                    <span className="text-muted-foreground">({room.reviews})</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{room.description}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {room.maxGuests} guests</span>
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {room.size}</span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-lg font-bold text-primary">{formatIDR(room.price)} <span className="text-xs font-normal text-muted-foreground">/ night</span></p>
                  <span className="text-sm text-primary font-medium flex items-center gap-1">
                    Book Now <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Hotel Info */}
      <section className="px-8 py-12 bg-card border-t border-border">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-foreground mb-3">About BookMe Hotel</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Located in the heart of the city, BookMe Hotel offers world-class hospitality with modern amenities. 
            Whether you're traveling for business or leisure, we ensure a memorable stay with personalized service 
            and attention to detail.
          </p>
        </div>
      </section>
    </div>
  );
}
