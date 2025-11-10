/**
 * API Configuration
 * Auto-detects API URL based on environment
 * 
 * Priority:
 * 1. URL parameter: ?api=https://your-api-url.com
 * 2. localStorage: 'api_base' key
 * 3. Environment variable (for Netlify/builds)
 * 4. Auto-detect from domain
 * 5. Default: http://localhost:4000
 */

(function () {
  const hostname = window.location.hostname;

  // Check for URL parameter override
  const urlParams = new URLSearchParams(window.location.search);
  const apiParam = urlParams.get('api');
  if (apiParam) {
    window.API_BASE = apiParam;
    localStorage.setItem('api_base', apiParam);
    console.log('🌐 API Base URL (from URL param):', window.API_BASE);
    return;
  }

  // Check localStorage override
  const storedApi = localStorage.getItem('api_base');
  if (storedApi) {
    window.API_BASE = storedApi;
    console.log('🌐 API Base URL (from localStorage):', window.API_BASE);
    return;
  }

  // Check for production domain (doclittle.site)
  if (hostname === 'doclittle.site' || hostname === 'www.doclittle.site' || hostname.includes('doclittle.site')) {
    // For production, use Railway backend
    window.API_BASE = 'https://web-production-a783d.up.railway.app';
    console.log('🌐 API Base URL (production - doclittle.site):', window.API_BASE);
    return;
  }

  // Auto-detect for external domains
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    // If accessing via ngrok (legacy - should not be used in production)
    if (hostname.includes('ngrok') || hostname.includes('ngrok-free') || hostname.includes('ngrok.io')) {
      console.warn('⚠️  Detected ngrok access. Please use production domain instead.');
      window.API_BASE = 'https://web-production-a783d.up.railway.app'; // Use Railway backend
    } else if (hostname.includes('netlify.app')) {
      // Netlify - use Railway backend URL
      window.API_BASE = 'https://web-production-a783d.up.railway.app';
    } else if (hostname === 'doclittle.site' || hostname === 'www.doclittle.site') {
      // Production domain - use Railway backend
      // Note: Backend is on Railway, not on doclittle.site
      window.API_BASE = 'https://web-production-a783d.up.railway.app';
    } else {
      // Other custom domain - use Railway backend (or configure as needed)
      window.API_BASE = 'https://web-production-a783d.up.railway.app';
    }
  } else {
    // Local access
    window.API_BASE = 'http://localhost:4000';
  }

  console.log('🌐 API Base URL:', window.API_BASE);
})();

