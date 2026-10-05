const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const DATA = process.env.DATA_FILE || path.join(__dirname, "pastes.json");
const MAX = 200 * 1024;

let pastes = {};
try { pastes = JSON.parse(fs.readFileSync(DATA, "utf8")); } catch {}
const save = () => fs.writeFile(DATA, JSON.stringify(pastes), () => {});

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const STYLE = `<meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{font-family:system-ui,sans-serif;max-width:860px;margin:0 auto;padding:20px;background:#fafafa;color:#222}
h1{font-size:1.4rem}textarea{width:100%;height:50vh;font:14px ui-monospace,monospace;padding:12px;box-sizing:border-box;border:1px solid #ccc;border-radius:8px}
button{padding:10px 18px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-size:1rem;cursor:pointer}
pre{margin:0;overflow:auto;border-radius:8px}code{font-size:14px}#out{margin-top:14px;word-break:break-all}
@media(prefers-color-scheme:dark){body{background:#111;color:#eee}textarea{background:#1c1c1c;color:#eee;border-color:#444}}
</style>`;

const HOME = `<!doctype html><title>CodeLink</title>${STYLE}
<h1>CodeLink: turn code into a link</h1>
<textarea id="c" placeholder="Paste your code here..."></textarea><br><br>
<button id="b">Create link</button>
<div id="out"></div>
<script>
b.onclick = async () => {
  if (!c.value.trim()) return;
  const r = await fetch("/api/paste", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: c.value }) });
  const d = await r.json();
  if (!r.ok) { out.textContent = d.error; return; }
  const url = location.origin + "/" + d.id;
  out.innerHTML = 'Your link: <a href="' + url + '">' + url + '</a> <button id="cp">Copy</button>';
  cp.onclick = () => { navigator.clipboard.writeText(url); cp.textContent = "Copied!"; };
};
</script>`;

const view = (code) => `<!doctype html><title>CodeLink</title>${STYLE}
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
<h1><a href="/" style="text-decoration:none">CodeLink</a></h1>
<button id="cp">Copy code</button> <a href="RAW">raw</a><br><br>
<pre><code id="code">${esc(code)}</code></pre>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script>hljs.highlightAll();cp.onclick=()=>{navigator.clipboard.writeText(document.getElementById("code").textContent);cp.textContent="Copied!"}</script>`;

const send = (res, code, type, body) => { res.writeHead(code, { "Content-Type": type + "; charset=utf-8" }); res.end(body); };

http.createServer((req, res) => {
  const url = req.url.split("?")[0];

  if (req.method === "GET" && url === "/") return send(res, 200, "text/html", HOME);

  if (req.method === "POST" && url === "/api/paste") {
    let body = "";
    req.on("data", (ch) => { body += ch; if (body.length > MAX + 1000) req.destroy(); });
    req.on("end", () => {
      try {
        const { code } = JSON.parse(body);
        if (typeof code !== "string" || !code.trim() || code.length > MAX)
          return send(res, 400, "application/json", JSON.stringify({ error: "Code is empty or over 200 KB." }));
        let id;
        do { id = crypto.randomBytes(5).toString("base64url"); } while (pastes[id]);
        pastes[id] = code;
        save();
        send(res, 200, "application/json", JSON.stringify({ id }));
      } catch { send(res, 400, "application/json", JSON.stringify({ error: "Bad request." })); }
    });
    return;
  }

  const raw = url.match(/^\/raw\/([\w-]+)$/);
  if (req.method === "GET" && raw && pastes[raw[1]] !== undefined) return send(res, 200, "text/plain", pastes[raw[1]]);

  const m = url.match(/^\/([\w-]+)$/);
  if (req.method === "GET" && m && pastes[m[1]] !== undefined)
    return send(res, 200, "text/html", view(pastes[m[1]]).replace("RAW", "/raw/" + m[1]));

  send(res, 404, "text/plain", "Not found");
}).listen(PORT, () => console.log("CodeLink running on port " + PORT));
