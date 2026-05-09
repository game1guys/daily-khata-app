// DEBUG_ID: V2_OCEAN_BLUE
import { Platform } from 'react-native';

// --- CHOOSE YOUR BACKEND HERE ---
const USE_LOCAL = false; // Set to 'false' to use Render (Live)

const LOCAL_URL = Platform.OS === 'android' ? 'http://10.0.2.2:5001/api' : 'http://localhost:5001/api';
const LIVE_URL = 'https://my-expenses-backend-fc4c.onrender.com/api';

export const API_URL = USE_LOCAL ? LOCAL_URL : LIVE_URL;
// --------------------------------

export const GOOGLE_WEB_CLIENT_ID = '1046778544158-r8r3dchf8dj490kijl1llnnijrqj0088.apps.googleusercontent.com';
export const WEB_PRICING_URL = Platform.OS === 'android' ? 'http://10.0.2.2:5173/pricing' : 'http://localhost:5173/pricing';
export const RAZORPAY_KEY_ID = 'rzp_test_SWfo8B11r0U8fL';
