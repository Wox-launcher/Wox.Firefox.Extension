const DEFAULT_SERVER_PORT = "34988";

let ws = null;
let lastPongTime = 0;
let reconnectTimer = null;
let lastError = "";
let lastUrl = "";
let keepAlive = false;

function getSnapshot() {
    return {
        connected: !!ws && ws.readyState === WebSocket.OPEN,
        readyState: ws ? ws.readyState : -1,
        lastError,
        lastUrl,
        lastPongTime,
    };
}

function persistSnapshot() {
    chrome.storage.local.set({connectionStatus: getSnapshot()});
}

function sendMsg(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}

function highlightTab(tab) {
    chrome.tabs.highlight({tabs: [tab.tabIndex], windowId: tab.windowId}, () => {
        if (chrome.runtime.lastError && tab.tabId >= 0) {
            chrome.tabs.update(tab.tabId, {active: true}, () => {
                chrome.windows.update(tab.windowId, {focused: true});
            });
            return;
        }
        chrome.windows.update(tab.windowId, {focused: true});
    });
}

function openSocket(port) {
    keepAlive = true;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    const url = "ws://127.0.0.1:" + (port || DEFAULT_SERVER_PORT) + "/ws";
    lastUrl = url;
    lastError = "";
    persistSnapshot();

    try {
        if (ws) {
            ws.onclose = null;
            ws.close();
        }
        ws = new WebSocket(url);
    } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        persistSnapshot();
        reconnectTimer = setTimeout(() => openSocket(port), 3000);
        return;
    }

    ws.onopen = () => {
        lastError = "";
        persistSnapshot();
    };
    ws.onerror = () => {
        lastError = "websocket error: " + lastUrl;
        persistSnapshot();
    };
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.method === "pong") {
            lastPongTime = Date.now();
            persistSnapshot();
        }
        if (msg.method === "highlightTab") {
            highlightTab(JSON.parse(msg.data));
        }
        if (msg.method === "openUrl") {
            chrome.tabs.create({url: msg.data});
        }
    };
    ws.onclose = (event) => {
        lastError = "websocket closed code=" + event.code + " reason=" + (event.reason || "n/a");
        persistSnapshot();
        if (keepAlive) {
            reconnectTimer = setTimeout(() => openSocket(port), 3000);
        }
    };
}

setInterval(() => {
    sendMsg({method: "ping", data: new Date().toLocaleTimeString()});
}, 1000);

setInterval(() => {
    chrome.tabs.query({}, (tabs) => {
        sendMsg({
            method: "tabs",
            data: JSON.stringify(
                tabs.map((tab) => ({
                    tabId: tab.id || -1,
                    windowId: tab.windowId || -1,
                    tabIndex: tab.index || -1,
                    title: tab.title || "",
                    url: tab.url || "",
                    pinned: tab.pinned || false,
                    highlighted: tab.highlighted || tab.active || false,
                    browser: "firefox",
                }))
            ),
        });
    });
}, 1000);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.method === "isConnected") {
        sendResponse(getSnapshot());
        return;
    }
    if (msg.method === "connectNow") {
        openSocket(msg.data || DEFAULT_SERVER_PORT);
        sendResponse(getSnapshot());
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if ((namespace === "local" || namespace === "sync") && changes.port) {
        openSocket(changes.port.newValue || DEFAULT_SERVER_PORT);
    }
});

window.openSocket = openSocket;
window.getConnectionSnapshot = getSnapshot;

if (document.documentElement.getAttribute("data-autostart") === "true") {
    chrome.storage.local.get({port: DEFAULT_SERVER_PORT}, (items) => {
        openSocket(items.port || DEFAULT_SERVER_PORT);
    });
}
