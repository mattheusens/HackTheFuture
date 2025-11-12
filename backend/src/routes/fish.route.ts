import { Hono } from "hono";
import { validateDeviceId } from "../validation/device.validation";
import { getDevice } from "../services/device.service";
import { getFishByDevice, processFishRegistration, checkFishByName, addExistingFishToDevice } from "../services/fish.service";
import { handleFishDetection } from "../lib/fishDetection";

const fishRoute = new Hono();

fishRoute.get("/:deviceId", async (c) => {
  const params = c.req.param();
  const validatedDeviceId = validateDeviceId(params.deviceId);

  if (!validatedDeviceId.success) {
    return c.json(validatedDeviceId.error, 400);
  }

  const mongoDeviceResult = await getDevice(validatedDeviceId.id as string);
  if (!mongoDeviceResult.success) {
    return c.json(mongoDeviceResult, 404);
  }

  const mongoFishResult = await getFishByDevice(validatedDeviceId.id as string);
  console.log(mongoFishResult)
  return c.json(mongoFishResult.success ? mongoFishResult : {data: []}, mongoFishResult.success ? 200 : 200);
});

// Check if fish exists by name
fishRoute.get("/name/:fishName", async (c) => {
  const params = c.req.param();
  const fishName = params.fishName;

  if (!fishName) {
    return c.json({ success: false, message: "Fish name is required" }, 400);
  }

  try {
    const result = await checkFishByName(fishName);
    return c.json(result, result.success ? 200 : 404);
  } catch (error) {
    return c.json({ 
      success: false, 
      message: "Failed to check fish by name",
      error: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

// Add existing fish to device
fishRoute.post("/add-existing/:deviceId/:fishName", async (c) => {
  const params = c.req.param();
  const deviceId = params.deviceId;
  const fishName = params.fishName;

  if (!deviceId || !fishName) {
    return c.json({ success: false, message: "Device ID and Fish Name are required" }, 400);
  }

  // Validate device ID
  const validatedDeviceId = validateDeviceId(deviceId);
  if (!validatedDeviceId.success) {
    return c.json(validatedDeviceId.error, 400);
  }

  // Get image URL from request body
  let body;
  try {
    body = await c.req.json();
  } catch (error) {
    return c.json({ success: false, message: "Request body is required" }, 400);
  }

  const { imageUrl } = body;
  if (!imageUrl) {
    return c.json({ success: false, message: "Image URL is required" }, 400);
  }

  try {
    const result = await addExistingFishToDevice(deviceId, fishName, imageUrl);
    return c.json(result, result.success ? 200 : 400);
  } catch (error) {
    return c.json({ 
      success: false, 
      message: "Failed to add existing fish to device",
      error: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

// Image proxy endpoint - serves images from local filesystem
fishRoute.get("/image/*", async (c) => {
  // Decode and sanitize the requested path to avoid issues with special characters and path traversal
  const rawPath = c.req.path.replace('/api/fish/image/', '');
  if (!rawPath) {
    return c.json({ error: "Image path is required" }, 400);
  }

  // Decode URI components and prevent directory traversal
  let imagePath: string;
  try {
    imagePath = decodeURIComponent(rawPath);
  } catch (e) {
    return c.json({ error: 'Invalid image path encoding' }, 400);
  }

  if (imagePath.includes('..')) {
    return c.json({ error: 'Invalid image path' }, 400);
  }

  try {
    const storagePath = Bun.env.STORAGE_PATH || './uploads';
    const filePath = `${storagePath}/fish-images/${imagePath}`;

    // Check if file exists
    const file = Bun.file(filePath);
    const exists = await file.exists();

    if (!exists) {
      return c.json({ error: "Image not found" }, 404);
    }

    // Read the file
    const imageBuffer = await file.arrayBuffer();
    const contentType = file.type || 'image/jpeg';

    // Return the image with proper headers
    return new Response(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('Error serving image:', error);
    return c.json({ error: "Failed to serve image" }, 500);
  }
});

fishRoute.post("/process-fish-registration", async (c) => {
  let body;

  try {
    body = await c.req.json();
  } catch (error) {
    return c.json({ success: false, message: "No body found on the request" }, 400);
  }

  // Validate that the body contains the required fish data
  console.log(body.fishData.name)  
  
  // Handle the data structure from image processor
  let fishData = body.fishData;
  
  // Additional validation to ensure we have the fish data
  if (!fishData) {
    return c.json({ success: false, message: "Fish data is required" }, 400);
  }

  try {
    const result = await processFishRegistration(fishData);
    
    if (result.success) {
      return c.json(result, 200);
    } else {
      return c.json(result, 400);
    }
  } catch (error) {
    return c.json({ 
      success: false, 
      message: "Failed to process fish registration",
      error: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

/**
 * POST /upload
 * Receives a fish picture and a deviceId, validates the deviceId,
 * and prepares the picture for blob storage (does not store yet).
 */
fishRoute.post("/upload", async (c) => {
  // Parse multipart/form-data
  let formData;
  try {
    formData = await c.req.parseBody();
  } catch (error) {
    return c.json({ success: false, message: "Failed to parse form data" }, 400);
  }

  // Extract deviceId and file from the form data
  const deviceId = formData.deviceId;
  const file = formData.file;

  if (!deviceId || Array.isArray(deviceId)) {
    return c.json({ success: false, message: "Invalid deviceId in form data" }, 400);
  }

  if (!file || typeof file === 'string' || !(file instanceof File)) {
    return c.json({ success: false, message: "Invalid or missing file in form data" }, 400);
  }

  if(typeof deviceId !== "string") {
    return c.json({success: false, message: "deviceId is not a string"}, 400)
  }

  const validatedDeviceId = validateDeviceId(deviceId);
  if (!validatedDeviceId.success) {
    return c.json(validatedDeviceId.error, 400);
  }

  const mongoDeviceResult = await getDevice(validatedDeviceId.id as string);
  if (!mongoDeviceResult.success) {
    return c.json(mongoDeviceResult, 404);
  }

  // Check if file is present and is a file object
  if (!file || typeof file !== "object" || !file.type || !file.name) {
    return c.json({ error: "No file uploaded or invalid file format." }, 400);
  }


  // Prepare file for blob storage (read buffer and gather metadata)
  const fileBuffer = await file.arrayBuffer();

  const fishDetectionResult = await handleFishDetection(fileBuffer, validatedDeviceId.id as string)
  if(!fishDetectionResult.success) {
    return c.json({
      success: false,
      message: fishDetectionResult.message
    }, 400)
  }

  if(fishDetectionResult.data.fishDetected.length == 0){
    return c.json({
      success: true,
      message: fishDetectionResult.message,
      fish: []
    }, 200)
  }

  const fileMeta = {
    originalName: file.name,
    mimeType: file.type,
    size: file.size,
    buffer: Buffer.from(fileBuffer), // This buffer can be sent to blob storage later
  };

  // Respond with metadata (do not store yet)
  return c.json({
    success: true,
    message: "File validated and put into message queue.",
    deviceId: validatedDeviceId.id,
    fileMeta: {
      originalName: fileMeta.originalName,
      mimeType: fileMeta.mimeType,
      size: fileMeta.size,
    },
    fish: fishDetectionResult.data
  });
});

export default fishRoute;