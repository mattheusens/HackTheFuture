import { z } from 'zod';
import { FormattedError, formatZodError } from '../lib/zodErrorFormatter';

export const deviceRegisterValidation = z.object({
    id: z.string().nonempty("ID is required and must be a string"),
});

export const deviceFindValidation = z.object({
    id: z.string().nonempty("ID is required and must be a string")
})


export const validateDeviceId = (id: string): {id: string | null, success: boolean, error: FormattedError | null} => {
    // Use Zod schema to validate the id
    const parsed = deviceFindValidation.safeParse({ id });
    if (!parsed.success) {
        // format the zod error into our FormattedError structure
        return {
            id: null,
            success: false,
            error: formatZodError(parsed.error)
        };
    }

    // Enforce additional constraints: length and allowed characters
    const cleanId = parsed.data.id.trim();
    const idRegex = /^[A-Za-z0-9_-]{5,64}$/; // allow letters, numbers, underscore, dash
    if (!idRegex.test(cleanId)) {
        return {
            id: null,
            success: false,
            error: {
                success: false,
                message: 'Device ID must be 5-64 chars, only letters, numbers, - and _ allowed',
                errors: [{ field: 'id', message: 'Invalid device id format', code: 'ValidationError' }]
            }
        };
    }

    return {
        error: null,
        id: cleanId,
        success: true
    };
}