const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function* streamChat(
  userId: string,
  sessionId: string,
  message: string
): AsyncGenerator<string> {
  const res = await fetch(`${API_URL}/chat/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, session_id: sessionId, message }),
  });

  if (!res.ok) throw new Error(`Chat request failed: ${res.status}`);
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const lines = decoder.decode(value).split("\n");
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data);
        if (parsed.chunk) yield parsed.chunk;
      } catch {
        // skip malformed lines
      }
    }
  }
}

export async function getUserCards(userId: string) {
  const res = await fetch(`${API_URL}/rewards/cards/${userId}`);
  if (!res.ok) throw new Error("Failed to fetch cards");
  return res.json();
}
