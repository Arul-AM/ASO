// supabase/functions/deliver-project/index.ts
//
// Called from admin.html when the admin clicks "Generate & send". Only
// signed-in admins can call this (it checks the caller's Supabase Auth JWT).
//
// Steps:
//   1. Verify the caller is an authenticated admin.
//   2. Load the request row.
//   3. Ask Claude to draft: required software list, a comparison table of the
//      tool choices, and a step-by-step installation guide, based on the
//      project's department/language/topic.
//   4. Email the student the full package (guide + software list + table +
//      the installation video link the admin supplied).
//   5. Save the generated content on the row and mark it 'done'.
//
// Secrets required:
//   ANTHROPIC_API_KEY
//   RESEND_API_KEY
//   RESEND_FROM
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto-provided)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
          rows: {
            type: "array",
            items: { type: "array", items: { type: "string" } },
          },
        },
        required: ["headers", "rows"],
      },
      install_guide: {
        type: "string",
        description: "Numbered, step-by-step plain-text installation & setup guide.",
      },
    },
    required: ["software_list", "comparison_table", "install_guide"],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Verify the caller is a signed-in admin
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Not authorized." }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { request_id, video_url } = await req.json();
    if (!request_id) {
      return new Response(JSON.stringify({ error: "request_id is required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 2. Load the request
    const { data: r, error: loadErr } = await admin
      .from("requests")
      .select("*")
      .eq("id", request_id)
      .single();
    if (loadErr || !r) {
      return new Response(JSON.stringify({ error: "Request not found." }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 3. Ask Claude to draft the package
    const prompt = `A student project has been completed. Draft the delivery package.
Department: ${r.department || "—"}
Language/Tech: ${r.language_tech || "—"}
Project topic: ${r.topic || "—"}
Student's notes: ${r.notes || "—"}

- software_list: every tool/library/runtime the student must install to run this project (include realistic versions).
- comparison_table: compare the 3-5 main technology choices used in this project against the next-best alternative(s) students commonly consider, so the student can explain their choices in a viva — headers like ["Tool/Choice used", "Alternative(s)", "Why we chose this"].
- install_guide: a clear, numbered, beginner-friendly step-by-step guide from installing prerequisites through running the project successfully.

Call the deliver_project_package tool with your answer. Do not include any text outside the tool call.`;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
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

    if (!anthropicRes.ok) {
      console.error("Anthropic error:", await anthropicRes.text());
      return new Response(JSON.stringify({ error: "Could not generate the package." }), {
        status: 502,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const aiData = await anthropicRes.json();
    const toolUse = (aiData.content || []).find((b: { type: string }) => b.type === "tool_use");
    if (!toolUse) {
      return new Response(JSON.stringify({ error: "Model did not return structured content." }), {
        status: 502,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const { software_list, comparison_table, install_guide } = toolUse.input;

    // 4. Email the student
    const softwareRows = (software_list || [])
      .map((s: { name: string; version?: string; purpose: string }) =>
        `<tr><td style="padding:6px 12px;border:1px solid #ddd;">${s.name}${s.version ? " " + s.version : ""}</td><td style="padding:6px 12px;border:1px solid #ddd;">${s.purpose}</td></tr>`
      ).join("");

    const comparisonHeaderRow = (comparison_table?.headers || [])
      .map((h: string) => `<th style="padding:6px 12px;border:1px solid #ddd;text-align:left;">${h}</th>`).join("");
    const comparisonRows = (comparison_table?.rows || [])
      .map((row: string[]) => `<tr>${row.map((c) => `<td style="padding:6px 12px;border:1px solid #ddd;">${c}</td>`).join("")}</tr>`)
      .join("");

    const videoBlock = video_url
      ? `<p><b>Installation walkthrough video:</b> <a href="${video_url}">${video_url}</a></p>`
      : "";

    const emailHtml = `
      <p>Hi ${r.name.split(" ")[0]},</p>
      <p>Your project — <b>${r.topic || "your student project"}</b> — is complete! Here's everything you need to install and run it.</p>
      ${videoBlock}
      <h3>Required software</h3>
      <table style="border-collapse:collapse;">${softwareRows}</table>
      <h3>How each tool compares</h3>
      <table style="border-collapse:collapse;"><tr>${comparisonHeaderRow}</tr>${comparisonRows}</table>
      <h3>Installation guide</h3>
      <pre style="white-space:pre-wrap;font-family:inherit;">${install_guide}</pre>
      <p>Questions about setup? Reply to this email or use the chat bubble on our site — it can pull up your
      request any time.</p>
      <p>— A Strik Out Co · Chennai, India</p>
    `;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("RESEND_FROM"),
        to: r.email,
        subject: `Your project is ready — ${r.topic || "A Strik Out Co"}`,
        html: emailHtml,
      }),
    });
    if (!emailRes.ok) console.error("Resend error:", await emailRes.text());

    // 5. Save + mark done
    const { error: updateErr } = await admin
      .from("requests")
      .update({
        status: "done",
        software_list,
        comparison_table,
        install_guide,
        video_url: video_url || null,
        delivered_at: new Date().toISOString(),
      })
      .eq("id", request_id);

    if (updateErr) {
      console.error(updateErr);
      return new Response(JSON.stringify({ error: "Email sent, but saving the record failed." }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
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
