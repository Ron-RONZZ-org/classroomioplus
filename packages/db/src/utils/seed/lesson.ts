import { db, lesson } from '@db/drizzle';

export interface LessonTemplate {
  mvcCourseId: string;
  reactCourseId: string;
  pandasCourseId: string;
  adminUserId: string;
  mvcSectionId: string;
  reactSectionId: string;
  pandasSectionId: string;
}

const VIDEO_TYPE = 'youtube' as const;

export async function seedLessons({
  mvcCourseId,
  adminUserId,
  reactCourseId,
  pandasCourseId,
  mvcSectionId,
  reactSectionId,
  pandasSectionId
}: LessonTemplate) {
  const existingLessons = await db.select().from(lesson);
  const existingLessonIds = existingLessons.map((l) => l.id);

  const lessonsToInsert = [
    // MVC Course lessons
    {
      id: '5c75f4f1-c222-44a9-a8c6-81773ea33872',
      courseId: mvcCourseId,
      sectionId: mvcSectionId,
      title: 'Lesson 1: Introduction to MVC Architecture',
      teacherId: adminUserId,
      videos: [{ link: 'https://youtu.be/pXLWqkA87e4?si=rUHaBMnuFgAMjm2T', type: VIDEO_TYPE, metadata: {} }],
      isUnlocked: false,
      // note content is required by the course-import/export pipeline
      // (buildCourseStructureSnapshot falls back to note when no
      // lesson_language rows exist).
      note: '<p>Model-View-Controller (MVC) is an architectural pattern that separates an application into three main components: the model (data), the view (presentation), and the controller (business logic).</p>'
    },
    {
      id: 'a99e65b7-1394-4751-ad8d-a5fb670ccb9e',
      courseId: mvcCourseId,
      sectionId: mvcSectionId,
      title: 'Anatomy of MVC Components',
      teacherId: adminUserId,
      videos: [{ link: 'https://youtu.be/4Qfk8MhtZJU?si=VZ7cF-pjvm_RmFMp', type: VIDEO_TYPE, metadata: {} }],
      isUnlocked: false,
      note: '<p>Each MVC component has a distinct responsibility: models manage data and business rules, views render the user interface, and controllers handle input and coordinate between the two.</p>'
    },
    {
      id: '266b3daa-1eb2-401e-9510-1819952b44b7',
      courseId: mvcCourseId,
      sectionId: mvcSectionId,
      title: 'Building Your First MVC Application',
      teacherId: adminUserId,
      videos: [{ link: 'https://www.youtube.com/watch?v=EMwu8F0dCXE', type: VIDEO_TYPE, metadata: {} }],
      isUnlocked: false,
      note: '<p>In this lesson you will build a small MVC application end to end, wiring the model, view, and controller together and verifying the request lifecycle.</p>'
    },
    // React Course lessons
    {
      id: '6f2d8142-0903-425c-8534-f5105b624752',
      courseId: reactCourseId,
      sectionId: reactSectionId,
      title: 'Introduction to React: Understanding the Basics',
      teacherId: adminUserId,
      videos: [{ link: 'https://www.youtube.com/watch?v=H-PkPKF2Tfk', type: VIDEO_TYPE, metadata: {} }],
      isUnlocked: false,
      note: '<p>React is a JavaScript library for building user interfaces with reusable components and a declarative rendering model.</p>'
    },
    {
      id: '0a39ab2f-9451-4a90-902c-3030bf965637',
      courseId: reactCourseId,
      sectionId: reactSectionId,
      title: 'Components and Props: Building Reusable UI Elements',
      teacherId: adminUserId,
      videos: [{ link: 'https://www.youtube.com/watch?v=H-PkPKF2Tfk', type: VIDEO_TYPE, metadata: {} }],
      isUnlocked: false,
      note: '<p>Components are the building blocks of a React application. Props are the inputs passed from parent to child components to customize their output.</p>'
    },
    {
      id: '80b79665-733b-41bf-9853-34fd8ab50496',
      courseId: reactCourseId,
      sectionId: reactSectionId,
      title: 'State and Lifecycle: Managing Data in React Applications',
      teacherId: adminUserId,
      videos: [{ link: 'https://www.youtube.com/watch?v=DveeFlWzWzc', type: VIDEO_TYPE, metadata: {} }],
      isUnlocked: false,
      note: "<p>State holds data that changes over time within a component, and lifecycle methods let you run code at specific points during a component's existence.</p>"
    },
    // Pandas Course lessons
    {
      id: '5e5c8221-4c11-4c40-8664-11743bb79579',
      courseId: pandasCourseId,
      sectionId: pandasSectionId,
      title: 'Python Essentials: An Introduction to Data Science',
      teacherId: adminUserId,
      videos: [{ link: 'https://www.youtube.com/watch?v=T5pRlIbr6gg&vl=en', type: VIDEO_TYPE, metadata: {} }],
      isUnlocked: true,
      note: '<p>Python is the most widely used language in data science, offering a rich ecosystem of libraries for analysis, statistics, and machine learning.</p>'
    },
    {
      id: '829da386-8ccd-4c81-b2fb-b9891102c83c',
      courseId: pandasCourseId,
      sectionId: pandasSectionId,
      title: 'Delving into Data Analysis with Pandas',
      teacherId: adminUserId,
      videos: [{ link: 'https://www.youtube.com/watch?v=T5pRlIbr6gg&vl=en', type: VIDEO_TYPE, metadata: {} }],
      isUnlocked: true,
      note: '<p>Pandas provides DataFrame and Series structures that make loading, cleaning, and analyzing tabular data fast and expressive.</p>'
    },
    {
      id: '05f03084-3ff1-49e3-aa2a-7a13840cc4b1',
      courseId: pandasCourseId,
      sectionId: pandasSectionId,
      title: 'Data Cleaning and Preprocessing Techniques',
      teacherId: adminUserId,
      videos: [{ link: 'https://www.youtube.com/watch?v=LI7s_lyooO8', type: VIDEO_TYPE, metadata: {} }],
      isUnlocked: true,
      note: '<p>Real-world data is messy. Cleaning involves handling missing values, removing duplicates, normalizing formats, and transforming columns into analysis-ready shapes.</p>'
    }
  ].filter((l) => !existingLessonIds.includes(l.id));

  if (lessonsToInsert.length > 0) {
    await db.insert(lesson).values(lessonsToInsert);
    console.log(`   ✓ Inserted ${lessonsToInsert.length} lesson(s)`);
  } else {
    console.log('   ✓ Lessons already exist, skipping');
  }
}
