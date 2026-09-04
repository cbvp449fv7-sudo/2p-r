import {
  BulkEditPage,
  ClonePage,
  CollegesPage,
  ComparePage,
  Courses,
  DistributionLog,
  Editor,
  FacultyPage,
  FacultySchedulePage,
  FairnessPage,
  Generator,
  Import1448,
  ImportPage,
  QualityCenter,
  Reports,
  Rooms,
  Rules,
  ScenariosPage,
  UnscheduledQueue,
  Versions,
  WorkflowPage,
} from "@/components/pages";

/** Every route slug the shell links to. */
const pages: Record<string, React.ReactNode> = {
  import: <ImportPage />,
  "import-1448": <Import1448 />,
  generator: <Generator />,
  editor: <Editor />,
  faculty: <FacultyPage />,
  "faculty-schedule": <FacultySchedulePage />,
  courses: <Courses />,
  rooms: <Rooms />,
  rules: <Rules />,
  versions: <Versions />,
  reports: <Reports />,
  quality: <QualityCenter />,
  unscheduled: <UnscheduledQueue />,
  colleges: <CollegesPage />,
  distribution: <DistributionLog />,
  workflow: <WorkflowPage />,
  bulk: <BulkEditPage />,
  scenarios: <ScenariosPage />,
  compare: <ComparePage />,
  clone: <ClonePage />,
  fairness: <FairnessPage />,
};

export function generateStaticParams() {
  return Object.keys(pages).map((slug) => ({ slug }));
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return pages[slug] ?? <div className="empty"><p>Page not found</p></div>;
}
