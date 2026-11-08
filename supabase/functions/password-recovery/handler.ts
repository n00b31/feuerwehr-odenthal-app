export interface RecoveryConfiguration {
  url: string;
  publicKey: string;
  serviceKey: string;
  recoveryUrl: string;
  allowedOrigins: string[];
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const email = /^[^@\s]+@feuerwehr-odenthal\.de$/i;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

export function createRecoveryHandler(configuration: RecoveryConfiguration, requestFetch: typeof fetch = fetch,
  report: (code: string) => void = (code) => console.error("password_recovery", code)) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store", "vary": "Origin" });
    const respond = (status: number, code: string) => new Response(JSON.stringify(
      status === 200 ? { status: "conditional" } : { code }), { status, headers });
    if (origin && !configuration.allowedOrigins.includes(origin)) return respond(403, "origin_denied");
    if (origin) headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-headers", "authorization, apikey, content-type, x-client-info");
    headers.set("access-control-allow-methods", "POST, OPTIONS");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return respond(405, "method_denied");
    if (!request.headers.get("content-type")?.startsWith("application/json")) return respond(400, "invalid_request");
    let input: unknown;
    try {
      const reader = request.body?.getReader();
      if (!reader) return respond(400, "invalid_request");
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > 1024) { await reader.cancel(); return respond(400, "invalid_request"); }
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      input = JSON.parse(new TextDecoder().decode(bytes));
    } catch { return respond(400, "invalid_request"); }
    if (!object(input) || !["self", "admin", "exchange"].includes(String(input.mode))) return respond(400, "invalid_request");
    const admin = input.mode === "admin";
    const exchange = input.mode === "exchange";
    const keys = exchange ? ["mode", "request_id", "code"] : ["mode", admin ? "target_user" : "email"];
    if (Object.keys(input).some((key) => !keys.includes(key))) return respond(400, "invalid_request");
    if (exchange ? typeof input.request_id !== "string" || !uuid.test(input.request_id) || typeof input.code !== "string" || !input.code || input.code.length > 512
      : admin ? typeof input.target_user !== "string" || !uuid.test(input.target_user)
      : typeof input.email !== "string" || input.email.length > 254 || !email.test(input.email.trim())) {
      return respond(400, "invalid_request");
    }
    const serviceHeaders = { apikey: configuration.serviceKey, authorization: `Bearer ${configuration.serviceKey}`, "content-type": "application/json" };
    let requestId: string | null = null;
    let mailOutcome = "unknown";
    let adminAuthorized = false;
    async function rpc(name: string, body: object, authHeaders = serviceHeaders) {
      return requestFetch(`${configuration.url}/rest/v1/rpc/${name}`, {
        method: "POST", headers: authHeaders, body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
      });
    }
    try {
      if (exchange) {
        const intake = await rpc("ff_allow_self_recovery_request", {});
        if (!intake.ok) throw new Error("intake_unavailable");
        const allowed: unknown = await intake.json();
        if (allowed === false) return respond(429, "request_rate_limit");
        if (allowed !== true) throw new Error("intake_invalid");
        const claim = await rpc("ff_claim_recovery_verifier", { request_id: input.request_id });
        if (!claim.ok) throw new Error("claim_unavailable");
        const proof: unknown = await claim.json();
        if (!object(proof) || typeof proof.verifier !== "string" || typeof proof.user_id !== "string") return respond(400, "recovery_invalid");
        const grant = await requestFetch(`${configuration.url}/auth/v1/token?grant_type=pkce`, {
          method: "POST", headers: { apikey: configuration.publicKey, "content-type": "application/json" },
          body: JSON.stringify({ auth_code: input.code, code_verifier: proof.verifier }), signal: AbortSignal.timeout(8000),
        });
        if (!grant.ok) return respond(400, "recovery_invalid");
        const session: unknown = await grant.json();
        if (!object(session) || !object(session.user) || session.user.id !== proof.user_id
          || typeof session.access_token !== "string" || typeof session.refresh_token !== "string") throw new Error("grant_identity_invalid");
        return new Response(JSON.stringify({ status: "verified", user_id: proof.user_id,
          session: { access_token: session.access_token, refresh_token: session.refresh_token } }), { status: 200, headers });
      }
      let reservation: Response;
      if (admin) {
        const authorization = request.headers.get("authorization") ?? "";
        if (!/^Bearer .{1,4096}$/.test(authorization)) return respond(401, "authentication_required");
        const userResponse = await requestFetch(`${configuration.url}/auth/v1/user`, {
          headers: { apikey: configuration.publicKey, authorization }, signal: AbortSignal.timeout(8000),
        });
        if (userResponse.status === 401 || userResponse.status === 403) return respond(401, "authentication_required");
        if (!userResponse.ok) throw new Error("identity_unavailable");
        const user: unknown = await userResponse.json();
        if (!object(user) || typeof user.id !== "string" || !uuid.test(user.id)) throw new Error("identity_invalid");
        reservation = await rpc("ff_begin_admin_password_recovery", { target_user: input.target_user }, {
          apikey: configuration.publicKey, authorization, "content-type": "application/json",
        });
        if (reservation.status === 403 || reservation.status === 401) return respond(403, "administration_required");
        adminAuthorized = reservation.ok;
      } else {
        const intake = await rpc("ff_allow_self_recovery_request", {});
        if (!intake.ok) throw new Error("intake_unavailable");
        const allowed: unknown = await intake.json();
        if (allowed === false) return respond(429, "request_rate_limit");
        if (allowed !== true) throw new Error("intake_invalid");
        reservation = await rpc("ff_begin_self_password_recovery", { request_email: String(input.email).trim().toLowerCase() });
      }
      if (!reservation.ok) throw new Error("reservation_unavailable");
      const reserved: unknown = await reservation.json();
      if (!object(reserved) || typeof reserved.accepted !== "boolean") throw new Error("reservation_invalid");
      if (!reserved.accepted) return admin
        ? respond(reserved.reason === "limited" ? 429 : 400, reserved.reason === "limited" ? "request_rate_limit" : "verified_account_required")
        : respond(200, "conditional");
      if (typeof reserved.request_id !== "string" || !uuid.test(reserved.request_id)
        || typeof reserved.email !== "string" || !email.test(reserved.email)) throw new Error("reservation_invalid");
      requestId = reserved.request_id;
      const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
      const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
      const stored = await rpc("ff_store_recovery_verifier", { request_id: requestId, verifier });
      if (!stored.ok) throw new Error("verifier_store_unavailable");
      const redirect = new URL(configuration.recoveryUrl);
      redirect.searchParams.set("recovery_request", requestId);
      // Only the server-selected verified address is sent. No client redirect or password is accepted.
      const sent = await requestFetch(`${configuration.url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirect.href)}`, {
        method: "POST", headers: { apikey: configuration.publicKey, "content-type": "application/json" },
        body: JSON.stringify({ email: reserved.email, code_challenge: challenge, code_challenge_method: "s256" }), signal: AbortSignal.timeout(8000),
      });
      mailOutcome = sent.ok ? "auth_accepted" : "auth_rejected";
      if (!sent.ok) report("auth_mail_rejected");
      const recorded = await rpc("ff_finish_password_recovery", { request_id: requestId, result: mailOutcome });
      if (!recorded.ok) throw new Error("result_audit_unavailable");
      requestId = null;
      return admin && mailOutcome !== "auth_accepted" ? respond(503, "mail_unavailable") : respond(200, "conditional");
    } catch {
      report("recovery_failed");
      if (requestId) {
        try {
          const recorded = await rpc("ff_finish_password_recovery", { request_id: requestId, result: mailOutcome });
          if (!recorded.ok) report("result_audit_failed");
        } catch { report("result_audit_failed"); }
      }
      // Anonymous responses must not distinguish an eligible account's SMTP failure.
      return !admin && requestId ? respond(200, "conditional")
        : respond(503, admin && !adminAuthorized ? "administration_unavailable" : "recovery_unavailable");
    }
  };
}
