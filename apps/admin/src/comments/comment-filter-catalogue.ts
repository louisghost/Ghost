import {buildCatalogue} from '@/shared/filters';
import {COMMENT_FIELDS} from './comment-fields';
import type {FilterField} from '@/shared/filters';

// Comments has one provider and no runtime sources, so its catalogue is constant. It is still
// built the same way the members one is, so nothing downstream has a second shape to handle.

export type CommentFields = Record<string, FilterField>;

let cached: CommentFields | undefined;

export function buildCommentFields(): CommentFields {
    cached ??= buildCatalogue(COMMENT_FIELDS);

    return cached;
}
