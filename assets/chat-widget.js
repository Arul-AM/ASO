// A Strik Out Co — site-wide chat widget.
// Include after supabase-js, assets/config.js and assets/aso-client.js.
(function () {
  const STORAGE_KEY = "aso-chat-history";
  const OPEN_KEY = "aso-chat-open";

  const css = `
  #aso-chat-btn{
    position:fixed; right:24px; bottom:24px; z-index:500;
    width:56px; height:56px; border-radius:50%; border:none; cursor:pointer;
    background:#dcff4f; color:#0a0a0a; font-family:'Space Grotesk',sans-serif; font-weight:700;
    display:flex; align-items:center; justify-content:center; font-size:22px;
    box-shadow:0 8px 24px rgba(0,0,0,0.35); transition:transform .2s ease;
  }
  #aso-chat-btn:hover{ transform:scale(1.07); }
  #aso-chat-panel{
    position:fixed; right:24px; bottom:92px; z-index:500; width:340px; max-width:calc(100vw - 32px);
    height:440px; max-height:calc(100vh - 140px); background:#0a0a0a; color:#f4f3ee;
    border:1px solid rgba(244,243,238,0.16); border-radius:12px; display:none;
    flex-direction:column; overflow:hidden; box-shadow:0 20px 50px rgba(0,0,0,0.5);
    font-family:'Space Grotesk',sans-serif;
  }
  #aso-chat-panel.open{ display:flex; }
  #aso-chat-head{
    padding:14px 16px; border-bottom:1px solid rgba(244,243,238,0.14);
    display:flex; align-items:center; justify-content:space-between; flex-shrink:0;
  }
  #aso-chat-head strong{ font-size:14px; }
  #aso-chat-head span{ font-size:12px; color:#8f8c82; display:block; margin-top:2px; }
  #aso-chat-close{ background:none; border:none; color:#f4f3ee; font-size:18px; cursor:pointer; line-height:1; }
  #aso-chat-log{ flex:1; overflow-y:auto; padding:14px 16px; display:flex; flex-direction:column; gap:10px; }
  .aso-msg{ font-size:13.5px; line-height:1.45; padding:9px 12px; border-radius:10px; max-width:88%; white-space:pre-wrap; }
  .aso-msg.user{ align-self:flex-end; background:#dcff4f; color:#0a0a0a; border-bottom-right-radius:2px; }
  .aso-msg.bot{ align-self:flex-start; background:#1c1c16; border:1px solid rgba(244,243,238,0.1); border-bottom-left-radius:2px; }
  .aso-msg.typing{ opacity:.6; font-style:italic; }
  #aso-chat-form{ display:flex; gap:8px; padding:12px; border-top:1px solid rgba(244,243,238,0.14); flex-shrink:0; }
  #aso-chat-input{
    flex:1; background:#141410; border:1px solid rgba(244,243,238,0.18); border-radius:8px;
    color:#f4f3ee; padding:9px 10px; font-size:13.5px; font-family:inherit; resize:none;
  }
  #aso-chat-input:focus{ outline:2px solid #dcff4f; outline-offset:1px; }
  #aso-chat-send{
    background:#dcff4f; color:#0a0a0a; border:none; border-radius:8px; padding:0 14px;
    font-weight:700; cursor:pointer; font-size:13px;
  }
  #aso-chat-send:disabled{ opacity:.5; cursor:default; }
  @media (max-width:480px){ #aso-chat-panel{ right:16px; left:16px; width:auto; bottom:84px; } #aso-chat-btn{ right:16px; bottom:16px; } }
  `;

  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function loadHistory() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]"); }
    catch (e) { return []; }
  }
  function saveHistory(h) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(h.slice(-16)));
  }

  function init() {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    const btn = el("button", { id: "aso-chat-btn", "aria-label": "Open chat", type: "button" }, "💬");
    const panel = el("div", { id: "aso-chat-panel" });
    panel.innerHTML = `
      <div id="aso-chat-head">
        <div><strong>A Strik Out Co</strong><span>Ask about pricing, process, or your request</span></div>
        <button id="aso-chat-close" type="button" aria-label="Close chat">✕</button>
      </div>
      <div id="aso-chat-log"></div>
      <form id="aso-chat-form">
        <textarea id="aso-chat-input" rows="1" placeholder="Type a message…"></textarea>
        <button id="aso-chat-send" type="submit">Send</button>
      </form>
    `;
    document.body.appendChild(btn);
    document.body.appendChild(panel);

    const log = panel.querySelector("#aso-chat-log");
    const form = panel.querySelector("#aso-chat-form");
    const input = panel.querySelector("#aso-chat-input");
    const sendBtn = panel.querySelector("#aso-chat-send");

    let history = loadHistory();

    function render() {
      log.innerHTML = "";
      if (!history.length) {
        log.appendChild(el("div", { class: "aso-msg bot" },
          "Hi! I'm the A Strik Out Co assistant. Ask me about pricing, our process, or the status of a request you've already submitted (share the email you used on the form)."));
      }
      history.forEach((m) => {
        log.appendChild(el("div", { class: "aso-msg " + (m.role === "user" ? "user" : "bot") }, escapeHtml(m.content)));
      });
      log.scrollTop = log.scrollHeight;
    }
    function escapeHtml(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function setOpen(open) {
      panel.classList.toggle("open", open);
      sessionStorage.setItem(OPEN_KEY, open ? "1" : "0");
      if (open) { render(); input.focus(); }
    }

    btn.addEventListener("click", () => setOpen(!panel.classList.contains("open")));
    panel.querySelector("#aso-chat-close").addEventListener("click", () => setOpen(false));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      history.push({ role: "user", content: text });
      saveHistory(history);
      render();

      sendBtn.disabled = true;
      const typing = el("div", { class: "aso-msg bot typing" }, "…thinking");
      log.appendChild(typing);
      log.scrollTop = log.scrollHeight;

      try {
        const res = await fetch(window.ASO_FUNCTIONS_BASE + "/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history: history.slice(0, -1) }),
        });
        const data = await res.json();
        typing.remove();
        const reply = data.reply || data.error || "Sorry, I couldn't reply just now — try emailing astrikout@gmail.com.";
        history.push({ role: "assistant", content: reply });
        saveHistory(history);
        render();
      } catch (err) {
        typing.remove();
        history.push({ role: "assistant", content: "Sorry, I couldn't reach the assistant. Try again in a moment or email astrikout@gmail.com." });
        saveHistory(history);
        render();
      } finally {
        sendBtn.disabled = false;
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
    });

    if (sessionStorage.getItem(OPEN_KEY) === "1") setOpen(true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
