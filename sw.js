const CACHE = 'nnevo-v1.1.0';

const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/config.js',
  'js/Sprites.js',
  'js/NeuralNetwork.js',
  'js/GeneticAlgorithm.js',
  'js/Maze.js',
  'js/Agent.js',
  'js/Simulation.js',
  'js/Renderer.js',
  'js/UI.js',
  'js/main.js',
  'js/worker.js',
  'js/episode-worker.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first: serve from cache, fall back to network
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
