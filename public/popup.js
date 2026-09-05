const DEFAULT_SERVER_PORT = "34988";

const portInput = document.getElementById("port");
const connectedEl = document.getElementById("connected");
const badgeEl = document.getElementById("badge");
const endpointEl = document.getElementById("endpoint");
const errorEl = document.getElementById("error");
const statusEl = document.getElementById("status");
const saveButton = document.getElementById("save");
const connectButton = document.getElementById("connect");

let popupWs = null;
let connecting = false;

function storage() {
    return chrome.storage.local;
}

function setBadge(state, label) {
    badgeEl.className = "badge is-" + state;
    connectedEl.textContent = label;
}

function friendlyError(message) {
    if (!message) {
        return "";
    }
    if (message.indexOf("websocket error") !== -1 || message.indexOf("websocket closed") !== -1) {
        return "Could not reach Wox. Make sure it is running.";
    }
    return message;
}

function renderStatus(snapshot, extra) {
    const connected = !!(snapshot && snapshot.connected);
    if (connecting && !connected) {
        setBadge("connecting", "Connecting");
    } else if (connected) {
        connecting = false;
        setBadge("online", "Connected");
    } else {
        setBadge("offline", "Offline");
    }

    endpointEl.textContent = snapshot && snapshot.lastUrl ? snapshot.lastUrl : "";

    const rawError = extra || (snapshot && snapshot.lastError) || "";
    const errorText = connected ? "" : friendlyError(rawError);
    errorEl.hidden = !errorText;
    errorEl.textContent = errorText;
}

function socketPageUrl() {
    return chrome.runtime.getURL("socket.html");
}

function ensureSocketPage() {
    const url = socketPageUrl();
    chrome.tabs.query({url}, (tabs) => {
        if (chrome.runtime.lastError) {
            statusEl.textContent = chrome.runtime.lastError.message;
            return;
        }
        if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, {method: "connectNow", data: portInput.value});
            return;
        }
        chrome.tabs.create({url, active: false}, () => {
            if (chrome.runtime.lastError) {
                statusEl.textContent = chrome.runtime.lastError.message;
            }
        });
    });
}

function connectFromPopup() {
    const url = "ws://127.0.0.1:" + (portInput.value || DEFAULT_SERVER_PORT) + "/ws";
    connecting = true;
    statusEl.textContent = "";
    setBadge("connecting", "Connecting");
    if (popupWs) {
        popupWs.onclose = null;
        popupWs.close();
    }
    popupWs = new WebSocket(url);
    popupWs.onopen = () => {
        connecting = false;
        statusEl.textContent = "Ready for tab search in Wox.";
        renderStatus({connected: true, lastUrl: url, lastError: ""});
        ensureSocketPage();
    };
    popupWs.onerror = () => {
        connecting = false;
        statusEl.textContent = "";
        renderStatus({connected: false, lastUrl: url, lastError: "popup websocket error"});
    };
    popupWs.onclose = (event) => {
        if (event.code === 1000) {
            return;
        }
        connecting = false;
        renderStatus({
            connected: false,
            lastUrl: url,
            lastError: "popup websocket closed code=" + event.code,
        });
    };
}

function readStoredStatus() {
    if (popupWs && popupWs.readyState === WebSocket.OPEN) {
        renderStatus({connected: true, lastUrl: "ws://127.0.0.1:" + portInput.value + "/ws", lastError: ""});
        return;
    }
    storage().get("connectionStatus", (items) => {
        renderStatus(items.connectionStatus);
    });
}

storage().get({port: DEFAULT_SERVER_PORT}, (items) => {
    if (!chrome.runtime.lastError) {
        portInput.value = items.port || DEFAULT_SERVER_PORT;
    }
    connectFromPopup();
});

saveButton.addEventListener("click", () => {
    storage().set({port: portInput.value}, () => {
        if (chrome.runtime.lastError) {
            statusEl.textContent = chrome.runtime.lastError.message;
            return;
        }
        statusEl.textContent = "Port saved.";
        connectFromPopup();
    });
});

connectButton.addEventListener("click", () => {
    connectFromPopup();
});

setInterval(readStoredStatus, 500);
