
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const publicFiles = {
    "/": "index.html",
    "/index.html": "index.html",
    "/style.css": "style.css",
    "/game.js": "game.js"
};

const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8"
};

const server = http.createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        res.end("Method Not Allowed");
        return;
    }

    let pathname;

    try {
        pathname = new URL(
            req.url,
            "http://localhost"
        ).pathname;
    } catch {
        res.writeHead(400);
        res.end("Bad Request");
        return;
    }

    const filename = publicFiles[pathname];

    if (!filename) {
        res.writeHead(404, {
            "Content-Type": "text/plain; charset=utf-8"
        });

        res.end("404 - File not found");
        return;
    }

    const filePath = path.join(__dirname, filename);

    fs.readFile(filePath, (error, data) => {
        if (error) {
            console.error("File error:", filename, error.message);

            res.writeHead(500, {
                "Content-Type": "text/plain; charset=utf-8"
            });

            res.end("Server error: " + filename + " could not be loaded.");
            return;
        }

        res.writeHead(200, {
            "Content-Type": contentTypes[path.extname(filename)],
            "Cache-Control": "no-store"
        });

        if (req.method === "HEAD") {
            res.end();
        } else {
            res.end(data);
        }
    });
});

server.listen(PORT, HOST, () => {
    console.log("");
    console.log("==================================");
    console.log("        GOLDFISHMAN SERVER");
    console.log("==================================");
    console.log("Status: ONLINE");
    console.log("Address: http://localhost:" + PORT);
    console.log("Mode: Offline testing");
    console.log("Dependencies: None");
    console.log("==================================");
    console.log("");
});

server.on("error", (error) => {
    console.error("Server error:", error.message);
});
