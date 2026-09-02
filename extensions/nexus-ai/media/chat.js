(() => {
    const vscode = acquireVsCodeApi();
    const transcript = document.getElementById("transcript");
    const promptInput = document.getElementById("prompt");
    const sendButton = document.getElementById("send");
    const statusNode = document.getElementById("status");
    const contextKind = document.getElementById("contextKind");
    const attachments = document.getElementById("attachments");
    const conversation = document.getElementById("conversation");
    const quality = document.getElementById("quality");
    const qualityBar = document.getElementById("qualityBar");
    const maxRounds = document.getElementById("maxRounds");
    let mode = "ask";
    let running = false;
    let responseNode;
    let statusText = "Starting...";
    let runStartedAt = 0;
    let elapsedTimer;

    document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => {
        mode = button.dataset.mode;
        document.querySelectorAll("[data-mode]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
        promptInput.placeholder = mode === "loop" ? "Describe a task to build, critique, and refine..." : mode === "agent" ? "Describe a coding task..." : mode === "design" ? "Describe what you want to design..." : "Ask about this workspace...";
        quality.classList.toggle("visible", mode === "loop");
    }));

    function submit() {
        if (running) {
            vscode.postMessage({ type: "stop" });
            return;
        }
        if (!promptInput.value.trim()) return;
        vscode.postMessage({ type: "send", prompt: promptInput.value, mode, qualityBar: qualityBar.value, maxRounds: Number(maxRounds.value) });
        promptInput.value = "";
    }

    sendButton.addEventListener("click", submit);
    document.getElementById("attach").addEventListener("click", () => vscode.postMessage({ type: "attach", kind: contextKind.value }));
    document.getElementById("regenerate").addEventListener("click", () => { if (!running) vscode.postMessage({ type: "regenerate" }); });
    document.getElementById("newConversation").addEventListener("click", () => vscode.postMessage({ type: "newConversation" }));
    conversation.addEventListener("change", () => vscode.postMessage({ type: "selectConversation", id: conversation.value }));
    attachments.addEventListener("click", (event) => {
        const id = event.target.dataset.remove;
        if (id) vscode.postMessage({ type: "removeAttachment", id });
    });
    promptInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
        }
    });

    window.addEventListener("message", (event) => {
        const message = event.data;
        if (message.type === "status") setStatus(message.text);
        if (message.type === "conversations") {
            conversation.textContent = "";
            message.conversations.forEach((item) => {
                const option = document.createElement("option");
                option.value = item.id;
                option.textContent = item.title;
                option.selected = item.id === message.activeId;
                conversation.appendChild(option);
            });
        }
        if (message.type === "attachments") {
            attachments.textContent = "";
            message.attachments.forEach((item) => {
                const chip = document.createElement("span");
                chip.className = "attachment";
                const text = document.createElement("span");
                text.textContent = item.label;
                const remove = document.createElement("button");
                remove.dataset.remove = item.id;
                remove.title = "Remove context";
                remove.setAttribute("aria-label", `Remove ${item.label}`);
                remove.textContent = "x";
                chip.append(text, remove);
                attachments.appendChild(chip);
            });
        }
        if (message.type === "removeLast") {
            const messages = transcript.querySelectorAll(".message");
            messages[messages.length - 1]?.remove();
            messages[messages.length - 2]?.remove();
        }
        if (message.type === "cleared") {
            transcript.innerHTML = '<div id="empty" class="empty"><div class="mark">N</div><strong>Nexus AI</strong><span>Cloud free-tier routes with local fallback.</span></div>';
            attachments.textContent = "";
            finish("Ready");
        }
        if (message.type === "restore") {
            if (message.turns.length) document.getElementById("empty")?.remove();
            message.turns.forEach((turn) => appendTurn(turn.prompt, turn.meta, turn.response, turn.route, turn.createdAt, turn.completedAt));
        }
        if (message.type === "runStart") {
            document.getElementById("empty")?.remove();
            running = true;
            runStartedAt = Date.now();
            clearInterval(elapsedTimer);
            elapsedTimer = setInterval(renderStatus, 1_000);
            sendButton.textContent = "Stop";
            sendButton.title = "Stop";
            setStatus("Preparing routes");
            responseNode = appendTurn(message.prompt, message.meta, "", "", message.createdAt);
            transcript.scrollTop = transcript.scrollHeight;
        }
        if (message.type === "delta" && responseNode) {
            responseNode.textContent += message.text;
            transcript.scrollTop = transcript.scrollHeight;
        }
        if (message.type === "agentActivity" && responseNode) {
            let activity = responseNode.parentElement.querySelector(".activity");
            if (!activity) {
                activity = document.createElement("div");
                activity.className = "activity";
                responseNode.parentElement.insertBefore(activity, responseNode.parentElement.querySelector(".route"));
            }
            activity.textContent += `${activity.textContent ? "\n" : ""}${message.text}`;
            activity.scrollTop = activity.scrollHeight;
            transcript.scrollTop = transcript.scrollHeight;
        }
        if (message.type === "runDone") {
            const routes = transcript.querySelectorAll(".route");
            if (routes.length) routes[routes.length - 1].textContent = message.route;
            if (responseNode) responseNode.parentElement.querySelector("header span").textContent = formatTime(message.completedAt);
            finish("Ready");
        }
        if (message.type === "runError") {
            if (responseNode) responseNode.textContent = message.preserve ? `${responseNode.textContent}\n\n${message.text}` : message.text;
            const routes = transcript.querySelectorAll(".route");
            if (routes.length) routes[routes.length - 1].textContent = message.route;
            finish("Error");
        }
        if (message.type === "runStopped") finish("Stopped");
    });

    function appendTurn(promptText, meta, responseText, routeText, createdAt, completedAt) {
        transcript.insertAdjacentHTML("beforeend", '<article class="message user"><header><strong>You</strong><span></span></header><p></p></article><article class="message assistant"><header><strong>Nexus AI</strong><span></span></header><p></p><div class="route"></div></article>');
        const messages = transcript.querySelectorAll(".message");
        const user = messages[messages.length - 2];
        const assistant = messages[messages.length - 1];
        user.querySelector("p").textContent = promptText;
        user.querySelector("header span").textContent = [meta, formatTime(createdAt)].filter(Boolean).join(" · ");
        assistant.querySelector("p").textContent = responseText;
        assistant.querySelector("header span").textContent = formatTime(completedAt);
        assistant.querySelector(".route").textContent = routeText;
        return assistant.querySelector("p");
    }

    function finish(text) {
        running = false;
        clearInterval(elapsedTimer);
        elapsedTimer = undefined;
        sendButton.textContent = "↑";
        sendButton.title = "Send";
        runStartedAt = 0;
        setStatus(text);
        responseNode = undefined;
    }

    function setStatus(text) {
        statusText = text;
        renderStatus();
    }

    function renderStatus() {
        const elapsed = runStartedAt ? ` · ${Math.floor((Date.now() - runStartedAt) / 1_000)}s` : "";
        statusNode.textContent = `${statusText}${elapsed}`;
    }

    function formatTime(value) {
        if (!value) return "";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
    }

    vscode.postMessage({ type: "ready" });
})();
