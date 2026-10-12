import "server-only";
import { importJWK, SignJWT, type CryptoKey, type JWK } from "jose";
import { supabaseUrl } from "@/lib/supabase/config";

type SigningKey = { key: CryptoKey | Uint8Array; alg: string; kid?: string };

let signingKey: Promise<SigningKey> | null = null;

/**
 * SUPABASE_JWT_SIGNING_KEY is either a private JWK (ES256/RS256) that has been imported
 * into the Supabase project's JWT signing keys, or, for self-hosted Supabase with a shared
 * secret, the JWT secret itself (HS256).
 */
function loadSigningKey(): Promise<SigningKey> {
  signingKey ??= (async () => {
    const raw = process.env.SUPABASE_JWT_SIGNING_KEY?.trim();
    if (!raw) throw new Error("Missing SUPABASE_JWT_SIGNING_KEY: agents can't use API keys without it.");

    if (!raw.startsWith("{")) {
      return { key: new TextEncoder().encode(raw), alg: "HS256" };
    }

    // The Supabase CLI writes key_ops ["sign", "verify"], which WebCrypto rejects for a
    // private key; we only sign, so drop the usage hints.
    const jwk = JSON.parse(raw) as JWK;
    delete jwk.key_ops;
    delete jwk.use;
    delete jwk.ext;
    const alg = jwk.alg ?? (jwk.kty === "EC" ? "ES256" : jwk.kty === "RSA" ? "RS256" : "HS256");
    const key = await importJWK(jwk, alg);
    return { key, alg, kid: jwk.kid };
  })();
  return signingKey;
}

export type AgentIdentity = { userId: string; agentId: string; apiKeyId: string };

/**
 * A short-lived token that makes Supabase treat the request as the agent's owner (so RLS
 * applies), with the agent and API key in custom claims that the database reads.
 */
export async function signAgentToken(identity: AgentIdentity, ttlSeconds = 120): Promise<string> {
  const { key, alg, kid } = await loadSigningKey();
  return new SignJWT({
    role: "authenticated",
    agent_id: identity.agentId,
    api_key_id: identity.apiKeyId,
    is_anonymous: false,
  })
    .setProtectedHeader({ alg, typ: "JWT", ...(kid ? { kid } : {}) })
    .setSubject(identity.userId)
    .setAudience("authenticated")
    .setIssuer(`${supabaseUrl}/auth/v1`)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key);
}
