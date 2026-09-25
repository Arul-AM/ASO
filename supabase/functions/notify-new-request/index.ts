// supabase/functions/notify-new-request/index.ts
//
// Called by the site (index.html / college-projects.html) right after a new
// row is inserted into `requests`. Sends:
//   1. A notification email to the studio admin.
//   2. An auto-reply confirmation email to the person who submitted the form.
//
// Secrets required:
//   RESEND_API_KEY
//   RESEND_FROM                e.g. "A Strik Out Co <hello@yourdomain.com>"
//   ADMIN_EMAIL                e.g. "astrikout@gmail.com"
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto-provided)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM"),
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) console.error("Resend error:", await res.text());
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { request_id } = await req.json();
    if (!request_id) {
      return new Response(JSON.stringify({ error: "request_id is required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: r, error } = await supabase
      .from("requests")
      .select("*")
      .eq("id", request_id)
      .single();

    if (error || !r) {
      return new Response(JSON.stringify({ error: "request not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const isStudent = r.source === "student";
    const label = isStudent ? (r.topic || "Student project") : (r.project_type || "Project");

    // ---- Admin notification ----
    await sendEmail(
      Deno.env.get("ADMIN_EMAIL")!,
      `New ${r.source} request — ${r.name}`,
      `
      <h2>New ${r.source} request</h2>
      <p><b>Name:</b> ${r.name}<br/>
      <b>Email:</b> ${r.email}<br/>
      <b>Phone:</b> ${r.phone || "—"}</p>
      ${isStudent
        ? `<p><b>Department:</b> ${r.department || "—"}<br/><b>Language/Tech:</b> ${r.language_tech || "—"}<br/><b>Topic:</b> ${r.topic || "—"}<br/><b>Need by:</b> ${r.need_by || "—"}</p>`
        : `<p><b>Project type:</b> ${r.project_type || "—"}<br/><b>Budget range:</b> ${r.budget_range || "—"}</p>`
      }
      <p><b>Notes:</b> ${r.notes || "—"}</p>
      <p>Open the admin dashboard to respond.</p>
      `
    );

    // ---- Client confirmation ----
    await sendEmail(
      r.email,
      `We've got your request — A Strik Out Co`,
      `
      <p>Hi ${r.name.split(" ")[0]},</p>
      <p>Thanks for telling us about <b>${label}</b>. We've received it and will reply with
      ${isStudent ? "a fixed price and delivery date" : "next steps"} within one business day.</p>
      ${isStudent
        ? `<p>Once your project is complete, we'll email you the full package: source files, an installation guide,
           the required software list, a comparison table of the tools used, and an installation walkthrough video.</p>`
        : ""
      }
      <p>Questions in the meantime? Just reply to this email, or use the chat bubble on our site — it can pull up
      your request status any time using this email address.</p>
      <p>— A Strik Out Co · Chennai, India</p>
      `
    );

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
