// Supabase connection for cross-device sync. Both values are public by design:
// the publishable key only allows what Row Level Security policies allow, and
// the only policy lets a signed-in user read and write their own row.
// Leave empty to run fully offline (progress stays in this browser).
export const SUPABASE_URL = "https://dgfbirenbnhkqwrxkxcn.supabase.co";
export const SUPABASE_KEY = "sb_publishable_VkkJUMIMra0BhnrlmDwqKw_MlS9UcxM";
// The site. Goals is served at /goals on the calendar's domain (the calendar
// project rewrites /goals/* here), so the calendar is the same origin.
// Its agenda shows on the Today tab (see api/today.js for the other direction).
export const CALENDAR_URL = "https://www.arnavcalendar.online";
