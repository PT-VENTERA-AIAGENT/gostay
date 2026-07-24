import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";
import { signedAttachmentUrl } from "@/services/chatService";
import { cn } from "@/lib/utils";

/**
 * Renders a chat attachment from `chat_messages.attachment_url`.
 *
 * The bucket is private since migration 034 — an attachment used to be readable
 * by anyone holding (or guessing, via list()) its public CDN URL, across every
 * hotel. So the stored value is now an object path that has to be exchanged for
 * a short-lived signed URL, which only the thread's participants and their
 * hotel's staff are issued. Rows written before 034 hold a full public URL;
 * signedAttachmentUrl() accepts both.
 *
 * While the URL is being fetched — and if the caller is not allowed to read it —
 * the file name is shown as plain text rather than a broken image.
 */
export function ChatAttachment({
  value,
  name,
  onLight,
}: {
  /** chat_messages.attachment_url — an object path, or a legacy public URL. */
  value: string;
  /** chat_messages.content, which carries the original file name. */
  name: string;
  /** True when drawn on a coloured (primary) bubble, so the link stays legible. */
  onLight?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    signedAttachmentUrl(value).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [value]);

  const isImage = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(value);

  if (!url) {
    return (
      <span className={cn("flex items-center gap-1.5 text-sm mb-1 opacity-70")}>
        <Paperclip className="w-3.5 h-3.5" /> {name}
      </span>
    );
  }

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={name} className="rounded-lg max-h-48 mb-1.5 border border-black/5" />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn("flex items-center gap-1.5 text-sm underline mb-1", onLight ? "text-primary-foreground" : "text-primary")}
    >
      <Paperclip className="w-3.5 h-3.5" /> {name}
    </a>
  );
}
