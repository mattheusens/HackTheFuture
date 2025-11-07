// This file has been simplified - image processing now happens directly
// TODO: Students - This file is kept for backwards compatibility but is no longer used
// The actual processing happens in simpleImageProcessor.ts which is called from fishDetection.ts

import { ApiResponse, createSuccessResponse } from "./mongooseResponseFormatter";

// Legacy function - kept for compatibility but no longer used
// Image processing is now handled directly in fishDetection.ts via simpleImageProcessor.ts
export const handleImageCutMessageQueue = async (data: any[], image: ArrayBuffer, deviceId: string): Promise<ApiResponse<any>> => {
    // This function is deprecated - processing happens directly now
    // Keeping for backwards compatibility
    return createSuccessResponse({
        message: 'Image processing initiated'
    }, 'Image processing initiated');
};