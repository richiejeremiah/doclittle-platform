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
  if (hostname === 'doclittle.site' || hostname.includes('doclittle.site')) {
    // For production, use Railway backend
    const prodApi = localStorage.getItem('api_base') || 'https://web-production-a783d.up.railway.app';
    window.API_BASE = prodApi;
    console.log('🌐 API Base URL (production):', window.API_BASE);
    return;
  }

  // Auto-detect for ngrok/external domains
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    // If accessing via ngrok or other external domain
    if (hostname.includes('ngrok') || hostname.includes('ngrok-free') || hostname.includes('ngrok.io')) {
      console.warn('⚠️  Detected external access. Please set API URL via ?api=YOUR_API_URL or localStorage');
      window.API_BASE = 'http://localhost:4000'; // Fallback
    } else if (hostname.includes('netlify.app')) {
      // Netlify - use Railway URL
      window.API_BASE = 'https://web-production-a783d.up.railway.app';
    } else {
      // Other custom domain - assume API is on same domain, port 4000
      const protocol = window.location.protocol;
      window.API_BASE = `${protocol}//${hostname}:4000`;
    }
  } else {
    // Local access
    window.API_BASE = 'http://localhost:4000';
  }

  console.log('🌐 API Base URL:', window.API_BASE);
})();

