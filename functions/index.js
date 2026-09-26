// functions/index.js
//
// Three HTTPS Cloud Functions for A Strik Out Co:
//   chat              — public chatbot widget backend, can look up a request by email
//   notifyNewRequest  — sends confirmation + admin emails right after a form submit
//   deliverProject    — admin-only: AI-drafts the software list/comparison table/
//                       install guide for a finished student project, emails it,
//                       marks the request done
//
// Secrets (set once with `firebase functions:secrets:set NAME`):
//   ANTHROPIC_API_KEY
//   RESEND_API_KEY
//   RESEND_FROM     e.g. "A Strik Out Co <hello@yourdomain.com>"
//   ADMIN_EMAIL     e.g. "astrikout@gmail.com"

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

admin.initializeApp();
const db = admin.firestore();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const RESEND_FROM = defineSecret("RESEND_FROM");
const ADMIN_EMAIL = defineSecret("ADMIN_EMAIL");

async function sendEmail({ apiKey, from, to, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) console.error("Resend error:", await res.text());
  return res.ok;
}

function escapeHtml(s) {
  return (s || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ============================================================
// chat
// ============================================================
const SYSTEM_PROMPT = `You are the on-site assistant for A Strik Out Co, a small web studio based in Chennai, India (astrikout@gmail.com).

What we do:
- Services: Web Design, Web Development, E-Commerce, Product & Web Apps, Care & Support.
- Client pricing: Starter ₹8,000–₹15,000 (one-page site, up to 5 sections, 48-hour first preview, 1 revision round). Standard ₹18,000–₹40,000 (up to 6 pages, optional e-commerce/booking, on-page SEO basics, 2 revision rounds, 48-hour first preview, 30 days post-launch support) — our most popular tier. Custom ₹40,000+ (web apps/dashboards, scoped individually, milestone-based).
- Starter and Standard projects are backed by a signed MOU with one fixed delivery date — if we miss it, the remaining balance is waived.
- Domain/hosting, premium plugins/licenses and paid stock assets are billed separately at cost. We collect 30–40% upfront, balance due on on-time delivery.
- Student & college projects (separate track, see the "Student Projects" page): final-year and mini projects for CSE, IT, ECE, EEE and MECH. Software projects are under ₹3,000, hardware/IoT projects under ₹4,000, and CAD/design projects under ₹2,000. We usually reply with a fixed price and delivery date within a day of the request. Once a student project is finished, we email the student the full project package: source files, an installation guide, the required software list, a comparison table of the tools/alternatives used, and an installation walkthrough video.
- We reply to new requests within one business day.

How to talk:
- Be concise, warm, and concrete. Prefer short paragraphs or a short bulleted list over long essays.
- If someone wants a quote or to start a project, point them to the "Start a project" form (general work) or the "Student Projects" page request form (student/college projects), and mention we typically reply within a day.
- If someone asks about the status of a request they already submitted, ask for the email address they used on the form. You will be given a "PROJECT LOOKUP" block with the result of that search when available — use it to answer; if no matching request is found, say so plainly and suggest they double-check the email or contact astrikout@gmail.com.
- Never invent a price, a delivery date, or a project status you don't have information for.
- If asked something you can't answer confidently, say so and suggest emailing astrikout@gmail.com.`;

function extractEmail(text) {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0].toLowerCase() : null;
}

exports.chat = onRequest({ secrets: [ANTHROPIC_API_KEY] }, (req, res) => {
  cors(req, res, async () => {
    try {
      const { message, history } = req.body || {};
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "message is required" });
      }

      let lookupBlock = "";
      const email = extractEmail(message);
      if (email) {
        const snap = await db.collection("requests")
          .where("email", "==", email)
          .orderBy("created_at", "desc")
          .limit(3)
          .get();
        if (!snap.empty) {
          const lines = snap.docs.map((d, i) => {
            const r = d.data();
            const created = r.created_at && r.created_at.toDate ? r.created_at.toDate().toISOString() : "unknown";
            const delivered = r.delivered_at && r.delivered_at.toDate ? r.delivered_at.toDate().toISOString() : null;
            return `${i + 1}. [${r.source}] "${r.topic || r.project_type || "untitled"}" — status: ${r.status}` +
              (r.need_by ? `, needed by: ${r.need_by}` : "") +
              (delivered ? `, delivered: ${delivered}` : "") +
              `, submitted: ${created}`;
          });
          lookupBlock = `\n\nPROJECT LOOKUP for ${email} (most recent first):\n${lines.join("\n")}`;
        } else {
          lookupBlock = `\n\nPROJECT LOOKUP for ${email}: no matching request found.`;
        }
      }

      const priorTurns = Array.isArray(history)
        ? history.slice(-8).map((h) => ({ role: h.role === "assistant" ? "assistant" : "user", content: h.content }))
        : [];

      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY.value(),
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 500,
          system: SYSTEM_PROMPT + lookupBlock,
          messages: [...priorTurns, { role: "user", content: message }],
        }),
      });

      if (!aiRes.ok) {
        console.error("Anthropic error:", await aiRes.text());
        return res.status(502).json({ error: "Assistant is unavailable right now." });
      }
      const aiData = await aiRes.json();
      const reply = (aiData.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      res.json({ reply });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Something went wrong." });
    }
  });
});

// ============================================================
// notifyNewRequest
// ============================================================
exports.notifyNewRequest = onRequest(
  { secrets: [RESEND_API_KEY, RESEND_FROM, ADMIN_EMAIL] },
  (req, res) => {
    cors(req, res, async () => {
      try {
        const { request_id } = req.body || {};
        if (!request_id) return res.status(400).json({ error: "request_id is required" });

        const doc = await db.collection("requests").doc(request_id).get();
        if (!doc.exists) return res.status(404).json({ error: "request not found" });
        const r = doc.data();

        const isStudent = r.source === "student";
        const label = isStudent ? (r.topic || "Student project") : (r.project_type || "Project");
        const apiKey = RESEND_API_KEY.value();
        const from = RESEND_FROM.value();

        await sendEmail({
          apiKey, from, to: ADMIN_EMAIL.value(),
          subject: `New ${r.source} request — ${r.name}`,
          html: `
            <h2>New ${r.source} request</h2>
            <p><b>Name:</b> ${escapeHtml(r.name)}<br/>
            <b>Email:</b> ${escapeHtml(r.email)}<br/>
            <b>Phone:</b> ${escapeHtml(r.phone || "—")}</p>
            ${isStudent
              ? `<p><b>Department:</b> ${escapeHtml(r.department || "—")}<br/><b>Language/Tech:</b> ${escapeHtml(r.language_tech || "—")}<br/><b>Topic:</b> ${escapeHtml(r.topic || "—")}<br/><b>Need by:</b> ${escapeHtml(r.need_by || "—")}</p>`
              : `<p><b>Project type:</b> ${escapeHtml(r.project_type || "—")}<br/><b>Budget range:</b> ${escapeHtml(r.budget_range || "—")}</p>`}
            <p><b>Notes:</b> ${escapeHtml(r.notes || "—")}</p>
            <p>Open the admin dashboard to respond.</p>
          `,
        });

        await sendEmail({
          apiKey, from, to: r.email,
          subject: `We've got your request — A Strik Out Co`,
          html: `
            <p>Hi ${escapeHtml(r.name.split(" ")[0])},</p>
            <p>Thanks for telling us about <b>${escapeHtml(label)}</b>. We've received it and will reply with
            ${isStudent ? "a fixed price and delivery date" : "next steps"} within one business day.</p>
            ${isStudent ? `<p>Once your project is complete, we'll email you the full package: source files, an installation guide,
               the required software list, a comparison table of the tools used, and an installation walkthrough video.</p>` : ""}
            <p>Questions in the meantime? Just reply to this email, or use the chat bubble on our site — it can pull up
            your request status any time using this email address.</p>
            <p>— A Strik Out Co · Chennai, India</p>
          `,
        });

        res.json({ ok: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Something went wrong." });
      }
    });
  }
);

// ============================================================
// deliverProject (admin only)
// ============================================================
const GUIDE_TOOL = {
  name: "deliver_project_package",
  description: "Return the finished project package content.",
  input_schema: {
    type: "object",
    properties: {
      software_list: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            version: { type: "string" },
            purpose: { type: "string" },
          },
          required: ["name", "purpose"],
        },
      },
      comparison_table: {
        type: "object",
        properties: {
          headers: { type: "array", items: { type: "string" } },
          rows: { type: "array", items: { type: "array", items: { type: "string" } } },
        },
        required: ["headers", "rows"],
      },
      install_guide: { type: "string", description: "Numbered, step-by-step plain-text installation & setup guide." },
    },
    required: ["software_list", "comparison_table", "install_guide"],
  },
};

exports.deliverProject = onRequest(
  { secrets: [ANTHROPIC_API_KEY, RESEND_API_KEY, RESEND_FROM] },
  (req, res) => {
    cors(req, res, async () => {
      try {
        // 1. Verify the caller is a signed-in admin (any Firebase Auth user —
        //    since only you create accounts via the console, any authenticated
        //    user is trusted as an admin).
        const authHeader = req.headers.authorization || "";
        const idToken = authHeader.replace("Bearer ", "");
        if (!idToken) return res.status(401).json({ error: "Not authorized." });
        try {
          await admin.auth().verifyIdToken(idToken);
        } catch (e) {
          return res.status(401).json({ error: "Not authorized." });
        }

        const { request_id, video_url } = req.body || {};
        if (!request_id) return res.status(400).json({ error: "request_id is required" });

        const docRef = db.collection("requests").doc(request_id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ error: "Request not found." });
        const r = doc.data();

        const prompt = `A student project has been completed. Draft the delivery package.
Department: ${r.department || "—"}
Language/Tech: ${r.language_tech || "—"}
Project topic: ${r.topic || "—"}
Student's notes: ${r.notes || "—"}

- software_list: every tool/library/runtime the student must install to run this project (include realistic versions).
- comparison_table: compare the 3-5 main technology choices used in this project against the next-best alternative(s) students commonly consider, so the student can explain their choices in a viva — headers like ["Tool/Choice used", "Alternative(s)", "Why we chose this"].
- install_guide: a clear, numbered, beginner-friendly step-by-step guide from installing prerequisites through running the project successfully.

Call the deliver_project_package tool with your answer. Do not include any text outside the tool call.`;

        const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY.value(),
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 2000,
            tools: [GUIDE_TOOL],
            tool_choice: { type: "tool", name: "deliver_project_package" },
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (!aiRes.ok) {
          console.error("Anthropic error:", await aiRes.text());
          return res.status(502).json({ error: "Could not generate the package." });
        }
        const aiData = await aiRes.json();
        const toolUse = (aiData.content || []).find((b) => b.type === "tool_use");
        if (!toolUse) return res.status(502).json({ error: "Model did not return structured content." });
        const { software_list, comparison_table, install_guide } = toolUse.input;

        const softwareRows = (software_list || [])
          .map((s) => `<tr><td style="padding:6px 12px;border:1px solid #ddd;">${escapeHtml(s.name)}${s.version ? " " + escapeHtml(s.version) : ""}</td><td style="padding:6px 12px;border:1px solid #ddd;">${escapeHtml(s.purpose)}</td></tr>`)
          .join("");
        const comparisonHeaderRow = (comparison_table?.headers || [])
          .map((h) => `<th style="padding:6px 12px;border:1px solid #ddd;text-align:left;">${escapeHtml(h)}</th>`).join("");
        const comparisonRows = (comparison_table?.rows || [])
          .map((row) => `<tr>${row.map((c) => `<td style="padding:6px 12px;border:1px solid #ddd;">${escapeHtml(c)}</td>`).join("")}</tr>`)
          .join("");
        const videoBlock = video_url ? `<p><b>Installation walkthrough video:</b> <a href="${video_url}">${escapeHtml(video_url)}</a></p>` : "";

        const emailHtml = `
          <p>Hi ${escapeHtml(r.name.split(" ")[0])},</p>
          <p>Your project — <b>${escapeHtml(r.topic || "your student project")}</b> — is complete! Here's everything you need to install and run it.</p>
          ${videoBlock}
          <h3>Required software</h3>
          <table style="border-collapse:collapse;">${softwareRows}</table>
          <h3>How each tool compares</h3>
          <table style="border-collapse:collapse;"><tr>${comparisonHeaderRow}</tr>${comparisonRows}</table>
          <h3>Installation guide</h3>
          <pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(install_guide)}</pre>
          <p>Questions about setup? Reply to this email or use the chat bubble on our site — it can pull up your
          request any time.</p>
          <p>— A Strik Out Co · Chennai, India</p>
        `;

        await sendEmail({
          apiKey: RESEND_API_KEY.value(),
          from: RESEND_FROM.value(),
          to: r.email,
          subject: `Your project is ready — ${r.topic || "A Strik Out Co"}`,
          html: emailHtml,
        });

        await docRef.update({
          status: "done",
          software_list,
          comparison_table,
          install_guide,
          video_url: video_url || null,
          delivered_at: admin.firestore.FieldValue.serverTimestamp(),
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        });

        res.json({ ok: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Something went wrong." });
      }
    });
  }
);
