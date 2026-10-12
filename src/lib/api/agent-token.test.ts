import { exportJWK, generateKeyPair, jwtVerify } from "jose";
import { beforeAll, expect, test, vi } from "vitest";

let publicKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  publicKey = pair.publicKey;
  // Same shape as `supabase gen signing-key` output.
  const jwk = {
    ...(await exportJWK(pair.privateKey)),
    kid: "test-kid",
    alg: "ES256",
    use: "sig",
    key_ops: ["sign", "verify"],
    ext: true,
  };
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("SUPABASE_JWT_SIGNING_KEY", JSON.stringify(jwk));
});

test("agent tokens act as the owner and carry the agent and key", async () => {
  const { signAgentToken } = await import("./agent-token");
  const token = await signAgentToken({ userId: "owner", agentId: "agent", apiKeyId: "key" });

  const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
    audience: "authenticated",
    issuer: "https://example.supabase.co/auth/v1",
  });
  expect(protectedHeader).toMatchObject({ alg: "ES256", kid: "test-kid" });
  expect(payload).toMatchObject({ sub: "owner", role: "authenticated", agent_id: "agent", api_key_id: "key" });
  // Short-lived: they only need to last one request.
  expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(120);
});
