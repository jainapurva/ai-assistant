import { NextResponse } from "next/server";
import { BOT_API_URL } from "@/lib/constants";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const installationId = url.searchParams.get("installation_id");
  const setupAction = url.searchParams.get("setup_action");

  // User uninstalled the app
  if (setupAction === "install" && !code) {
    return new Response(successPage("GitHub App installed! Return to WhatsApp and type /repos to see your repos."), {
      headers: { "Content-Type": "text/html" },
    });
  }

  if (!code || !state || !installationId) {
    return new Response(errorPage("Missing parameters. Please use /github in WhatsApp to connect."), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  try {
    const res = await fetch(`${BOT_API_URL}/github/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state, installationId }),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      return new Response(errorPage(data.error || "Failed to connect GitHub."), {
        status: 400,
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response(
      successPage(`GitHub connected as *${data.account}*! Return to WhatsApp and type /repos to see your repos.`),
      { headers: { "Content-Type": "text/html" } }
    );
  } catch {
    return new Response(errorPage("Server error. Please try again."), {
      status: 500,
      headers: { "Content-Type": "text/html" },
    });
  }
}

function successPage(message: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GitHub Connected - Swayat</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f8fafc}
.card{text-align:center;padding:2rem;max-width:400px;background:white;border-radius:1rem;box-shadow:0 1px 3px rgba(0,0,0,.1)}
h1{font-size:1.5rem;color:#0f172a;margin-bottom:.5rem}p{color:#475569;line-height:1.6}</style></head>
<body><div class="card"><h1>Connected!</h1><p>${message}</p></div></body></html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Error - Swayat</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f8fafc}
.card{text-align:center;padding:2rem;max-width:400px;background:white;border-radius:1rem;box-shadow:0 1px 3px rgba(0,0,0,.1)}
h1{font-size:1.5rem;color:#dc2626;margin-bottom:.5rem}p{color:#475569;line-height:1.6}</style></head>
<body><div class="card"><h1>Error</h1><p>${message}</p></div></body></html>`;
}
