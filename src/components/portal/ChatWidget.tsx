import { MessageSquare } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Floating launcher for the real conversation at /portal/chat.
 *
 * This used to be a chat panel in its own right, and it did not work: messages
 * went into local state and never reached chat_messages, then a setTimeout
 * faked a staff reply ("A team member will respond shortly") that nobody had
 * sent and nobody would ever read. A guest asking about a booking got a
 * convincing acknowledgement and silence.
 *
 * It is a link now rather than a second real chat: PortalChat already handles
 * thread creation, realtime subscription and the signed-out guest flow. A
 * second implementation of all that, mounted on every portal page, is a
 * synchronisation problem with nothing to gain — the widget's job is to get you
 * to the conversation, not to be one.
 */
export default function ChatWidget() {
  const location = useLocation();

  // Hiding on the chat page itself: a button that reloads the page you are
  // already looking at reads as broken.
  const onChatPage = location.pathname.startsWith("/portal/chat");

  return (
    <AnimatePresence>
      {!onChatPage && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0 }}
          className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50"
        >
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Link
              to="/portal/chat"
              aria-label="Chat with the hotel"
              className="w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center"
            >
              <MessageSquare className="w-6 h-6" />
            </Link>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
