const CACHE_NAME = 'kairos-v1'
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/timer',
  '/projects',
  '/clients',
  '/reports',
  '/manifest.json',
  '/favicon.svg',
]

// Install — cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS)
    })
  )
  self.skipWaiting()
})

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch — network first, fall back to cache
self.addEventListener('fetch', event => {
  // Skip non-GET and Supabase API calls
  if (event.request.method !== 'GET') return
  if (event.request.url.includes('supabase.co')) return
  if (event.request.url.includes('chrome-extension')) return

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful responses
        if (response && response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => {
        // Offline fallback
        return caches.match(event.request).then(cached => {
          if (cached) return cached
          // For navigation requests, return dashboard
          if (event.request.mode === 'navigate') {
            return caches.match('/dashboard')
          }
          return new Response('Offline', { status: 503 })
        })
      })
  )
})