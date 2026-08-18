import {z} from 'zod';

// An empty cell (or the literal 'undefined') reads as absent, not as a value.
const optionalCell = z.string()
    .transform(cell => (cell === '' || cell === 'undefined' ? undefined : cell))
    .optional();

// title is trimmed here because the model's own trim is skipped under
// options.importing; unknown columns pass through (.loose()) for field mapping.
export const postImportRowSchema = z.object({
    title: z.string().default('').transform(cell => cell.trim()),
    html: z.string().default(''),
    published_at: optionalCell
}).loose();

export type PostImportRow = z.infer<typeof postImportRowSchema>;

// Validation for coerced rows; buildPostData turns the first issue into a row
// skip. A blank title is refused because the model's (Untitled) fallback is
// skipped under options.importing; an invalid date is refused rather than
// silently replaced with the import time (what the JSON importer does). The
// title cap matches the posts schema's isLength validation.
export const importableRowSchema = z.object({
    title: z.string()
        .min(1, 'title is required')
        .max(255, 'title must be 255 characters or fewer')
}).loose().superRefine((row, ctx) => {
    const publishedAt = row.published_at;
    if (typeof publishedAt === 'string' && Number.isNaN(new Date(publishedAt).getTime())) {
        ctx.addIssue({code: 'custom', message: `published_at is not a valid date: "${publishedAt}"`});
    }
});
