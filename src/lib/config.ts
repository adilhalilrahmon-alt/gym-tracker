// Public Supabase project settings. The publishable key is meant to ship in the app:
// row level security on every table keeps each user's data private.
// Test builds (VITE_OFFLINE=1) leave these empty so the app runs fully on-device:
// the E2E agent can never touch real data.
const OFFLINE = import.meta.env.VITE_OFFLINE === '1';
export const SUPABASE_URL = OFFLINE ? '' : 'https://xsgcqvqidvgzacmsdtqo.supabase.co';
export const SUPABASE_KEY = OFFLINE ? '' : 'sb_publishable_n3Zm1JjRB0nwbk7ir8Xo7w_SEvX7HNa';
export const APP_URL = 'https://adilhalilrahmon-alt.github.io/gym-tracker/';
