const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8068";

export async function GET(request: Request) {
  try {
    const response = await fetch(`${API_BASE_URL}/rbac/users`, {
      headers: {
        Authorization: request.headers.get("Authorization") ?? ""
      },
      cache: "no-store"
    });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "application/json"
      }
    });
  } catch {
    return Response.json(
      { detail: `Could not reach the API at ${API_BASE_URL}. Make sure the FastAPI server is running.` },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.text();
    const response = await fetch(`${API_BASE_URL}/rbac/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: request.headers.get("Authorization") ?? ""
      },
      body: payload,
      cache: "no-store"
    });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "application/json"
      }
    });
  } catch {
    return Response.json(
      { detail: `Could not reach the API at ${API_BASE_URL}. Make sure the FastAPI server is running.` },
      { status: 502 }
    );
  }
}
