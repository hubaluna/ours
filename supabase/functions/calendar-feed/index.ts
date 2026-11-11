type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  time: string | null;
  all_day: boolean;
  location: string;
  description: string;
  url: string;
  created_at: string;
};

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function kyivTimeToUtc(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.slice(0, 5).split(":").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(localAsUtc));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const kyivAsUtc = Date.UTC(
    part("year"), part("month") - 1, part("day"),
    part("hour"), part("minute"), part("second"),
  );
  return new Date(localAsUtc - (kyivAsUtc - localAsUtc))
    .toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function ical(events: CalendarEvent[]) {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ours//Calendar//UK",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:ours.",
    "X-WR-TIMEZONE:Europe/Kyiv",
  ];
  for (const event of events) {
    lines.push("BEGIN:VEVENT", `UID:${event.id}@ours.app`);
    const stamp = new Date(event.created_at).toISOString()
      .replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    lines.push(`DTSTAMP:${stamp}`);
    if (event.all_day) {
      const next = new Date(`${event.date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${event.date.replace(/-/g, "")}`);
      lines.push(`DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, "")}`);
    } else {
      lines.push(`DTSTART:${kyivTimeToUtc(event.date, event.time || "00:00")}`);
    }
    lines.push(`SUMMARY:${escapeIcs(event.title)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeIcs(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
    if (event.url) lines.push(`URL:${event.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR", "");
  return lines.join("\r\n");
}

Deno.serve(async (request) => {
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    return new Response("Not found", { status: 404 });
  try {
    const projectUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const response = await fetch(`${projectUrl}/rest/v1/rpc/calendar_feed_events`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: token }),
    });
    if (!response.ok) return new Response("Calendar temporarily unavailable", { status: 503 });
    const data = await response.json() as CalendarEvent[];
    const body = ical((data ?? []) as CalendarEvent[]);
    return new Response(request.method === "HEAD" ? null : body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="ours.ics"',
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Calendar temporarily unavailable", { status: 503 });
  }
});
