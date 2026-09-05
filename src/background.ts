import {DEFAULT_SERVER_PORT} from "./const";

let ws: WebSocket | null = null;
let lastPongTime = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastError = "";
let lastUrl = "";
let keepAlive = false;

export interface Message {
    method: string;
    data: string;
}

export interface OpenTabData {
    tabId: number;
    tabIndex: number;
    windowId: number;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.method === "isConnected") {
        sendResponse(getConnectionSnapshot());
        return;
    }
    if (msg.method === "connectNow") {
        const port = typeof msg.data === "string" && msg.data ? msg.data : DEFAULT_SERVER_PORT;
        openSocket(port);
        sendResponse(getConnectionSnapshot());
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if ((namespace === "local" || namespace === "sync") && changes.port) {
        console.log("port changed, reconnecting to the server");
        openSocket(changes.port.newValue || DEFAULT_SERVER_PORT);
    }
});

setInterval(() => {
    sendMsg({
        method: "ping",
        data: new Date().toLocaleTimeString(),
    });
}, 1000);

setInterval(() => {
    chrome.tabs.query({}, (tabs) => {
        sendMsg({
            method: "tabs",
            data: JSON.stringify(
                tabs.map((tab) => {
                    return {
                        tabId: tab.id || -1,
                        windowId: tab.windowId || -1,
                        tabIndex: tab.index || -1,
                        title: tab.title || "",
                        url: tab.url || "",
                        pinned: tab.pinned || false,
                        highlighted: tab.highlighted || tab.active || false,
                        browser: "firefox",
                    };
                })
            ),
        });
    });
}, 1000);

function getStorage() {
    return chrome.storage.local;
}

function isSocketOpen() {
    return !!ws && ws.readyState === WebSocket.OPEN;
}

function getConnectionSnapshot() {
    return {
        connected: isSocketOpen() || (lastPongTime > 0 && new Date().getTime() - lastPongTime < 3000),
        readyState: ws ? ws.readyState : -1,
        lastError,
        lastUrl,
        lastPongTime,
    };
}

function persistConnectionSnapshot() {
    getStorage().set({connectionStatus: getConnectionSnapshot()});
}

function openSocket(port: string = DEFAULT_SERVER_PORT) {
    keepAlive = true;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    const url = "ws://127.0.0.1:" + port + "/ws";
    lastUrl = url;
    lastError = "";
    console.log("connecting to the server:", url);
    persistConnectionSnapshot();

    try {
        if (ws) {
            ws.onclose = null;
            ws.close();
        }
        ws = new WebSocket(url);
    } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.error("failed to create websocket:", err);
        persistConnectionSnapshot();
        scheduleReconnect(port);
        return;
    }

    ws.onopen = () => {
        lastError = "";
        console.log("connected to the server");
        persistConnectionSnapshot();
    };
    ws.onerror = () => {
        lastError = "websocket error: " + lastUrl;
        console.error("websocket error:", lastUrl);
        persistConnectionSnapshot();
    };
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as Message;
        console.log("message from server:", msg);
        if (msg.method === "pong") {
            lastPongTime = new Date().getTime();
            persistConnectionSnapshot();
        }
        if (msg.method === "highlightTab") {
            highlightTab(JSON.parse(msg.data) as OpenTabData);
        }
        if (msg.method === "openUrl") {
            chrome.tabs.create({url: msg.data}, (tab) => {
                console.log("opened url:", msg.data, "tab:", tab);
            });
        }
    };
    ws.onclose = (event) => {
        lastError = `websocket closed code=${event.code} reason=${event.reason || "n/a"}`;
        console.log("disconnected from the server", lastError);
        persistConnectionSnapshot();
        scheduleReconnect(port);
    };
}

function scheduleReconnect(port: string) {
    if (!keepAlive) {
        return;
    }
    reconnectTimer = setTimeout(() => {
        openSocket(port);
    }, 3000);
}

function highlightTab(tab: OpenTabData) {
    chrome.tabs.highlight({tabs: [tab.tabIndex], windowId: tab.windowId}, () => {
        if (chrome.runtime.lastError && tab.tabId >= 0) {
            chrome.tabs.update(tab.tabId, {active: true}, () => {
                chrome.windows.update(tab.windowId, {focused: true});
            });
            return;
        }
        chrome.windows.update(tab.windowId, {focused: true});
        console.log("highlighted tab:", tab);
    });
}

function sendMsg(msg: Message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}

const root = window as Window & {
    openSocket?: typeof openSocket;
    getConnectionSnapshot?: typeof getConnectionSnapshot;
};
root.openSocket = openSocket;
root.getConnectionSnapshot = getConnectionSnapshot;
