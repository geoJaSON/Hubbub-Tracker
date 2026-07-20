type BurnDownItem = {
  status: string;
  createdAt: string | Date;
  closedAt?: string | Date | null;
};

export type BurnDownPoint = {
  date: string;
  open: number;
};

const CLOSED_STATUSES = new Set(["done", "cancelled"]);

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function formatLocalDate(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

export function buildItemBurnDown(
  items: BurnDownItem[],
  now = new Date(),
  maxDays = 90,
): { points: BurnDownPoint[]; cappedAt90: boolean } {
  if (items.length === 0 || maxDays < 1) {
    return { points: [], cappedAt90: false };
  }

  const firstCreatedAt = items.reduce(
    (earliest, item) => Math.min(earliest, new Date(item.createdAt).getTime()),
    Number.POSITIVE_INFINITY,
  );
  const firstDay = startOfLocalDay(new Date(firstCreatedAt));
  const today = startOfLocalDay(now);
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - (maxDays - 1));

  const cappedAt90 = firstDay.getTime() < windowStart.getTime();
  const cursor = new Date(cappedAt90 ? windowStart : firstDay);
  const points: BurnDownPoint[] = [];

  while (cursor.getTime() <= today.getTime()) {
    const isToday = cursor.getTime() === today.getTime();
    const nextDay = new Date(cursor);
    nextDay.setDate(nextDay.getDate() + 1);
    const asOfMs = isToday ? now.getTime() : nextDay.getTime() - 1;

    const open = isToday
      ? items.filter((item) => !CLOSED_STATUSES.has(item.status)).length
      : items.filter((item) => {
          const createdAt = new Date(item.createdAt).getTime();
          const closedAt = item.closedAt
            ? new Date(item.closedAt).getTime()
            : null;
          return (
            createdAt <= asOfMs && (closedAt === null || closedAt > asOfMs)
          );
        }).length;

    points.push({ date: formatLocalDate(cursor), open });
    cursor.setDate(cursor.getDate() + 1);
  }

  return { points, cappedAt90 };
}
