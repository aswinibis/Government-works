const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
    console.log(`Request: ${req.url}`);

    // Handle root path
    let filePath = req.url === '/' ? '/index.html' : req.url;

    // Remove query string if present
    filePath = filePath.split('?')[0];

    // Construct absolute path
    const absPath = path.join(__dirname, filePath);

    // Check if file exists
    fs.access(absPath, fs.constants.F_OK, (err) => {
        if (err) {
            res.statusCode = 404;
            res.end(`File not found: ${req.url}`);
            return;
        }

        // Read file
        fs.readFile(absPath, (err, data) => {
            if (err) {
                res.statusCode = 500;
                res.end('Internal Server Error');
                return;
            }

            // Determine content type
            const ext = path.extname(absPath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';

            res.setHeader('Content-Type', contentType);
            res.end(data);
        });
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log('Press Ctrl+C to stop');
});
