/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import http from "http";
import { IpcMainInvokeEvent } from "electron";

let httpServer: http.Server | null = null;
let latestData: any = null;
let shouldClear = false;

export function startServer(...args: any[]): Promise<{ success: boolean; error?: string }> {
    console.log("[YTM-RPC Native] startServer called with args:", args.length, args.map(a => typeof a));

    let port: number = 8766;
    for (const arg of args) {
        if (typeof arg === "number") {
            port = arg;
            break;
        }
    }
    console.log("[YTM-RPC Native] Using port:", port);

    return new Promise((resolve) => {
        try {
            if (httpServer) {
                httpServer.close();
                httpServer = null;
            }

            httpServer = http.createServer((req, res) => {
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                res.setHeader("Access-Control-Allow-Headers", "Content-Type");

                if (req.method === "OPTIONS") {
                    res.writeHead(200);
                    res.end();
                    return;
                }

                if (req.method === "POST" && req.url === "/update") {
                    let body = "";
                    req.on("data", (chunk) => body += chunk);
                    req.on("end", () => {
                        try {
                            latestData = JSON.parse(body);
                            shouldClear = false;
                            console.log("[YTM-RPC] Received update:", latestData.title);
                            res.writeHead(200, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ success: true }));
                        } catch (e) {
                            res.writeHead(400);
                            res.end(JSON.stringify({ error: "Invalid JSON" }));
                        }
                    });
                    return;
                }

                if (req.method === "POST" && req.url === "/clear") {
                    latestData = null;
                    shouldClear = true;
                    console.log("[YTM-RPC] Received clear");
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: true }));
                    return;
                }

                if (req.method === "GET" && req.url === "/status") {
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ connected: true }));
                    return;
                }

                res.writeHead(404);
                res.end("Not found");
            });

            httpServer.listen(port, "127.0.0.1", () => {
                console.log(`[YTM-RPC] HTTP server listening on http://127.0.0.1:${port}`);
                resolve({ success: true });
            });

            httpServer.on("error", (err: any) => {
                const errorMsg = `${err.message} (${err.code})`;
                console.error("[YTM-RPC Native] Server error:", errorMsg);
                resolve({ success: false, error: errorMsg });
            });
        } catch (e: any) {
            const errorMsg = e?.message || String(e);
            console.error("[YTM-RPC Native] Failed to start server:", errorMsg);
            resolve({ success: false, error: errorMsg });
        }
    });
}

export function stopServer(_event: IpcMainInvokeEvent): void {
    if (httpServer) {
        httpServer.close();
        httpServer = null;
    }
    latestData = null;
    shouldClear = false;
}

export function getLatestData(_event: IpcMainInvokeEvent): any {
    const data = latestData;
    latestData = null;
    return data;
}

export function getShouldClear(_event: IpcMainInvokeEvent): boolean {
    const clear = shouldClear;
    shouldClear = false;
    return clear;
}
