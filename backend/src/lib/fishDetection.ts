import { createErrorResponse, createSuccessResponse } from "./mongooseResponseFormatter";
import OpenAI from 'openai';
import { processFishImageSimple } from "./simpleImageProcessor";

export const handleFishDetection = async (image: ArrayBuffer, deviceId: string) => {
    const apiKey = Bun.env.OPENAI_API_KEY;

    if (!apiKey) {
        return createErrorResponse({
            message: "OpenAI API key not configured. Please set OPENAI_API_KEY in your .env file."
        });
    }

    const openai = new OpenAI({
        apiKey: apiKey,
    });

    try {
        // Convert image to base64
        const base64Image = Buffer.from(image).toString('base64');
        const imageDataUrl = `data:image/jpeg;base64,${base64Image}`;

        // Use OpenAI Vision to detect if there are fish in the image
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: "You are a fish detection expert. Analyze the image and determine if there are any fish present. Return a JSON response with: {\"hasFish\": true/false, \"confidence\": 0.0-1.0, \"description\": \"brief description\"}"
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "Does this image contain any fish? Analyze the image and respond with JSON."
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: imageDataUrl
                            }
                        }
                    ]
                }
            ],
            max_tokens: 200
        });

        const content = response.choices[0].message.content;
        if (!content) {
            return createErrorResponse({
                message: "No response from OpenAI Vision API"
            });
        }

        // Parse the response
        let detectionResult: any;
        try {
            // Clean JSON response similar to other processors
            let cleaned = content.trim();
            const tripleJson = /^```(?:json\s*)?([\s\S]*?)```$/i;
            const tripleMatch = cleaned.match(tripleJson);
            if (tripleMatch && tripleMatch[1]) cleaned = tripleMatch[1].trim();
            // If there is surrounding backticks
            if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');

            detectionResult = JSON.parse(cleaned);
        } catch (parseError) {
            // If parsing fails, assume fish detected but mark lower confidence so we can filter
            console.warn('Failed to parse detection response, proceeding with conservative detection:', parseError);
            detectionResult = { hasFish: true, confidence: 0.6, description: 'Unparsed AI response' };
        }

        // Filter detections based on a configurable confidence threshold
        const CONFIDENCE_THRESHOLD = Number(process.env.FISH_DETECTION_CONFIDENCE || Bun.env.FISH_DETECTION_CONFIDENCE || 0.6);
        if (!detectionResult.hasFish || (typeof detectionResult.confidence === 'number' && detectionResult.confidence < CONFIDENCE_THRESHOLD)) {
            return createSuccessResponse({
                fishDetected: false,
                data: [],
                message: "No fish detected in the image"
            }, "Successfully processed image but no fish detected");
        }

        // Process the image either synchronously or asynchronously based on env var
        const PROCESS_SYNC = (process.env.PROCESS_IMAGES_SYNC || Bun.env.PROCESS_IMAGES_SYNC || 'false').toLowerCase() === 'true';
        if (PROCESS_SYNC) {
            try {
                await processFishImageSimple(image, deviceId);
            } catch (err) {
                console.error('Error processing fish image (sync):', err);
                return createErrorResponse({ message: 'Failed to process detected fish image' });
            }
            return createSuccessResponse({
                fishDetected: true,
                data: [{
                    confidence: detectionResult.confidence || 0.8,
                    description: detectionResult.description || "Fish detected in image"
                }],
            }, "Fish detected and processed synchronously");
        } else {
            // Fire-and-forget (async)
            processFishImageSimple(image, deviceId).catch((error) => {
                console.error('Error processing fish image (async):', error);
            });
            return createSuccessResponse({
                fishDetected: true,
                data: [{
                    confidence: detectionResult.confidence || 0.8,
                    description: detectionResult.description || "Fish detected in image"
                }],
            }, "Fish detected! Processing image in background...");
        }
    } catch (error) {
        console.error('OpenAI Vision error in detection:', error instanceof Error ? error.stack || error.message : error);
        // Include detailed error in non-production / when DEBUG env is set to help debugging
        const debug = (process.env.DEBUG || Bun.env.DEBUG || 'false').toLowerCase() === 'true';
        const detail = error instanceof Error ? (debug ? error.stack || error.message : error.message) : String(error);
        return createErrorResponse({
            message: "OpenAI Vision API error",
            detail
        });
    }
};