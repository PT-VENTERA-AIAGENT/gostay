import { Link } from "react-router-dom";
import { Search, Star, Wifi, Wind, Tv, Coffee, Bath, Mountain, Users, MapPin, ArrowRight, Shield, Clock, CreditCard, Phone } from "lucide-react";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem, fadeInUp } from "@/components/shared/PageTransition";

const featuredRooms = [
  { slug: "standard", name: "Standard Room", price: 850000, rating: 4.5, reviews: 128, description: "Comfortable room with essential amenities for a pleasant stay.", amenities: ["WiFi", "AC", "TV"], maxGuests: 2, size: "28 m²", bedType: "Queen" },
  { slug: "deluxe", name: "Deluxe Room", price: 1250000, rating: 4.7, reviews: 95, description: "Spacious room with premium amenities and city views.", amenities: ["WiFi", "AC", "TV", "Mini Bar"], maxGuests: 3, size: "38 m²", bedType: "King" },
  { slug: "suite", name: "Suite", price: 2500000, rating: 4.9, reviews: 42, description: "Luxurious suite with separate living area and stunning sea views.", amenities: ["WiFi", "AC", "TV", "Mini Bar", "Bathtub", "Sea View"], maxGuests: 4, size: "55 m²", bedType: "King" },
  { slug: "family", name: "Family Room", price: 1800000, rating: 4.6, reviews: 67, description: "Perfect for families with extra space and kid-friendly amenities.", amenities: ["WiFi", "AC", "TV", "Mini Bar"], maxGuests: 5, size: "48 m²", bedType: "Twin + Sofa" },
  { slug: "presidential", name: "Presidential Suite", price: 5000000, rating: 5.0, reviews: 18, description: "The ultimate luxury experience with panoramic views and private butler service.", amenities: ["WiFi", "AC", "TV", "Mini Bar", "Bathtub", "Sea View"], maxGuests: 4, size: "90 m²", bedType: "King" },
];

const amenityIcons: Record<string, React.ElementType> = { WiFi: Wifi, AC: Wind, TV: Tv, "Mini Bar": Coffee, Bathtub: Bath, "Sea View": Mountain };

const reviews = [
  { name: "Sarah K.", rating: 5, text: "Absolutely wonderful stay! The staff was incredibly attentive and the room was spotless.", date: "Mar 2026" },
  { name: "Michael T.", rating: 5, text: "Best hotel in the city. The sea view from the suite was breathtaking.", date: "Feb 2026" },
  { name: "Lisa W.", rating: 4, text: "Great location and amenities. Will definitely come back!", date: "Jan 2026" },
];

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

export default function PortalHome() {
  return (
    <PageTransition>
      <div>
        {/* Hero */}
        <section className="relative bg-primary/5 px-4 md:px-8 py-12 md:py-20">
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="max-w-4xl mx-auto text-center">
            <motion.div variants={staggerItem} className="inline-flex items-center gap-2 bg-card border border-border rounded-full px-4 py-1.5 text-sm text-muted-foreground mb-4 md:mb-6">
              <Star className="w-4 h-4 text-warning fill-warning" />
              <span>Rated 4.8/5 by 350+ guests</span>
            </motion.div>
            <motion.h1 variants={staggerItem} className="text-3xl md:text-5xl font-bold text-foreground mb-3 md:mb-4 leading-tight">Find Your Perfect<br />Stay at BookMe Hotel</motion.h1>
            <motion.p variants={staggerItem} className="text-base md:text-lg text-muted-foreground mb-6 md:mb-10 max-w-2xl mx-auto">Discover comfort and luxury in the heart of the city. Book directly for the best rates and exclusive perks.</motion.p>

            <motion.div variants={staggerItem} className="bg-card rounded-2xl border border-border p-4 md:p-6 shadow-sm max-w-3xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block text-left">Check-in</label><input type="date" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
                <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block text-left">Check-out</label><input type="date" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
                <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block text-left">Guests</label><select className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"><option>1 Guest</option><option>2 Guests</option><option>3 Guests</option><option>4 Guests</option><option>5+ Guests</option></select></div>
                <div className="flex items-end"><button className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"><Search className="w-4 h-4" /> Search</button></div>
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* Why Book Direct */}
        <section className="px-4 md:px-8 py-8 md:py-12 max-w-6xl mx-auto">
          <motion.div variants={staggerContainer} initial="hidden" whileInView="show" viewport={{ once: true }} className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {[
              { icon: CreditCard, title: "Best Price Guarantee", desc: "Book direct and get the lowest rate guaranteed" },
              { icon: Shield, title: "Free Cancellation", desc: "Cancel up to 48 hours before check-in" },
              { icon: Clock, title: "Instant Confirmation", desc: "Get your booking confirmed immediately" },
              { icon: Phone, title: "24/7 Support", desc: "Our team is always here to help you" },
            ].map((item) => (
              <motion.div key={item.title} variants={staggerItem} whileHover={{ y: -4, transition: { duration: 0.2 } }} className="text-center p-4 rounded-xl hover:bg-card hover:shadow-sm transition-all cursor-default">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3"><item.icon className="w-6 h-6 text-primary" /></div>
                <h3 className="font-semibold text-foreground text-sm mb-1">{item.title}</h3>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* Featured Rooms */}
        <section className="px-4 md:px-8 py-8 md:py-12 max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6 md:mb-8">
            <div><h2 className="text-xl md:text-2xl font-bold text-foreground">Our Rooms</h2><p className="text-sm text-muted-foreground mt-1">Choose from our carefully designed room types</p></div>
          </div>

          <motion.div variants={staggerContainer} initial="hidden" whileInView="show" viewport={{ once: true }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {featuredRooms.map((room) => (
              <motion.div key={room.slug} variants={staggerItem} whileHover={{ y: -6, transition: { duration: 0.2 } }}>
                <Link to={`/portal/rooms/${room.slug}`} className="block bg-card rounded-xl border border-border overflow-hidden hover:shadow-lg transition-shadow group">
                  <div className="aspect-[16/9] bg-muted flex items-center justify-center text-muted-foreground text-sm relative">Room Photo<span className="absolute top-3 right-3 bg-card/90 backdrop-blur text-xs font-medium px-2.5 py-1 rounded-full text-foreground border border-border">{room.bedType}</span></div>
                  <div className="p-4 md:p-5">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-base md:text-lg font-semibold text-foreground group-hover:text-primary transition-colors">{room.name}</h3>
                      <div className="flex items-center gap-1 text-sm shrink-0"><Star className="w-4 h-4 text-warning fill-warning" /><span className="font-medium text-foreground">{room.rating}</span></div>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{room.description}</p>
                    <div className="flex items-center gap-2 md:gap-3 text-xs text-muted-foreground mb-3 flex-wrap">
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {room.maxGuests}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {room.size}</span>
                      <span>({room.reviews} reviews)</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {room.amenities.slice(0, 3).map((a) => { const Icon = amenityIcons[a]; return (<span key={a} className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-md">{Icon && <Icon className="w-3 h-3" />} {a}</span>); })}
                      {room.amenities.length > 3 && <span className="text-xs text-muted-foreground px-1">+{room.amenities.length - 3}</span>}
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <p className="text-base md:text-lg font-bold text-primary">{formatIDR(room.price)} <span className="text-xs font-normal text-muted-foreground">/ night</span></p>
                      <span className="text-sm text-primary font-medium flex items-center gap-1">Book Now <ArrowRight className="w-4 h-4" /></span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* Reviews */}
        <section className="px-4 md:px-8 py-8 md:py-12 bg-muted/30">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-6 md:mb-8"><h2 className="text-xl md:text-2xl font-bold text-foreground">What Our Guests Say</h2><p className="text-sm text-muted-foreground mt-1">Real reviews from real guests</p></div>
            <motion.div variants={staggerContainer} initial="hidden" whileInView="show" viewport={{ once: true }} className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
              {reviews.map((r, i) => (
                <motion.div key={i} variants={staggerItem} className="bg-card rounded-xl border border-border p-5">
                  <div className="flex items-center gap-1 mb-3">{Array.from({ length: r.rating }).map((_, j) => <Star key={j} className="w-4 h-4 text-warning fill-warning" />)}</div>
                  <p className="text-sm text-foreground mb-3 leading-relaxed">"{r.text}"</p>
                  <div className="flex items-center justify-between"><span className="text-sm font-medium text-foreground">{r.name}</span><span className="text-xs text-muted-foreground">{r.date}</span></div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Hotel Info */}
        <section className="px-4 md:px-8 py-12 md:py-16 bg-card border-t border-border">
          <motion.div variants={fadeInUp} initial="hidden" whileInView="show" viewport={{ once: true }} className="max-w-4xl mx-auto text-center">
            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-3">About BookMe Hotel</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-8 text-sm md:text-base">Located in the heart of the city, BookMe Hotel offers world-class hospitality with modern amenities.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 max-w-2xl mx-auto">
              {[{ value: "43", label: "Rooms" }, { value: "4.8", label: "Rating" }, { value: "350+", label: "Reviews" }, { value: "5+", label: "Room Types" }].map((s) => (
                <div key={s.label}><p className="text-2xl md:text-3xl font-bold text-primary">{s.value}</p><p className="text-sm text-muted-foreground">{s.label}</p></div>
              ))}
            </div>
          </motion.div>
        </section>
      </div>
    </PageTransition>
  );
}
