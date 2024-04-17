-- Limit by interval:
-- WHERE time >= DATE(NOW() - INTERVAL 7 DAY)

-- Top countries which sent requests to wiki pages (all time).
SELECT
    COALESCE(country, 'Unknown') AS country,
    COUNT(DISTINCT host) AS num_hosts
FROM logs
WHERE
    path LIKE '/wiki/%' AND
    is_bot = 0 AND
    method = 'GET' AND
    status = 200
GROUP BY country
ORDER BY num_hosts DESC;

-- Top device types which sent requests to wiki pages (all time).
SELECT
    device_type,
    COUNT(DISTINCT host) AS num_hosts
FROM logs
WHERE
    path LIKE '/wiki/%' AND
    is_bot = 0 AND
    method = 'GET' AND
    status = 200
GROUP BY device_type
ORDER BY num_hosts DESC;

-- Top hosts which sent requests to wiki pages (all time) and which countries do they come from.
SELECT
    DISTINCT host AS host,
    country,
    COUNT(*) AS num_requests
FROM logs
WHERE
    path LIKE '/wiki/%' AND
    is_bot = 0 AND
    method = 'GET' AND
    status = 200
GROUP BY host, country
ORDER BY num_requests DESC
LIMIT 10;

-- Top 10 pages by unique hosts which sent requests for them (all time).
SELECT
    path,
    COUNT(DISTINCT host) AS num_hosts
FROM logs
WHERE
    path LIKE '/wiki/%' AND
    is_bot = 0 AND
    method = 'GET' AND
    status = 200
GROUP BY path
ORDER BY num_hosts DESC
LIMIT 10;

-- API requests.
SELECT query, country, COUNT(DISTINCT host) AS num_requests FROM logs WHERE path = '/w/api.php' GROUP BY query;

-- Special pages...
SELECT * FROM logs WHERE path LIKE '/wiki/Посебно:%';

-- Most visited special pages.
SELECT
    path,
    COUNT(DISTINCT host) AS num_hosts
FROM logs
WHERE
    path LIKE '/wiki/Посебно:%' AND
    is_bot = 0 AND
    method = 'GET' AND
    status = 200
GROUP BY path
ORDER BY num_hosts DESC
LIMIT 10;

-- Check if any meaningful requests have been sent to index.php
SELECT * FROM logs WHERE path = '/w/index.php';

-- Search requests
SELECT query
FROM logs
WHERE
    path = '/w/index.php' AND
    query LIKE '?search=%&title=Посебно%3AПретражи%';

-- Which pages might be missing?
SELECT
    path,
    COUNT(*) AS num_requests
FROM logs
WHERE
    status = 404 AND
    is_bot = 0
GROUP BY path
ORDER BY num_requests DESC;

-- Also for 500!

-- Which pages has Googlebot visited?
SELECT DISTINCT path FROM logs WHERE user_agent LIKE '%googlebot%';

-- Unusual URLs
SELECT CONCAT(path, COALESCE(query, '')) AS url, COUNT(*) AS num_requests
FROM logs
WHERE
    path IS NOT NULL AND
    path NOT LIKE '/wiki/%' AND
    path NOT like '/w/images/%' AND
    path NOT LIKE '/w/load.php' AND
    path NOT LIKE '/w/skins/%' AND
    path NOT LIKE '/w/resources/%' AND
    path NOT LIKE '/w/extensions/%' AND
    path NOT IN (
        '/w/api.php',
        '/w/index.php',
        '/',
        '*',
        '/favicon.ico',
        '/wiki.png',
        '/apple-touch-icon.png',
        '/wiki-1.5x.png',
        '/wiki-2x.png'
    ) AND NOT (
        path = '/robots.txt' AND
        is_bot = 1
    )
GROUP BY url
ORDER BY num_requests DESC;

