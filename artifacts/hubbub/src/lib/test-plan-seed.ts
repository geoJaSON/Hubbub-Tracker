// AUTO-GENERATED from mobile-test-plan.html — the starter "Field App" manual
// test plan. Imported on demand from the Testing tab's empty state; edit there,
// not here. Regenerate with `node scripts/gen-seed.mjs` if the source changes.
import type { TestPlanImport } from "./api";

export const MOBILE_TEST_PLAN: TestPlanImport = {
  "suites": [
    {
      "code": "A",
      "title": "Account & identity lifecycle",
      "warn": false,
      "cases": [
        {
          "code": "A1",
          "title": "Create & log in each account type: crew_member, roe_manager, safety_inspector",
          "expected": "crew/roe_manager → crew home; inspector → inspector home",
          "owner": "You"
        },
        {
          "code": "A2",
          "title": "Log in as unsupported role (sub_admin, primary_*)",
          "expected": "Routed to /use-the-portal, not crew screens",
          "owner": "You"
        },
        {
          "code": "A3",
          "title": "Account exists but onboarding incomplete",
          "expected": "Routed to /onboarding-incomplete",
          "owner": "You"
        },
        {
          "code": "A4",
          "title": "Password change from portal while crew logged in",
          "expected": "Old session works until refresh, then forces re-login; no silent 401 loop",
          "owner": "Both"
        },
        {
          "code": "A5",
          "title": "Password reset (forgot password) end-to-end",
          "expected": "New password works; old one rejected",
          "owner": "You"
        },
        {
          "code": "A6",
          "title": "Crew moves to a different company — log in after",
          "expected": "Sees only new company's WOs; roster cache refreshes (not stale)",
          "owner": "Both"
        },
        {
          "code": "A7",
          "title": "Crew moves companies while holding unsynced work for old company",
          "expected": "Decide intended behavior: flush under old scope vs orphaned (tenant-isolation risk)",
          "owner": "Both"
        },
        {
          "code": "A8",
          "title": "Account deactivated/suspended mid-session",
          "expected": "Next /api/me or sync 401/403 → involuntary sign-out, photos preserved",
          "owner": "Both"
        },
        {
          "code": "A9",
          "title": "Role changed mid-session (crew_member → roe_manager)",
          "expected": "New permissions on next boot; no stuck UI",
          "owner": "Both"
        },
        {
          "code": "A10",
          "title": "Same person, two devices — submit on #1, open WO on #2",
          "expected": "No duplicate work record; #2 reflects submitted state after refresh",
          "owner": "You"
        }
      ]
    },
    {
      "code": "B",
      "title": "Auth & session",
      "warn": false,
      "cases": [
        {
          "code": "B1",
          "title": "Login with wrong password",
          "expected": "Clear error, no crash",
          "owner": "You"
        },
        {
          "code": "B2",
          "title": "Login with no network",
          "expected": "Graceful offline message, not a hang",
          "owner": "You"
        },
        {
          "code": "B3",
          "title": "Token expiry while online",
          "expected": "Supabase auto-refreshes silently; user notices nothing",
          "owner": "You"
        },
        {
          "code": "B4",
          "title": "Token expiry while offline, within 24h grace",
          "expected": "Boots on cached identity, 'server unreachable' banner, sync gated off",
          "owner": "Both"
        },
        {
          "code": "B5",
          "title": "Offline beyond 24h grace → relaunch",
          "expected": "Forced to login even offline",
          "owner": "Both"
        },
        {
          "code": "B6",
          "title": "Reconnect after running on grace identity",
          "expected": "resync() re-verifies, clears banner — or signs out if token invalid",
          "owner": "Both"
        },
        {
          "code": "B7",
          "title": "Explicit sign-out with unsynced work",
          "expected": "Confirm dialog warns; 'Sync now' flushes first; cancel keeps work",
          "owner": "You"
        },
        {
          "code": "B8",
          "title": "Involuntary sign-out (token revoked) with unsynced work",
          "expected": "Photos+attendance+queue preserved; only identity caches cleared",
          "owner": "Both"
        },
        {
          "code": "B9",
          "title": "Shared device — user A out, user B in",
          "expected": "A's photos/attendance/outbox purged (multi-user barrier #216)",
          "owner": "You"
        },
        {
          "code": "B10",
          "title": "Shared device — A out, A back in (no B between)",
          "expected": "A's unsynced work still there",
          "owner": "You"
        }
      ]
    },
    {
      "code": "C",
      "title": "Connectivity & sync — interruption seams",
      "warn": true,
      "cases": [
        {
          "code": "C1",
          "title": "Full offline submit: airplane mode → check in → photos → submit",
          "expected": "All queued; banner shows pending; nothing lost",
          "owner": "You"
        },
        {
          "code": "C2",
          "title": "Offline submit → go online",
          "expected": "Flushes record→photos→attendance→done; record+photos land",
          "owner": "Both"
        },
        {
          "code": "C3",
          "title": "Cut off mid-record (drop net right after submit)",
          "expected": "Retries from record; server dedup on (deviceId, clientTempId) → no dup",
          "owner": "Both"
        },
        {
          "code": "C4",
          "title": "Cut off between record and photos",
          "expected": "Resumes at photos using saved workRecordId; no second record",
          "owner": "Both"
        },
        {
          "code": "C5",
          "title": "Cut off mid-photo upload (one of N done)",
          "expected": "Resumes; uploaded photos not re-sent; attempts reset per landed photo",
          "owner": "Both"
        },
        {
          "code": "C6",
          "title": "Cut off between photos and attendance",
          "expected": "Resumes at attendance; photos not re-uploaded",
          "owner": "Both"
        },
        {
          "code": "C7",
          "title": "attendance step returns 429/500",
          "expected": "Retries w/ backoff; does NOT lose completed record+photos",
          "owner": "Me"
        },
        {
          "code": "C8",
          "title": "attendance returns 409 (already checked in)",
          "expected": "Treated as success → done",
          "owner": "Me"
        },
        {
          "code": "C9",
          "title": "App killed mid-flush (in_flight, lease held)",
          "expected": "reclaimInFlight() re-queues after lease expiry; completes",
          "owner": "Both"
        },
        {
          "code": "C10",
          "title": "App killed mid-flush, then 8+ retry failures",
          "expected": "Row → failed (no relaunch loop), surfaces in Settings",
          "owner": "Me"
        },
        {
          "code": "C11",
          "title": "Backoff reset on reconnect: ~10 fails offline → reconnect",
          "expected": "flushNow() fires immediately on connectivity, not after long backoff",
          "owner": "Both"
        },
        {
          "code": "C12",
          "title": "Concurrent flush guard: spam 'Sync now' mid-flush",
          "expected": "Only one flush in flight (running gate); no double-execute",
          "owner": "Both"
        },
        {
          "code": "C13",
          "title": "Flaky network (rapid online/offline flips during submit)",
          "expected": "Eventually consistent, exactly-once record; no orphaned in_flight",
          "owner": "Me"
        },
        {
          "code": "C14",
          "title": "15s periodic flush picks up stuck pending row",
          "expected": "Auto-flushes when online",
          "owner": "You"
        },
        {
          "code": "C15",
          "title": "App backgrounded offline → foregrounded online",
          "expected": "resync() runs on foreground, flushes",
          "owner": "You"
        }
      ]
    },
    {
      "code": "D",
      "title": "Core field workflow (happy paths + gates)",
      "warn": false,
      "cases": [
        {
          "code": "D1",
          "title": "Self check-in on-site (within range)",
          "expected": "One tap, queued immediately",
          "owner": "You"
        },
        {
          "code": "D2",
          "title": "Self check-in >200ft from WO",
          "expected": "Confirm dialog warns; confirm → queued",
          "owner": "You"
        },
        {
          "code": "D3",
          "title": "QR badge scan valid (BDR:{rosterMemberId} on roster)",
          "expected": "Member added, attendance queued, shown live",
          "owner": "You"
        },
        {
          "code": "D4",
          "title": "QR scan invalid / not a Big Dog badge",
          "expected": "'Not a Big Dog badge' message, no queue row",
          "owner": "You"
        },
        {
          "code": "D5",
          "title": "QR scan member not on this crew's roster",
          "expected": "Rejected",
          "owner": "You"
        },
        {
          "code": "D6",
          "title": "QR scanner rapid re-scan of same code",
          "expected": "1.5s cooldown prevents double-fire",
          "owner": "You"
        },
        {
          "code": "D7",
          "title": "Photos/disputes blocked until check-in (#203)",
          "expected": "Actions unavailable until a check-in row exists",
          "owner": "You"
        },
        {
          "code": "D8",
          "title": "Failed check-in (status=failed) does NOT unlock gates",
          "expected": "Gates stay locked",
          "owner": "Both"
        },
        {
          "code": "D9",
          "title": "Submit with 0 crew hours / no member",
          "expected": "Validation blocks",
          "owner": "You"
        },
        {
          "code": "D10",
          "title": "Submit with a required photo slot empty",
          "expected": "Validation blocks",
          "owner": "You"
        },
        {
          "code": "D11",
          "title": "Dispute each reason code; 'other' requires notes",
          "expected": "Queued; 'other' w/o notes blocked",
          "owner": "You"
        },
        {
          "code": "D12",
          "title": "Cancel/rework/incident-ack from notification → WO banner",
          "expected": "Queued; caches invalidated so banner clears",
          "owner": "You"
        },
        {
          "code": "D13",
          "title": "Rework-ack reopens job for resubmit",
          "expected": "Submit re-enabled; fresh clientTempId issued",
          "owner": "Both"
        },
        {
          "code": "D14",
          "title": "Inspector files incident (type/severity/description)",
          "expected": "Queued",
          "owner": "You"
        }
      ]
    },
    {
      "code": "E",
      "title": "Photos & camera",
      "warn": false,
      "cases": [
        {
          "code": "E1",
          "title": "Multi-photo slot: add 3 → badge → delete 1 → submit",
          "expected": "Only 2 uploaded; manifest matches",
          "owner": "You"
        },
        {
          "code": "E2",
          "title": "Delete photo before upload, then submit",
          "expected": "Parked failed 'Photos missing'; retake → submit succeeds (#181/#293)",
          "owner": "Both"
        },
        {
          "code": "E3",
          "title": "Before/After prerequisite: After locked until Before captured",
          "expected": "After slot disabled with reason until Before exists",
          "owner": "You"
        },
        {
          "code": "E4",
          "title": "Watermark correctness",
          "expected": "WO#, slot label, GPS, user name, timestamp burned in",
          "owner": "You"
        },
        {
          "code": "E5",
          "title": "Photo with GPS off / no fix",
          "expected": "geo_flagged set; still capturable (verify intended)",
          "owner": "You"
        },
        {
          "code": "E6",
          "title": "Camera permission denied",
          "expected": "Graceful prompt, no crash",
          "owner": "You"
        },
        {
          "code": "E7",
          "title": "Capture many photos → device storage full",
          "expected": "Graceful error, queue not corrupted",
          "owner": "You"
        },
        {
          "code": "E8",
          "title": "Local file reclaimed after upload (remote_id set)",
          "expected": "Storage freed; thumbnail resolves from remote",
          "owner": "You"
        }
      ]
    },
    {
      "code": "F",
      "title": "Idempotency & dedupe — the 'duplicate work record' class",
      "warn": true,
      "cases": [
        {
          "code": "F1",
          "title": "Double-tap submit rapidly",
          "expected": "busy flag + clientTempId idempotency → one outbox row",
          "owner": "Both"
        },
        {
          "code": "F2",
          "title": "Submit → kill app before done persists → relaunch",
          "expected": "Resumes, no duplicate record (durable submit-key:{woId})",
          "owner": "Both"
        },
        {
          "code": "F3",
          "title": "Submit succeeds server-side but ack lost (response dropped)",
          "expected": "Retry → server returns existing record, marks done",
          "owner": "Me"
        },
        {
          "code": "F4",
          "title": "Resubmit after rework-ack",
          "expected": "New clientTempId (old cleared at done) → new record, no collision",
          "owner": "Both"
        },
        {
          "code": "F5",
          "title": "Same (kind, clientTempId) enqueued twice",
          "expected": "enqueue() returns existing row id, no second row",
          "owner": "Me"
        },
        {
          "code": "F6",
          "title": "Ack kinds re-sent after success",
          "expected": "409 treated as success (idempotent)",
          "owner": "Me"
        },
        {
          "code": "F7",
          "title": "CrewMap duplicate 'enters' from GPS jitter at same site",
          "expected": "Bucketed per-day coalesces (cosmetic; #335)",
          "owner": "You"
        }
      ]
    },
    {
      "code": "G",
      "title": "Roles, permissions & tenant isolation",
      "warn": false,
      "cases": [
        {
          "code": "G1",
          "title": "crew_member sees only their crew's WOs",
          "expected": "No cross-company leakage",
          "owner": "You"
        },
        {
          "code": "G2",
          "title": "roe_manager extra capabilities vs crew_member",
          "expected": "Manager-only actions visible only to manager",
          "owner": "You"
        },
        {
          "code": "G3",
          "title": "Inspector can't access crew submit flows (and vice versa)",
          "expected": "Route separation enforced",
          "owner": "You"
        },
        {
          "code": "G4",
          "title": "Crew roster cache scoped to user's crew (not global)",
          "expected": "Manual check-in picker shows only own crew",
          "owner": "You"
        },
        {
          "code": "G5",
          "title": "Open a WO id not in scope (deep link / stale cache)",
          "expected": "Blocked / not-found, no data leak",
          "owner": "Both"
        }
      ]
    },
    {
      "code": "H",
      "title": "Push notifications",
      "warn": false,
      "cases": [
        {
          "code": "H1",
          "title": "Device token registers on login",
          "expected": "Settings shows 'Active'",
          "owner": "You"
        },
        {
          "code": "H2",
          "title": "Push permission denied",
          "expected": "Settings shows 'Permission denied', app still works",
          "owner": "You"
        },
        {
          "code": "H3",
          "title": "Portal sends cancel/rework/incident push",
          "expected": "Notification arrives, deep-links to WO",
          "owner": "You"
        },
        {
          "code": "H4",
          "title": "Sign-out unregisters device token (while session valid)",
          "expected": "Old user stops receiving pushes",
          "owner": "Both"
        },
        {
          "code": "H5",
          "title": "Notification tap while app killed (cold start)",
          "expected": "Routes to correct WO after boot",
          "owner": "You"
        }
      ]
    },
    {
      "code": "I",
      "title": "Data integrity & device edge cases",
      "warn": false,
      "cases": [
        {
          "code": "I1",
          "title": "Clock skew — device time wrong",
          "expected": "created_at/next_attempt_at/backoff sane; no permanently-future rows",
          "owner": "Both"
        },
        {
          "code": "I2",
          "title": "App update / schema migration with queued rows",
          "expected": "Outbox/photos survive upgrade; no data loss",
          "owner": "Both"
        },
        {
          "code": "I3",
          "title": "Low memory — OS kills app during photo processing",
          "expected": "Photo fully saved or absent (no half-written row)",
          "owner": "You"
        },
        {
          "code": "I4",
          "title": "Timezone change (travel) mid-job",
          "expected": "Timestamps consistent (UTC server-side)",
          "owner": "You"
        },
        {
          "code": "I5",
          "title": "Very large queue (50+ pending)",
          "expected": "Flush handles batch without UI freeze",
          "owner": "Both"
        },
        {
          "code": "I6",
          "title": "Corrupt/partial SQLite recovery",
          "expected": "App boots, doesn't brick",
          "owner": "Me"
        }
      ]
    },
    {
      "code": "J",
      "title": "UI / UX states",
      "warn": false,
      "cases": [
        {
          "code": "J1",
          "title": "Empty states (no WOs, no photos, no failed items)",
          "expected": "Friendly empty UI",
          "owner": "You"
        },
        {
          "code": "J2",
          "title": "Submit status card: step/attempts/next-retry/error",
          "expected": "Accurate live state",
          "owner": "You"
        },
        {
          "code": "J3",
          "title": "Settings queue counts (pending/in-flight/failed/retrying)",
          "expected": "Matches DB",
          "owner": "Both"
        },
        {
          "code": "J4",
          "title": "Failed item Retry / Discard buttons",
          "expected": "Retry re-enqueues; Discard removes",
          "owner": "You"
        },
        {
          "code": "J5",
          "title": "Connectivity banner appears/clears correctly",
          "expected": "Tracks real network state",
          "owner": "You"
        }
      ]
    }
  ]
};
