(() => {
    const vscode = acquireVsCodeApi();
    const servers = document.getElementById("servers");
    const notice = document.getElementById("notice");

    document.getElementById("add").addEventListener("click", () => vscode.postMessage({ type: "addServer" }));
    document.getElementById("settings").addEventListener("click", () => vscode.postMessage({ type: "openSettings" }));
    document.getElementById("refresh").addEventListener("click", () => vscode.postMessage({ type: "refresh" }));

    servers.addEventListener("click", (event) => {
        const action = event.target.dataset?.action;
        const id = event.target.dataset?.id;
        if (action && id) vscode.postMessage({ type: action, id });
    });

    window.addEventListener("message", (event) => {
        const message = event.data;
        if (message.type !== "servers") return;
        render(message.servers, message.workspaceTrusted);
    });

    function render(list, workspaceTrusted) {
        servers.textContent = "";
        notice.textContent = list.length ? "" : "No MCP servers configured. Add one to connect the agent to external tools.";
        for (const server of list) {
            servers.appendChild(renderServer(server, workspaceTrusted));
        }
    }

    function renderServer(server, workspaceTrusted) {
        const container = document.createElement("article");
        container.className = `server ${server.trust === "trusted" ? "trusted" : "untrusted"}`;

        const name = document.createElement("div");
        name.className = "name";
        const label = document.createElement("span");
        label.textContent = server.serverName ? `${server.label} (${server.serverName})` : server.label;
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = server.source === "workspace" ? "from workspace" : server.source;
        name.append(label, badge);

        const risk = document.createElement("div");
        risk.className = "risk";
        risk.textContent = server.riskSummary;

        const detail = document.createElement("div");
        detail.className = "detail";
        detail.textContent = server.riskDetail;

        const status = document.createElement("div");
        status.className = server.trust === "trusted" ? "status" : "status warning";
        status.textContent = server.status;

        container.append(name, risk, detail, status);

        if (server.source === "workspace") {
            const caution = document.createElement("div");
            caution.className = "status warning";
            caution.textContent = server.trust === "trusted"
                ? "Defined by the opened workspace."
                : "Defined by the opened workspace. Trust only if you trust this repository.";
            container.appendChild(caution);
        }
        if (server.transport === "stdio" && !workspaceTrusted) {
            const caution = document.createElement("div");
            caution.className = "status warning";
            caution.textContent = "Local servers run only in a trusted workspace.";
            container.appendChild(caution);
        }

        container.appendChild(renderActions(server));
        if (server.tools.length) container.appendChild(renderTools(server.tools));
        return container;
    }

    function renderActions(server) {
        const actions = document.createElement("div");
        actions.className = "actions";
        if (server.trust === "trusted") {
            actions.appendChild(button(server.connected ? "Disconnect" : "Connect", server.connected ? "disconnect" : "connect", server.id));
            actions.appendChild(button("Revoke Trust", "revoke", server.id, true));
        } else {
            actions.appendChild(button(server.trust === "changed" ? "Review and Trust" : "Trust and Connect", "trust", server.id));
        }
        if (server.canAuthorize) actions.appendChild(button("Sign In", "authorize", server.id, true));
        actions.appendChild(button(server.hasCredential ? "Replace Token" : "Set Token", "setToken", server.id, true));
        if (server.hasCredential) actions.appendChild(button("Delete Token", "deleteToken", server.id, true));
        return actions;
    }

    function renderTools(tools) {
        const container = document.createElement("div");
        container.className = "tools";
        const heading = document.createElement("div");
        heading.textContent = `${tools.length} tool${tools.length === 1 ? "" : "s"} available`;
        container.appendChild(heading);
        for (const tool of tools.slice(0, 12)) {
            const row = document.createElement("div");
            row.className = "tool";
            row.textContent = tool.title ? `${tool.name} — ${tool.title}` : tool.name;
            container.appendChild(row);
        }
        if (tools.length > 12) {
            const more = document.createElement("div");
            more.className = "tool";
            more.textContent = `…and ${tools.length - 12} more`;
            container.appendChild(more);
        }
        return container;
    }

    function button(text, action, id, secondary) {
        const element = document.createElement("button");
        element.textContent = text;
        element.dataset.action = action;
        element.dataset.id = id;
        if (secondary) element.className = "secondary";
        return element;
    }

    vscode.postMessage({ type: "ready" });
})();
