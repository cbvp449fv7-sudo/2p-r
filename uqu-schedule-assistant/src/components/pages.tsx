/**
 * Page barrel.
 *
 * The original MVP imported every page from this module; it now re-exports the
 * grouped page modules so existing imports and routes keep working.
 */
export { Dashboard, Generator, Editor, FacultyPage, Courses, Rooms, Rules, Versions, ImportPage, Reports, Loading, ImpactDialog, PeriodClockSettings, TravelSettings } from "./pages/core";
export { Import1448 } from "./pages/import-1448";
export { QualityCenter, UnscheduledQueue, CollegesPage, DistributionLog, WorkflowPage, BulkEditPage } from "./pages/operations";
export { FacultySchedulePage, FairnessPage, ScenariosPage, ComparePage, ClonePage } from "./pages/analysis";
