export async function verifyStripeSignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const parts = signature.split(",").map(part => part.trim().split("="));
  const timestamp = parts.find(([name]) => name === "t")?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const encoder = new TextEncoder();
  const signingKey = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  for (const [name, hex] of parts) {
    if (name !== "v1" || !/^[a-f0-9]{64}$/i.test(hex ?? "")) continue;
    const bytes = Uint8Array.from(hex.match(/../g) ?? [], value => parseInt(value, 16));
    if (await crypto.subtle.verify("HMAC", signingKey, bytes, encoder.encode(`${timestamp}.${body}`))) return true;
  }
  return false;
}
