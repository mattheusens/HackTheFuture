// Legacy type - kept for backwards compatibility
// Image processing now happens directly without queues
export type ImageQueueData = {
    fishData: any[], // Previously DetectedObjectOutput from Azure Vision
    image: string,
    deviceId: string
}