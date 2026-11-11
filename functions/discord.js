// Discord Bot Interactions Endpoint
// URL: https://ama-central.pages.dev/discord

function hexToUint8Array(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

async function verifySignature(request, body, env) {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");

  if (!signature || !timestamp) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToUint8Array(env.DISCORD_PUBLIC_KEY),
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      hexToUint8Array(signature),
      new TextEncoder().encode(timestamp + body)
    );
  } catch (e) {
    return false;
  }
}

export async function onRequestPost({ request, env }) {
  const body = await request.text();

  // Verify the request is genuinely from Discord
  const isValid = await verifySignature(request, body, env);
  if (!isValid) {
    return new Response("Invalid signature", { status: 401 });
  }

  const interaction = JSON.parse(body);

  // Type 1: PING — Discord sends this to verify the endpoint
  if (interaction.type === 1) {
    return Response.json({ type: 1 });
  }

  // Type 2: Slash command
  if (interaction.type === 2) {
    const commandName = interaction.data.name.toLowerCase();

    switch (commandName) {
      case "ping":
        return Response.json({
          type: 4,
          data: { content: "Pong! 🏓" },
        });

      case "hello":
        return Response.json({
          type: 4,
          data: { content: `Hey <@${interaction.member?.user?.id || interaction.user?.id}>! 👋` },
        });

      default:
        return Response.json({
          type: 4,
          data: { content: `Unknown command: \`/${commandName}\`` },
        });
    }
  }

  return new Response("Unknown interaction type", { status: 400 });
}
