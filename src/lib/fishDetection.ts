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
        let detectionResult;
        try {
            // Clean JSON response
            let cleaned = content.trim();
            if (cleaned.startsWith('```json')) {
                cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (cleaned.startsWith('```')) {
                cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            detectionResult = JSON.parse(cleaned);
        } catch (parseError) {
            // If parsing fails, assume fish detected and proceed
            console.warn('Failed to parse detection response, proceeding with processing:', parseError);
            detectionResult = { hasFish: true, confidence: 0.7 };
        }

        // TODO: Filter fish detections based on confidence scores.
        // Only process detections above a certain confidence threshold to avoid false positives.
        // YOU NEED TO IMPLEMENT THIS HERE
        
        // PLACEHOLDER: Accept all detections - proper confidence filtering needed
        if (!detectionResult.hasFish) {
            return createSuccessResponse({
                fishDetected: false,
                data: [],
                message: "No fish detected in the image"
            }, "Successfully processed image but no fish detected");
        }

        // Process the image asynchronously (fire and forget)
        // TODO: Students - You can make this synchronous by awaiting if you want immediate feedback
        processFishImageSimple(image, deviceId).catch((error) => {
            console.error('Error processing fish image:', error);
        });

        return createSuccessResponse({
            fishDetected: true,
            data: [{
                confidence: detectionResult.confidence || 0.8,
                description: detectionResult.description || "Fish detected in image"
            }],
        }, "Fish detected! Processing image in background...");
    } catch (error) {
        return createErrorResponse({
            message: "OpenAI Vision API error",
            error: error instanceof Error ? error.message : error
        });
    }
};