// DEBUG_ID: V2_OCEAN_BLUE
import { Platform } from 'react-native';

// --- CHOOSE YOUR BACKEND HERE ---
// Backend is moving to Laravel (same /api paths). Point LIVE_URL to your Laravel app origin + /api.
const USE_LOCAL = false;

/** Laravel: `php artisan serve` → http://127.0.0.1:8000/api */
const LOCAL_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000/api' : 'http://localhost:8000/api';

/** Production: set to your deployed Laravel URL (must end with /api). */
const LIVE_URL = 'https://YOUR-LARAVEL-DOMAIN.com/api';

/** Legacy Node (Render) — only if you still proxy or run old API */
// const LIVE_URL = 'https://my-expenses-backend-fc4c.onrender.com/api';

export const API_URL = USE_LOCAL ? LOCAL_URL : LIVE_URL;
// --------------------------------

export const GOOGLE_WEB_CLIENT_ID = '1046778544158-r8r3dchf8dj490kijl1llnnijrqj0088.apps.googleusercontent.com';
/** Marketing + pricing SPA is served by Laravel (same host as API, no /api prefix). */
export const WEB_PRICING_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000/pricing' : 'http://localhost:8000/pricing';
export const RAZORPAY_KEY_ID = 'rzp_test_SWfo8B11r0U8fL';
