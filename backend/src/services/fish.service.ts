import { Fish, FishColor, FishImage, Predator, FunFact, Device } from "../db/models";
import { ApiResponse, createSuccessResponse, createErrorResponse } from "../lib/mongooseResponseFormatter";

// Create a new fish with all related data (no Effect)
async function createFishWithData(fishData: any): Promise<ApiResponse<any>> {
  try {
    // Create the fish first - fishData contains the fish properties directly
    const fish = new Fish(fishData);
    const savedFish = await fish.save();

    // Create related data if present
    try {
      if (Array.isArray(fishData.colors) && fishData.colors.length > 0) {
        const colorDocs = fishData.colors.map((c: any) => ({ fish: savedFish._id, colorName: c.colorName || c }));
        await FishColor.insertMany(colorDocs);
      }

      if (Array.isArray(fishData.predators) && fishData.predators.length > 0) {
        const predatorDocs = fishData.predators.map((p: any) => ({ fish: savedFish._id, predatorName: p.predatorName || p }));
        await Predator.insertMany(predatorDocs);
      }

      if (Array.isArray(fishData.funFacts) && fishData.funFacts.length > 0) {
        const funDocs = fishData.funFacts.map((f: any) => ({ fish: savedFish._id, funFactDescription: f.funFactDescription || f }));
        await FunFact.insertMany(funDocs);
      }

      if (Array.isArray(fishData.images) && fishData.images.length > 0) {
        const imageDocs = fishData.images.map((img: any) => ({ fish: savedFish._id, url: img.url || img }));
        await FishImage.insertMany(imageDocs);
      }
    } catch (relErr) {
      // Log related data creation errors but don't fail entire operation
      console.warn('Warning: failed to create related fish data', relErr);
    }

    return createSuccessResponse(savedFish, "Fish and related data created successfully");
  } catch (error) {
    return createErrorResponse(error, "Failed to create fish and related data");
  }
}

// Check if fish exists by name and create if it doesn't exist
async function checkAndCreateFish(fishData: any): Promise<ApiResponse<any>> {
  try {
    // Check if fish already exists by name
    const existingFish = await Fish.findOne({ name: fishData.name });
    
    if (existingFish) {
      return createSuccessResponse(existingFish, "Fish already exists with this name");
    }

    // If fish doesn't exist, create it with all related data
    return await createFishWithData(fishData);
  } catch (error) {
    return createErrorResponse(error, "Failed to check and create fish");
  }
}

// Process fish registration - main function for the API endpoint
async function processFishRegistration(fishData: any): Promise<ApiResponse<any>> {
  try {
    // Basic validation for required fields
    if (!fishData || typeof fishData !== 'object') {
      return createErrorResponse({ message: 'Fish data must be an object' }, 'Fish validation failed');
    }

    if (!fishData.name || typeof fishData.name !== 'string' || fishData.name.trim().length === 0) {
      return createErrorResponse({ message: 'Fish name is required' }, 'Fish validation failed');
    }

    // Optional: normalize strings
    fishData.name = fishData.name.trim();

    // Enforce size fields if present
    if (fishData.minSize && fishData.maxSize && fishData.minSize > fishData.maxSize) {
      return createErrorResponse({ message: 'minSize cannot be greater than maxSize' }, 'Fish validation failed');
    }

    // Check if fish exists and create if it doesn't
    const result = await checkAndCreateFish(fishData);
    
    if (result.success) {
      return createSuccessResponse(result.data, "Fish processed successfully");
    } else {
      return result; // Return the error response
    }
  } catch (error) {
    return createErrorResponse(error, "Failed to process fish registration");
  }
}

// Get all fish for a specific device (updated for new structure)
async function getFishByDevice(deviceId: string): Promise<ApiResponse<any>> {
  try {
    // Find the device and populate the fish array with full fish details
    const device = await Device.findOne({ deviceIdentifier: deviceId }).populate({
      path: 'fish.fish',
      model: 'Fish'
    });
    
    if (!device) {
      return createErrorResponse({ message: 'Device not found' }, 'Device not found');
    }
    
    if (!device.fish || device.fish.length === 0) {
      return createErrorResponse({ message: 'No fish found for this device' }, 'No fish found for this device');
    }

    // TODO: Construct proper image URLs for each fish entry. Images are stored locally and should be accessible via the API image endpoint.
    // Each fish entry has an imageUrl field that needs to be converted to a full API endpoint URL.
    // YOU NEED TO IMPLEMENT THIS HERE
    const apiBase = process.env.API_BASE_URL || Bun.env.API_BASE_URL || 'http://localhost:3000/api';
    const fishWithImages = device.fish.map((fishEntry: any) => {
      const fishData = fishEntry.toObject ? fishEntry.toObject() : fishEntry;
      // imageUrl may be stored as device-specific relative path like "deviceId/filename.jpg"
      const rawUrl = fishData.imageUrl || (fishData.fish && fishData.fish.images && fishData.fish.images[0] && fishData.fish.images[0].url) || null;
      const fullImageUrl = rawUrl ? `${apiBase}/fish/image/${encodeURIComponent(rawUrl)}` : null;
      return {
        ...fishData,
        imageUrl: fullImageUrl
      };
    });
    
    return createSuccessResponse(fishWithImages, 'Fish found for device');
  } catch (error) {
    return createErrorResponse(error, 'Something went wrong during the fetching of the fish related to the device: ' + deviceId);
  }
}

// Check if fish exists by name
async function checkFishByName(fishName: string): Promise<ApiResponse<any>> {
  try {
    // Check if fish already exists by name
    const existingFish = await Fish.findOne({ name: fishName });
    
    if (existingFish) {
      return createSuccessResponse({
        ...existingFish.toObject(),
        known: true
      }, "Fish found with this name");
    }

    // If fish doesn't exist, return with known: false
    return createSuccessResponse({
      name: fishName,
      known: false
    }, "Fish not found with this name");
  } catch (error) {
    return createErrorResponse(error, "Failed to check fish by name");
  }
}

// Add existing fish to device
async function addExistingFishToDevice(deviceId: string, fishName: string, imageUrl: string): Promise<ApiResponse<any>> {
  try {
    // Check if device exists
    const device = await Device.findOne({ deviceIdentifier: deviceId });
    if (!device) {
      return createErrorResponse({ message: 'Device not found' }, 'Device not found');
    }

    // Check if fish exists by name
    const fish = await Fish.findOne({ name: fishName });
    if (!fish) {
      return createErrorResponse({ message: 'Fish not found with this name' }, 'Fish not found');
    }

    // TODO: Implement rate limiting to prevent the same fish from being added multiple times within a short time period.
    // Consider what time window makes sense and how to track recent additions.
    // You should check if this fish was recently added to this device and skip if it was added too recently.
    const now = new Date();
    // Rate limiting: do not add if the same fish was added within the last X seconds
    const RATE_LIMIT_SECONDS = Number(process.env.FISH_ADD_RATE_LIMIT_SECONDS || Bun.env.FISH_ADD_RATE_LIMIT_SECONDS || 10);
    try {
      const recent = device.fish
        .filter((f: any) => String(f.fishId) === String(fish._id))
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      if (recent.length > 0) {
        const last = new Date(recent[0].timestamp);
        const secs = (now.getTime() - last.getTime()) / 1000;
        if (secs < RATE_LIMIT_SECONDS) {
          return createSuccessResponse({
            deviceId: device.deviceIdentifier,
            fishId: fish._id,
            fishName: fish.name,
            imageUrl,
            timestamp: now,
            skipped: true
          }, `Skipped adding fish; last added ${Math.round(secs)} seconds ago`);
        }
      }
    } catch (rlErr) {
      console.warn('Warning checking rate limit', rlErr);
    }

    // Add fish to device
    device.fish.push({
      fish: fish._id,
      imageUrl: imageUrl,
      timestamp: now,
      fishId: fish._id
    });

    await device.save();

    return createSuccessResponse({
      deviceId: device.deviceIdentifier,
      fishId: fish._id,
      fishName: fish.name,
      imageUrl: imageUrl,
      timestamp: now,
      skipped: false
    }, 'Fish successfully added to device');
  } catch (error) {
    return createErrorResponse(error, 'Failed to add fish to device');
  }
}

export {
  createFishWithData,
  getFishByDevice,
  processFishRegistration,
  checkFishByName,
  addExistingFishToDevice
}