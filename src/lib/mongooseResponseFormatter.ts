// utils/mongooseResponseFormatter.ts
import { Error as MongooseError } from 'mongoose';

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: Array<{
    field: string;
    message: string;
    code?: string;
  }>;
}

export function formatMongooseError(error: any): Array<{ field: string; message: string; code?: string }> {
  // TODO: Format different types of Mongoose errors into a consistent API response format.
  // Handle validation errors, cast errors, and duplicate key errors appropriately.
  // Check for MongooseError.ValidationError, MongooseError.CastError, and duplicate key errors (code 11000).
  // YOU NEED TO IMPLEMENT THIS HERE
  
  // PLACEHOLDER: Return generic error message
  return [{
    field: 'general',
    message: error.message || 'An unknown error occurred - YOU NEED TO IMPLEMENT PROPER ERROR FORMATTING',
    code: 'GenericError'
  }];
}

export function createSuccessResponse<T>(data: T, message: string = 'Operation successful'): ApiResponse<T> {
  return {
    success: true,
    message,
    data
  };
}

export function createErrorResponse(error: any, message?: string): ApiResponse {
  const errors = formatMongooseError(error);
  return {
    success: false,
    message: message || (errors.length === 1 ? errors[0].message : 'Operation failed'),
    errors
  };
}