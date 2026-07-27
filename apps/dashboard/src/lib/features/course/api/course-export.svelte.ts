import { BaseApi, classroomio } from '$lib/utils/services/api';

import type { InferResponseType } from '@cio/api/rpc-types';

type GetCourseStructureRequest =
  (typeof classroomio.organization)['course-import']['courses'][':courseId']['structure']['$get'];
type GetCourseStructureSuccess = Extract<InferResponseType<GetCourseStructureRequest>, { success: true }>;

/**
 * API class for course export operations.
 * Calls the existing course-import structure endpoint to export a course as JSON.
 */
export class CourseExportApi extends BaseApi {
  /**
   * Fetch the course structure snapshot and trigger a file download.
   * @param courseId The ID of the course to export
   * @param courseTitle Used for the downloaded filename
   */
  async exportCourse(courseId: string, courseTitle: string) {
    await this.execute<GetCourseStructureRequest>({
      requestFn: () =>
        classroomio.organization['course-import'].courses[':courseId'].structure.$get({
          param: { courseId }
        }),
      logContext: 'exporting course',
      onSuccess: (response) => {
        const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${courseTitle.replace(/\s+/g, '-').toLowerCase()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
      onError: (result) => {
        const message = typeof result === 'string' ? result : 'error' in result ? result.error : 'Export failed';
        console.error('Course export error:', message);
      }
    });
  }

  /**
   * Export multiple courses sequentially, downloading each as a separate JSON file.
   * @param courses Array of { id, title } pairs to export
   */
  async exportMultiple(courses: Array<{ id: string; title: string }>) {
    for (const course of courses) {
      await this.exportCourse(course.id, course.title);
    }
  }
}

export const courseExportApi = /* @__PURE__ */ new CourseExportApi();
