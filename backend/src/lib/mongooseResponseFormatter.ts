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
  // Handle Mongoose ValidationError
  if (!error) {
    return [{ field: 'general', message: 'Unknown error', code: 'Unknown' }];
  }

  if (error.name === 'ValidationError' && error.errors) {
    return Object.keys(error.errors).map((field) => ({
      field,
      message: error.errors[field].message || 'Validation error',
      code: error.errors[field].kind || 'ValidationError'
    }));
  }

  // CastError (invalid ObjectId etc.)
  if (error.name === 'CastError') {
    return [{ field: error.path || 'id', message: `Invalid ${error.path}: ${error.value}`, code: 'CastError' }];
  }

  // Duplicate key (unique index) - e.g., code 11000
  if (error.code === 11000 && error.keyValue) {
    const field = Object.keys(error.keyValue)[0];
    return [{ field: field || 'unknown', message: `Duplicate value for ${field}`, code: 'DuplicateKey' }];
  }

  // Fallback
  return [{ field: 'general', message: error.message || String(error), code: error.code ? String(error.code) : 'Error' }];
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