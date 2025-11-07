import { Fish, FishColor, FishImage, Predator, FunFact, Device } from "../db/models";
import { ApiResponse, createSuccessResponse, createErrorResponse } from "../lib/mongooseResponseFormatter";

// Create a new fish with all related data (no Effect)
async function createFishWithData(fishData: any): Promise<ApiResponse<any>> {
  try {
    // Create the fish first - fishData contains the fish properties directly
    const fish = new Fish(fishData);
    const savedFish = await fish.save();

    // TODO: Implement creation of related fish data (colors, predators, fun facts) when a new fish is registered.
    // These should be stored as separate documents linked to the fish.
    // Check the fishData object for colors, predators, funFacts, and images arrays and create corresponding records.
    // YOU NEED TO IMPLEMENT THIS HERE
    // Related data creation is not implemented - fish will be created without colors, predators, or fun facts

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
    // TODO: Validate incoming fish data to ensure all required fields are present and have valid values.
    // Consider what fields are essential for a fish record.
    // YOU NEED TO IMPLEMENT THIS HERE
    
    // PLACEHOLDER: Basic check only - proper validation needed
    if (!fishData || !fishData.name) {
      return createErrorResponse({ message: "Fish name is required - YOU NEED TO IMPLEMENT FULL VALIDATION HERE" }, "Fish name is required");
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
    const fishWithImages = device.fish.map((fishEntry: any) => {
      const fishData = fishEntry.toObject();
      return {
        ...fishData,
        imageUrl: "YOU NEED TO IMPLEMENT THIS HERE" // Placeholder - implement proper URL construction
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
    
    // PLACEHOLDER: Rate limiting not implemented - always adds fish
    // YOU NEED TO IMPLEMENT THIS HERE

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