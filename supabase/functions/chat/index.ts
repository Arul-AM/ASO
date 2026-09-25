// supabase/functions/chat/index.ts
//
// Public chatbot used by the widget on every page. Answers questions about
// services, pricing and process, and — if the visitor shares the email they
// used on a request form — looks up their project's current status.
//
// Secrets required (Dashboard → Edge Functions → chat → Secrets, or via CLI):
//   ANTHROPIC_API_KEY
//   SUPABASE_URL              (auto-provided by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY (auto-provided by Supabase)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

function extractEmail(text: string): string | null {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0].toLowerCase() : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { message, history } = await req.json();
    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ---- Optional: look up a request by email mentioned in the message ----
    let lookupBlock = "";
    const email = extractEmail(message);
    if (email) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data } = await supabase
        .from("requests")
        .select("source, topic, project_type, status, need_by, created_at, delivered_at")
        .eq("email", email)
        .order("created_at", { ascending: false })
        .limit(3);

      if (data && data.length) {
        lookupBlock = `\n\nPROJECT LOOKUP for ${email} (most recent first):\n` +
          data.map((r, i) =>
            `${i + 1}. [${r.source}] "${r.topic || r.project_type || "untitled"}" — status: ${r.status}` +
            (r.need_by ? `, needed by: ${r.need_by}` : "") +
            (r.delivered_at ? `, delivered: ${r.delivered_at}` : "") +
            `, submitted: ${r.created_at}`
          ).join("\n");
      } else {
        lookupBlock = `\n\nPROJECT LOOKUP for ${email}: no matching request found.`;
      }
    }

    const priorTurns = Array.isArray(history)
      ? history.slice(-8).map((h: { role: string; content: string }) => ({
          role: h.role === "assistant" ? "assistant" : "user",
          content: h.content,
        }))
      : [];

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        system: SYSTEM_PROMPT + lookupBlock,
        messages: [...priorTurns, { role: "user", content: message }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic error:", errText);
      return new Response(JSON.stringify({ error: "Assistant is unavailable right now." }), {
        status: 502,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const data = await anthropicRes.json();
    const reply = (data.content || [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n");

    return new Response(JSON.stringify({ reply }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Something went wrong." }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
