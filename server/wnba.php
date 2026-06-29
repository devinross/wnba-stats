<?php
/**
 * stats.wnba.com proxy for shared hosting (Bluehost).
 *
 * The React app calls:   /api/wnba.php/stats/leaguegamelog?LeagueID=10&...
 * This script forwards:  https://stats.wnba.com/stats/leaguegamelog?LeagueID=10&...
 * attaching the browser-like headers stats.wnba.com requires, server-side.
 *
 * Why a proxy: stats.wnba.com sends no CORS headers (so a browser can't call it
 * directly) and only responds when specific headers are present. Doing it here
 * also avoids exposing anything and keeps the front end same-origin.
 *
 * IMPORTANT: stats.wnba.com frequently blocks or times out requests coming from
 * datacenter / shared-hosting IP addresses. Test THIS FILE on Bluehost early
 * (load it in a browser). If it hangs or returns 403, this host's IP is likely
 * blocked and you should stay on the BALLDONTLIE version.
 *
 * Upload to: public_html/api/wnba.php
 */

$path = isset($_SERVER['PATH_INFO']) ? $_SERVER['PATH_INFO'] : '';
if ($path === '' && isset($_GET['path'])) {
  $path = $_GET['path'];
}

// Only allow the stats path through (don't be an open proxy).
if (strpos($path, '/stats/') !== 0) {
  http_response_code(400);
  header('Content-Type: application/json');
  echo json_encode(['error' => 'Path must start with /stats/']);
  exit;
}

$query = isset($_SERVER['QUERY_STRING']) ? $_SERVER['QUERY_STRING'] : '';
$query = preg_replace('/(^|&)path=[^&]*/', '', $query);
$query = ltrim($query, '&');

$url = 'https://stats.wnba.com' . $path . ($query ? ('?' . $query) : '');

$headers = [
  'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept: application/json, text/plain, */*',
  'Accept-Language: en-US,en;q=0.9',
  'Referer: https://www.wnba.com/',
  'Origin: https://www.wnba.com',
  'x-nba-stats-origin: stats',
  'x-nba-stats-token: true',
  'Connection: keep-alive',
];

$ch = curl_init($url);
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => $headers,
  CURLOPT_ENCODING => '',        // accept + auto-decompress gzip
  CURLOPT_TIMEOUT => 30,         // this endpoint can be slow
  CURLOPT_CONNECTTIMEOUT => 15,
  CURLOPT_FOLLOWLOCATION => true,
]);
$body = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);

header('Content-Type: application/json');

if ($body === false) {
  http_response_code(502);
  echo json_encode(['error' => 'Upstream request failed (often an IP block or timeout on shared hosting): ' . curl_error($ch)]);
  curl_close($ch);
  exit;
}
curl_close($ch);

// Cache a few minutes to ease load and rate pressure.
header('Cache-Control: public, max-age=180');
http_response_code($status ?: 200);
echo $body;
