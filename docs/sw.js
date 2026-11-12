var CACHE = 'debt-snowball-28d5e81529';
var FILES = ["./", "index.html", "manifest.webmanifest", "apple-touch-icon.png", "icon-192.png", "icon-512.png"];
self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(FILES); }));
  self.skipWaiting();
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('fetch', function(e){
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  var scope = self.registration.scope;
  var listed = FILES.map(function(f){ return new URL(f, scope).pathname; });
  // version.json is never cached on purpose: the update check must always see the live build id
  var cacheable = url.pathname !== new URL('version.json', scope).pathname && listed.indexOf(url.pathname) !== -1;
  var key = url.origin + url.pathname;
  e.respondWith(fetch(e.request.url, {cache: 'no-store'}).then(function(res){
    if (res.ok && cacheable) {
      var copy = res.clone();
      e.waitUntil(caches.open(CACHE).then(function(c){ return c.put(key, copy); }));
    }
    return res;
  }).catch(function(){
    return caches.match(e.request, {ignoreSearch: true}).then(function(m){ return m || caches.match(new URL('index.html', scope).href, {ignoreSearch: true}); });
  }));
});
