import { NextResponse } from "next/server";
import { createAdminToken, ADMIN_COOKIE, ADMIN_SESSION_MAX_AGE } from "@/lib/admin-auth";

/**
 * POST /api/admin/login
 * Body: { password }
 * Sets an httpOnly signed session cookie on success.
 */
export async function POST(request: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return NextResponse.json(
      { error: "Admin login is not configured (ADMIN_PASSWORD missing)" },
      { status: 500 }
    );
  }

  let password = "";
  try {
    const body = await request.json();
    password = body.password || "";
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (password !== adminPassword) {
    // Small delay to slow down brute force
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const token = await createAdminToken();
  const res = NextResponse.json({ success: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE,
  });
  return res;
}

/** DELETE /api/admin/login — logout */
export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
