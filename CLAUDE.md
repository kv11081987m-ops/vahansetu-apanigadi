# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (localhost:5173)
npm run build     # Production build
npm run preview   # Preview production build
npm run lint      # ESLint check
```

No test suite is configured. There is no single-test command.

## Environment Variables

Required in `.env`:
```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_GOOGLE_MAPS_API_KEY
```

reCAPTCHA is automatically disabled on `localhost` / `127.0.0.1` for phone-auth testing.

## Architecture

### Stack
React 19 + Vite PWA, Tailwind CSS v4, Firebase (Auth + Firestore), Google Maps JS API, Framer Motion, Lucide icons.

### User Roles & Routes
Three roles stored in `users/{uid}.role`:
- `customer` → `/home` (Home.jsx, passenger booking flow)
- `driver` → `/dashboard` (Dashboard.jsx → DriverDashboard.jsx)
- `admin` → `/admin` (AdminDashboard.jsx)
- `new_user` → stays on `/` (Login.jsx, profile setup)

### Context Providers (`main.jsx` wraps in order)
1. **AuthContext** — Firebase Auth state, `userProfile` from Firestore `users/`, `registerUser()` which also creates `drivers/` doc for driver accounts.
2. **RideContext** — Single `activeRide` shared across app. Driver query uses a 5-minute Firestore window with server-side filters; passenger query fetches all `userId==uid` rides and filters client-side (to avoid composite index requirements). Ghost ride guard: passenger rides are time-limited — `accepted`/`started` > 4 hours and `completed`/`payment_done` > 2 hours are discarded.

### Firestore Collections

| Collection | Purpose |
|---|---|
| `users` | All user profiles (uid as doc ID) |
| `drivers` | Driver-specific data (uid as doc ID, duplicates some user fields) |
| `ride_requests` | Core booking documents |
| `bookings` | Booking metadata (created alongside ride_request) |
| `transactions` | Payment records |
| `wallet_transactions` | Driver earning ledger |
| `ratings` | Per-ride user ratings of driver |

### Ride Status Lifecycle
```
pending → accepted → started → completed → payment_done → finished
                  ↘ rejected
```
- `driverId = 'broadcast'` means the request is visible to all matching online drivers; once a driver claims it, `driverId` updates to their uid.
- `payment_done` is the terminal Firestore state; `finished` is set locally by `handleSubmitRating` / `handleSkipRating` after the rating popup.

### Vehicle Types
- `savaari` ↔ `battery_rickshaw` (e-rickshaw)
- `logistics` ↔ `chhota_hathi` (goods vehicle)

Fare formula: `savaari = ₹20 + (km × 8)`, `logistics = ₹150 + (km × 20)`.

### Home.jsx (Passenger booking — largest file)
Single mega-component managing the entire passenger flow. Key `bookingStatus` states drive what renders:
- `idle` → booking form (pickup/dest inputs, service selection, confirm button)
- `searching` → finding driver
- `accepted` → driver info panel with OTP
- `started` → live ride panel
- `completed` → payment screen (QR, cash, simulate buttons)
- `payment_done` → success screen + rating popup (via 3-second timer)

`findAndAssignDriver()` creates the `ride_requests` doc and attaches a local `onSnapshot` listener for status updates. This listener is **not** stored in `activeRequestUnsub`; `handleReset()` cannot clean it up — be careful adding new rides without unmounting.

`handleReset()` clears all local state back to `idle`. The `activeRide` useEffect calls it when `activeRide` becomes null, **except** when `bookingStatus === 'payment_done'` (to preserve the rating timer).

### DriverDashboard.jsx
Handles driver online/offline toggle, live ride request acceptance, ride start/complete flow, earnings stats, profile, and Cloudinary-based document upload. Uses its own Firestore listeners separate from RideContext.

### ActiveRideBar.jsx
Floating banner shown on non-home pages when user has an active ride. Has its own independent Firestore query (6-hour window) — does not use RideContext.
