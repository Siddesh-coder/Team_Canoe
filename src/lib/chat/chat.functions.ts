import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const chatInput = z.object({
  locale: z.enum(["en", "de"]), role: z.enum(["policy", "support", "documents"]),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(1200) })).min(1).max(20),
}).refine((v) => v.messages.at(-1)?.role === "user", "A user message is required");

export const askCanoe = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => chatInput.parse(data))
  .handler(async ({ data }) => {
    const { respond } = await import("./chat.server");
    return respond(data);
  });