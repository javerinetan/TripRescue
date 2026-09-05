import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";

function textFromMessage(message) {
  return message?.content?.find((block) => block.type === "text")?.text ?? "";
}

function parseStructured(message) {
  const text = textFromMessage(message);
  if (!text) throw new Error("Anthropic returned no structured text.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Anthropic returned malformed structured output.");
  }
}

function requestOptions({ schema, system, prompt, model, signal }) {
  return {
    model,
    max_tokens: 512,
    output_config: { format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: prompt }],
    ...(signal ? { signal } : {}),
  };
}

export function createAnthropicProvider({
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
  client,
} = {}) {
  if (!apiKey && !client) return null;
  const anthropic = client ?? new Anthropic({ apiKey });

  return {
    model,
    async interpretIntent({ text, knownBookings, priorityIds, signal }) {
      const schema = {
        type: "object",
        additionalProperties: false,
        properties: {
          priority: { type: "string", enum: priorityIds },
          maximumAdditionalSpend: {
            type: "object",
            additionalProperties: false,
            properties: {
              currency: { type: "string", enum: ["SGD"] },
              minorUnits: { type: "integer", minimum: 5000, maximum: 80000 },
            },
            required: ["currency", "minorUnits"],
          },
          arrivalDeadline: { type: "string" },
          preserveBookingIds: { type: "array", items: { type: "string", enum: knownBookings } },
          explanation: { type: "string", maxLength: 300 },
        },
      };
      const response = await anthropic.messages.create(requestOptions({
        model,
        signal,
        schema,
        system: "Propose a structured travel recovery mandate from the traveller's words. Never authorize payment. Omit uncertain fields.",
        prompt: text,
      }));
      return { proposal: parseStructured(response), servedModel: response.model };
    },
    async rankOffers({ offers, plan, mandate, priority, signal }) {
      const ids = offers.map(({ id }) => id);
      const schema = {
        type: "object",
        additionalProperties: false,
        properties: {
          selectedOfferId: { type: "string", enum: ids },
          explanation: { type: "string", minLength: 1, maxLength: 300 },
        },
        required: ["selectedOfferId", "explanation"],
      };
      const response = await anthropic.messages.create(requestOptions({
        model,
        signal,
        schema,
        system: "Rank only the supplied policy-compliant offers according to the traveller's stated priority. Never invent an offer or relax a constraint.",
        prompt: JSON.stringify({ priority, plan, mandate, offers }),
      }));
      return { ...parseStructured(response), servedModel: response.model };
    },
  };
}

export function isAnthropicConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
