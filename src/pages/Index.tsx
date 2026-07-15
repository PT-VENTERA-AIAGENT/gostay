import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import StatCards from "@/components/dashboard/StatCards";
import RoomAvailability from "@/components/dashboard/RoomAvailability";
import RevenueChart from "@/components/dashboard/RevenueChart";
import ReservationsChart from "@/components/dashboard/ReservationsChart";
import BookingByPlatform from "@/components/dashboard/BookingByPlatform";
import BookingList from "@/components/dashboard/BookingList";
import RecentActivities from "@/components/dashboard/RecentActivities";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useRooms } from "@/hooks/useRooms";

// OverallRating and TasksPanel used to sit in the right column. Both were
// removed rather than wired up: ratings need a `reviews` table and the tasks
// panel needs a `tasks` table, and the schema has neither — housekeeping task
// management is explicitly out of scope for v1 (PRD §1.4). Keeping them would
// have left two invented panels on an otherwise live dashboard.

export default function Index() {
  const { data, isLoading, error } = useAnalytics(30);
  const { data: rooms } = useRooms();

  if (isLoading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </PageTransition>
    );
  }

  if (error || !data) {
    return (
      <PageTransition>
        <div className="p-4 md:p-6">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
            <p className="text-sm text-destructive">
              Could not load the dashboard{error ? `: ${(error as Error).message}` : "."}
            </p>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="flex flex-col lg:flex-row flex-1 gap-6 p-4 md:p-6 overflow-auto">
        {/* Main content */}
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex-1 flex flex-col gap-6 min-w-0">
          <motion.div variants={staggerItem}><StatCards data={data} /></motion.div>
          <motion.div variants={staggerItem} className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2"><RoomAvailability rooms={rooms ?? []} /></div>
            <div className="lg:col-span-3"><RevenueChart monthly={data.monthlyRevenue} /></div>
          </motion.div>
          <motion.div variants={staggerItem} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ReservationsChart data={data.reservationsTrend} />
            <BookingByPlatform bySource={data.bySource} />
          </motion.div>
          <motion.div variants={staggerItem}><BookingList /></motion.div>
        </motion.div>

        {/* Right sidebar */}
        <motion.div
          variants={staggerContainer} initial="hidden" animate="show"
          className="w-full lg:w-72 shrink-0 flex flex-col gap-6"
        >
          <motion.div variants={staggerItem}><RecentActivities /></motion.div>
        </motion.div>
      </div>
    </PageTransition>
  );
}
