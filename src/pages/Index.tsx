import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import StatCards from "@/components/dashboard/StatCards";
import RoomAvailability from "@/components/dashboard/RoomAvailability";
import RevenueChart from "@/components/dashboard/RevenueChart";
import ReservationsChart from "@/components/dashboard/ReservationsChart";
import BookingByPlatform from "@/components/dashboard/BookingByPlatform";
import BookingList from "@/components/dashboard/BookingList";
import OverallRating from "@/components/dashboard/OverallRating";
import TasksPanel from "@/components/dashboard/TasksPanel";
import RecentActivities from "@/components/dashboard/RecentActivities";

export default function Index() {
  return (
    <PageTransition>
      <div className="flex flex-col lg:flex-row flex-1 gap-6 p-4 md:p-6 overflow-auto">
        {/* Main content */}
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex-1 flex flex-col gap-6 min-w-0">
          <motion.div variants={staggerItem}><StatCards /></motion.div>
          <motion.div variants={staggerItem} className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2"><RoomAvailability /></div>
            <div className="lg:col-span-3"><RevenueChart /></div>
          </motion.div>
          <motion.div variants={staggerItem} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ReservationsChart />
            <BookingByPlatform />
          </motion.div>
          <motion.div variants={staggerItem}><BookingList /></motion.div>
        </motion.div>

        {/* Right sidebar */}
        <motion.div
          variants={staggerContainer} initial="hidden" animate="show"
          className="w-full lg:w-72 shrink-0 flex flex-col gap-6"
        >
          <motion.div variants={staggerItem}><OverallRating /></motion.div>
          <motion.div variants={staggerItem}><TasksPanel /></motion.div>
          <motion.div variants={staggerItem}><RecentActivities /></motion.div>
        </motion.div>
      </div>
    </PageTransition>
  );
}
