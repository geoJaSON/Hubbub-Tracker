import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetUnreadCount,
  useListNotifications,
  useMarkNotificationsRead,
  getGetUnreadCountQueryKey,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import type { Notification } from "@workspace/api-client-react";
import { Bell } from "lucide-react";

function payloadOf(n: Notification): Record<string, unknown> {
  return (n.payload ?? {}) as Record<string, unknown>;
}

function notifLabel(n: Notification): string {
  const p = payloadOf(n);
  const num = p.itemNumber as number | undefined;
  switch (n.type) {
    case "mention":
      return num ? `mentioned you on #${num}` : "mentioned you in chat";
    case "assigned":
      return `assigned you #${num}${p.title ? ` — ${p.title}` : ""}`;
    case "status_changed":
      return `#${num} → ${p.status ?? ""}`;
    case "comment_on_watched":
      return `new comment on #${num}`;
    default:
      return "notification";
  }
}

function notifHref(n: Notification): string | null {
  const p = payloadOf(n);
  const slug = p.slug as string | undefined;
  const num = p.itemNumber as number | undefined;
  if (!slug) return null;
  return num ? `/projects/${slug}/items/${num}` : `/projects/${slug}?tab=chat`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data: unread } = useGetUnreadCount({
    query: { queryKey: getGetUnreadCountQueryKey(), refetchInterval: 30000 },
  });
  const { data: notifications = [] } = useListNotifications(
    { limit: 20 },
    {
      query: {
        queryKey: getListNotificationsQueryKey({ limit: 20 }),
        enabled: open,
      },
    },
  );
  const markRead = useMarkNotificationsRead();
  const count = unread?.count ?? 0;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && count > 0) {
      await markRead.mutateAsync({ data: { all: true } });
      qc.invalidateQueries({ queryKey: getGetUnreadCountQueryKey() });
      qc.invalidateQueries({ queryKey: getListNotificationsQueryKey({ limit: 20 }) });
    }
  }

  function go(n: Notification) {
    const href = notifHref(n);
    setOpen(false);
    if (href) navigate(href);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        className="relative text-muted-foreground hover:text-foreground"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-background">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-auto border border-border bg-card shadow-lg">
            <div className="border-b border-border px-3 py-2 text-xs font-mono tracking-widest text-muted-foreground">
              // NOTIFICATIONS
            </div>
            {notifications.length === 0 ? (
              <p className="px-3 py-4 text-xs font-mono text-muted-foreground">
                no notifications
              </p>
            ) : (
              <ul>
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => go(n)}
                      className={`block w-full border-b border-border/50 px-3 py-2 text-left text-xs font-mono hover:bg-muted/40 ${
                        n.readAt ? "text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      <div>{notifLabel(n)}</div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(n.createdAt).toLocaleString()}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
