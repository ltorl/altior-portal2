import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { hostname } from "node:os";
import fs from "node:fs";
import path from "node:path";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";

import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let publicPath = path.resolve(process.cwd(), "scramjet");

if (!fs.existsSync(path.join(publicPath, "index.html"))) {
    console.error(`[Fatal] index.html not found at ${publicPath}`);
    process.exit(1);
}

console.log(`[Render Path Solver] Detected index.html root directory at: ${publicPath}`);

logging.set_level(logging.NONE);
Object.assign(wisp.options, {
    allow_udp_streams: false,
    hostname_blacklist: [/example\.com/],
    dns_servers: ["1.1.1.3", "1.0.0.3"],
});

const fastify = Fastify({
    serverFactory: (handler) => {
        return createServer()
            .on("request", (req, res) => {
                res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
                res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
                handler(req, res);
            })
            .on("upgrade", (req, socket, head) => {
                if (req.url === "/wisp/") {
                    wisp.routeRequest(req, socket, head);
                } else {
                    socket.end();
                }
            });
    },
});

fastify.addHook("onRequest", (req, reply, done) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
        return reply.status(200).send();
    }
    done();
});

fastify.register(fastifyStatic, {
    root: publicPath,
    decorateReply: true,
});

fastify.register(fastifyStatic, {
    root: path.resolve(process.cwd(), "notmyorgin"),
    prefix: "/notmyorgin/",
    decorateReply: false,
});

fastify.register(fastifyStatic, {
    root: scramjetPath,
    prefix: "/scram/",
    decorateReply: false,
});

fastify.register(fastifyStatic, {
    root: libcurlPath,
    prefix: "/libcurl/",
    decorateReply: false,
});

fastify.register(fastifyStatic, {
    root: baremuxPath,
    prefix: "/baremux/",
    decorateReply: false,
});

fastify.get("/get-dynamic-sw.js", (req, reply) => {
    const swCode = req.query.code;
    if (!swCode) {
        return reply.code(400).type("text/plain").send("Missing code parameter");
    }
    return reply.type("application/javascript").send(decodeURIComponent(swCode));
});

fastify.get("/", (req, reply) => {
    try {
        const htmlPath = path.join(publicPath, "index.html");
        if (fs.existsSync(htmlPath)) {
            const html = fs.readFileSync(htmlPath, "utf8");
            return reply.type("text/html").send(html);
        }
        return reply.code(404).type("text/html").send("<h1>404 Not Found</h1><p>index.html could not be found.</p>");
    } catch (err) {
        return reply.code(500).type("text/plain").send("Error loading index.html: " + err.message);
    }
});


fastify.setNotFoundHandler((req, reply) => {
    return reply
        .code(404)
        .type("text/html")
        .send("<h1>404 Not Found</h1><p>The requested resource could not be found on this server.</p>");
});

fastify.server.on("listening", () => {
    const address = fastify.server.address();

    console.log("Listening on:");
    console.log(`\thttp://localhost:${address.port}`);
    console.log(`\thttp://${hostname()}:${address.port}`);
    console.log(
        `\thttp://${
            address.family === "IPv6" ? `[${address.address}]` : address.address
        }:${address.port}`
    );
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
    console.log("SIGTERM signal received: closing HTTP server");
    fastify.close();
    process.exit(0);
}

let port = parseInt(process.env.PORT || "");
if (isNaN(port)) port = 8080;

fastify.listen({
    port: port,
    host: "0.0.0.0",
});
