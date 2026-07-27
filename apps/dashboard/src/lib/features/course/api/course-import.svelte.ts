import { BaseApi, classroomio } from '$lib/utils/services/api';

import type { InferResponseType } from '@cio/api/rpc-types';

type ListDraftsRequest = (typeof classroomio.organization)['course-import']['drafts']['$get'];
type GetDraftRequest = (typeof classroomio.organization)['course-import']['drafts'][':draftId']['$get'];
type CreateDraftRequest = (typeof classroomio.organization)['course-import']['drafts']['$post'];
type PublishDraftRequest = (typeof classroomio.organization)['course-import']['drafts'][':draftId']['publish']['$post'];
type DeleteDraftRequest = (typeof classroomio.organization)['course-import']['drafts'][':draftId']['$delete'];

type ListDraftsSuccess = Extract<InferResponseType<ListDraftsRequest>, { success: true }>;
type GetDraftSuccess = Extract<InferResponseType<GetDraftRequest>, { success: true }>;
type CreateDraftSuccess = Extract<InferResponseType<CreateDraftRequest>, { success: true }>;
type PublishDraftSuccess = Extract<InferResponseType<PublishDraftRequest>, { success: true }>;

export type ImportDraft = ListDraftsSuccess['data'][number];
export type ImportDraftDetail = GetDraftSuccess['data'];

/**
 * API class for course import operations.
 */
export class CourseImportApi extends BaseApi {
  drafts = $state<ImportDraft[]>([]);
  currentDraft = $state<ImportDraftDetail | null>(null);

  /** Fetch all import drafts for the current org. */
  async listDrafts() {
    await this.execute<ListDraftsRequest>({
      requestFn: () => classroomio.organization['course-import'].drafts.$get(),
      logContext: 'listing import drafts',
      onSuccess: (response) => {
        this.drafts = response.data;
      }
    });
  }

  /** Fetch a single draft with its full payload. */
  async getDraft(draftId: string) {
    await this.execute<GetDraftRequest>({
      requestFn: () =>
        classroomio.organization['course-import'].drafts[':draftId'].$get({
          param: { draftId }
        }),
      logContext: 'getting import draft',
      onSuccess: (response) => {
        this.currentDraft = response.data;
      }
    });
  }

  /**
   * Create a draft from a parsed course JSON snapshot.
   * The snapshot may be a CourseStructureSnapshot ({ courseId, draft }) or a bare TCourseImportDraftPayload.
   */
  async createDraft(payload: Record<string, unknown>) {
    // If the payload is a CourseStructureSnapshot, extract the inner draft
    const draftPayload = 'draft' in payload && payload.draft ? payload.draft : payload;

    await this.execute<CreateDraftRequest>({
      requestFn: () =>
        classroomio.organization['course-import'].drafts.$post({
          json: {
            sourceType: 'course',
            draft: draftPayload as Record<string, unknown>
          }
        }),
      logContext: 'creating import draft',
      onSuccess: () => {
        // Refresh the draft list after creating
        void this.listDrafts();
      }
    });
  }

  /** Publish a draft as a new course. */
  async publishDraft(draftId: string) {
    let courseUrl = '';

    await this.execute<PublishDraftRequest>({
      requestFn: () =>
        classroomio.organization['course-import'].drafts[':draftId'].publish.$post({
          param: { draftId },
          json: {}
        }),
      logContext: 'publishing import draft',
      onSuccess: (response) => {
        courseUrl = response.data.courseUrl;
        // Remove from local list
        this.drafts = this.drafts.filter((d) => d.id !== draftId);
      }
    });

    return courseUrl;
  }

  /** Archive/delete a draft. */
  async deleteDraft(draftId: string) {
    await this.execute<DeleteDraftRequest>({
      requestFn: () =>
        classroomio.organization['course-import'].drafts[':draftId'].$delete({
          param: { draftId }
        }),
      logContext: 'deleting import draft',
      onSuccess: () => {
        this.drafts = this.drafts.filter((d) => d.id !== draftId);
      }
    });
  }
}

export const courseImportApi = /* @__PURE__ */ new CourseImportApi();
