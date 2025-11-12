import { Device } from "../db/models";
import { ApiResponse, createErrorResponse, createSuccessResponse } from "../lib/mongooseResponseFormatter";
import OpenAI from 'openai';

export async function getFishDataAndChat(deviceIdentifier: string, userMessage: string): Promise<ApiResponse<any>> {
  try {
    // Validate the user message before processing.
    // - non-empty
    // - max length
    // - reasonable characters
    const trimmedMessage = typeof userMessage === 'string' ? userMessage.trim() : '';
    const MAX_MESSAGE_LENGTH = 2000;
    if (!trimmedMessage) {
      return createErrorResponse({ message: 'Message cannot be empty' }, 'Message validation failed');
    }
    if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
      return createErrorResponse({ message: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH}` }, 'Message validation failed');
    }
    // Basic content check: avoid binary/control chars
    if (/\p{C}/u.test(trimmedMessage)) {
      return createErrorResponse({ message: 'Message contains invalid characters' }, 'Message validation failed');
    }
    
    // Get device and populate fish data
    const device = await Device.findOne({ deviceIdentifier }).populate('fish.fish');
    
    if (!device) {
      return createErrorResponse({ message: 'Device not found' }, 'Device has not been registered yet');
    }

    if (!device.fish || device.fish.length === 0) {
      return createErrorResponse({ message: 'No fish data found for this device' }, 'No fish data available');
    }

    // Format fish data for the AI in a structured way.
    const fishData = device.fish.map(fishEntry => {
      const fish = (fishEntry.fish as any) || {};
      return {
        id: fish._id,
        name: fish.name || 'Unknown',
        family: fish.family || 'Unknown',
        size: fish.size ? { min: fish.size.min ?? null, max: fish.size.max ?? null } : null,
        waterType: fish.waterType || null,
        habitat: fish.habitat || null,
        diet: fish.diet || null,
        conservationStatus: fish.conservationStatus || null,
        description: fish.description || null,
        images: Array.isArray(fish.images) ? fish.images.map((i: any) => i.url || i) : []
      };
    });

    // Setup OpenAI client (standard OpenAI, not Azure)
    const apiKey = Bun.env.OPENAI_API_KEY;
    if (!apiKey) {
      return createErrorResponse({ message: 'OpenAI API key not configured' }, 'No OpenAI API key found. Please set OPENAI_API_KEY in your .env file');
    }

    const client = new OpenAI({
      apiKey: apiKey,
    });

    const modelName = "gpt-4o";

  // Construct a clear system message with structured fish data
  const systemMessage = `You are an expert assistant that answers questions about detected fish. Only use the provided fish data and do not invent detections. Provide concise, factual answers. If the question is unrelated, respond that you can only answer about the listed fish.

Detected fish (one per line):
${fishData.map(f => `- ${f.name} (id: ${f.id || 'N/A'}) | family: ${f.family || 'N/A'} | size: ${f.size ? `${f.size.min ?? '?'}-${f.size.max ?? '?' } cm` : 'N/A'} | waterType: ${f.waterType || 'N/A'}`).join('\n')}

When you return structured data (JSON), respond only with a JSON object or array. If you provide explanatory text, put it in plain text after the JSON. Do not include markdown formatting.`;

    // Get AI response
    // Helper: call OpenAI with retries for transient errors
    const callOpenAIWithRetries = async (attempts = 3, backoffMs = 500) => {
      let lastErr: any = null;
      for (let i = 0; i < attempts; i++) {
        try {
          return await client.chat.completions.create({
            model: modelName,
            messages: [
              { role: "system", content: systemMessage },
              { role: "user", content: userMessage }
            ],
            max_tokens: 1000,
            temperature: 0.7
          });
        } catch (err: any) {
          lastErr = err;
          const status = err?.status || err?.statusCode || err?.response?.status;
          // Retry on 429 or 5xx or networking issues
          const shouldRetry = !status || status === 429 || (status >= 500 && status < 600);
          console.warn(`OpenAI call failed (attempt ${i + 1}/${attempts})`, { status, message: err?.message });
          if (!shouldRetry) throw err;
          await new Promise(r => setTimeout(r, backoffMs * Math.pow(2, i)));
        }
      }
      throw lastErr;
    };

    const response = await callOpenAIWithRetries();

  // Robust AI response extraction & validation
    // - ensure choices exist
    // - extract message content safely
    // - clean common markdown wrappers (```json, ```)
    // - attempt JSON.parse when it looks like JSON, otherwise return cleaned text
    // - provide clear error responses when parsing/extraction fails
    const choice = Array.isArray((response as any).choices) && (response as any).choices[0];
    const rawContent = choice?.message?.content ?? choice?.text ?? null;

    if (!rawContent || (typeof rawContent === 'string' && rawContent.trim().length === 0)) {
      console.warn('AI returned empty response', { response });
      return createErrorResponse({ message: 'Empty response from AI' }, 'No response received from AI');
    }

    // Helper: clean markdown code fences and trim
    const cleanAIContent = (input: string) => {
      let s = input.trim();

      // Remove triple-backtick blocks and return inner content if present
      // Handles ```json\n...\n``` or ```\n...\n```
      const tripleFenceMatch = s.match(/```(?:json\s*)?([\s\S]*)```$/i);
      if (tripleFenceMatch && tripleFenceMatch[1]) {
        s = tripleFenceMatch[1].trim();
      }

      // If wrapped in single backticks `...`, remove them
      if (s.startsWith('`') && s.endsWith('`')) {
        s = s.slice(1, -1).trim();
      }

      // Some AIs include markdown blockquotes or language tags like ```json\n{...}\n``` - already handled above
      return s;
    };

  const cleaned = typeof rawContent === 'string' ? cleanAIContent(rawContent) : String(rawContent);

    // Try to parse JSON if it looks like JSON
    let parsed: any = null;
    let parsedSuccessfully = false;
    const looksLikeJson = cleaned.startsWith('{') || cleaned.startsWith('[');
    if (looksLikeJson) {
      try {
        parsed = JSON.parse(cleaned);
        parsedSuccessfully = true;
      } catch (e) {
        // If parsing fails, try a relaxed parse: strip trailing commas
        try {
          const relaxed = cleaned.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');
          parsed = JSON.parse(relaxed);
          parsedSuccessfully = true;
        } catch (e2) {
          console.warn('Failed to parse AI JSON response', { error: e, error2: e2, cleaned });
          parsedSuccessfully = false;
        }
      }
    }

    const resultPayload = parsedSuccessfully ? parsed : cleaned;

    return createSuccessResponse(
      {
        response: resultPayload,
        raw: rawContent,
        parsed: parsedSuccessfully
      },
      'Successfully processed chat request'
    );

  } catch (error: any) {
    // Improved error handling: classify and return helpful API responses
    console.error('Chat service error:', error instanceof Error ? error.message : error);

    // Network / API errors
    const status = error?.status || error?.statusCode || error?.response?.status;
    if (status === 401 || status === 403) {
      return createErrorResponse({ message: 'Authentication with OpenAI failed' }, 'OpenAI authentication error');
    }

    if (status === 429) {
      return createErrorResponse({ message: 'OpenAI rate limit exceeded' }, 'OpenAI rate limit');
    }

    if (status >= 500 && status < 600) {
      return createErrorResponse({ message: 'OpenAI service error' }, 'OpenAI service error');
    }

    // Validation / client errors
    if (error?.message && /validation/i.test(error.message)) {
      return createErrorResponse({ message: error.message }, 'Validation error');
    }

    // Fallback generic error
    return createErrorResponse({ message: error?.message || String(error) }, 'Failed to process chat request');
  }
}
