import * as schema from '@db/schema';

import { and, desc, eq } from 'drizzle-orm';

import { db } from '@db/drizzle';
import type { TCourseImportDraft, TNewCourseImportDraft } from '@db/types';

export async function createCourseImportDraft(data: TNewCourseImportDraft): Promise<TCourseImportDraft> {
  try {
    const [draft] = await db.insert(schema.courseImportDraft).values(data).returning();

    if (!draft) {
      throw new Error('Failed to create course import draft');
    }

    return draft;
  } catch (error) {
    console.error('createCourseImportDraft error:', error);
    throw new Error('Failed to create course import draft');
  }
}

export async function getCourseImportDraftById(orgId: string, draftId: string): Promise<TCourseImportDraft | null> {
  try {
    const [draft] = await db
      .select()
      .from(schema.courseImportDraft)
      .where(and(eq(schema.courseImportDraft.organizationId, orgId), eq(schema.courseImportDraft.id, draftId)))
      .limit(1);

    return draft || null;
  } catch (error) {
    console.error('getCourseImportDraftById error:', error);
    throw new Error('Failed to fetch course import draft');
  }
}

export async function getCourseImportDraftByIdempotencyKey(
  orgId: string,
  idempotencyKey: string
): Promise<TCourseImportDraft | null> {
  try {
    const [draft] = await db
      .select()
      .from(schema.courseImportDraft)
      .where(
        and(
          eq(schema.courseImportDraft.organizationId, orgId),
          eq(schema.courseImportDraft.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);

    return draft || null;
  } catch (error) {
    console.error('getCourseImportDraftByIdempotencyKey error:', error);
    throw new Error('Failed to fetch course import draft by idempotency key');
  }
}

export async function updateCourseImportDraft(
  orgId: string,
  draftId: string,
  data: Partial<TCourseImportDraft>
): Promise<TCourseImportDraft | null> {
  try {
    const [draft] = await db
      .update(schema.courseImportDraft)
      .set({
        ...data,
        updatedAt: new Date().toISOString()
      })
      .where(and(eq(schema.courseImportDraft.organizationId, orgId), eq(schema.courseImportDraft.id, draftId)))
      .returning();

    return draft || null;
  } catch (error) {
    console.error('updateCourseImportDraft error:', error);
    throw new Error('Failed to update course import draft');
  }
}

/**
 * List all course import drafts for an organization, ordered by newest first.
 * Excludes the large `draft` JSONB column — use `getCourseImportDraftById` to fetch the full payload.
 */
export async function listCourseImportDrafts(orgId: string): Promise<Omit<TCourseImportDraft, 'draft'>[]> {
  try {
    return await db
      .select({
        id: schema.courseImportDraft.id,
        organizationId: schema.courseImportDraft.organizationId,
        createdByProfileId: schema.courseImportDraft.createdByProfileId,
        sourceType: schema.courseImportDraft.sourceType,
        status: schema.courseImportDraft.status,
        title: schema.courseImportDraft.title,
        locale: schema.courseImportDraft.locale,
        idempotencyKey: schema.courseImportDraft.idempotencyKey,
        summary: schema.courseImportDraft.summary,
        warnings: schema.courseImportDraft.warnings,
        sourceArtifacts: schema.courseImportDraft.sourceArtifacts,
        publishedCourseId: schema.courseImportDraft.publishedCourseId,
        createdAt: schema.courseImportDraft.createdAt,
        updatedAt: schema.courseImportDraft.updatedAt
      })
      .from(schema.courseImportDraft)
      .where(eq(schema.courseImportDraft.organizationId, orgId))
      .orderBy(desc(schema.courseImportDraft.createdAt));
  } catch (error) {
    console.error('listCourseImportDrafts error:', error);
    throw new Error('Failed to list course import drafts');
  }
}

/**
 * Archive a course import draft by setting its status to ARCHIVED.
 */
export async function archiveCourseImportDraft(orgId: string, draftId: string): Promise<TCourseImportDraft | null> {
  try {
    const [draft] = await db
      .update(schema.courseImportDraft)
      .set({
        status: 'ARCHIVED',
        updatedAt: new Date().toISOString()
      })
      .where(
        and(
          eq(schema.courseImportDraft.organizationId, orgId),
          eq(schema.courseImportDraft.id, draftId),
          eq(schema.courseImportDraft.status, 'DRAFT')
        )
      )
      .returning();

    return draft || null;
  } catch (error) {
    console.error('archiveCourseImportDraft error:', error);
    throw new Error('Failed to archive course import draft');
  }
}
