"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardCheck,
  Copy,
  DoorOpen,
  FileBarChart,
  FlaskConical,
  GitCompare,
  History,
  LayoutDashboard,
  Languages,
  ListChecks,
  Menu,
  Moon,
  Send,
  Settings2,
  ShieldCheck,
  Sun,
  Upload,
  UserSquare,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { useApp } from "./app-provider";

const items = [
  ["/", "Dashboard", LayoutDashboard],
  ["/import-1448", "UQU 1448 Importer", Wand2],
  ["/import", "Data Import", Upload],
  ["/generator", "Schedule Generator", Settings2],
  ["/editor", "Schedule Editor", CalendarDays],
  ["/unscheduled", "Unscheduled Queue", ListChecks],
  ["/quality", "Data Quality Center", ClipboardCheck],
  ["/faculty", "Faculty", Users],
  ["/faculty-schedule", "Faculty Schedule", UserSquare],
  ["/courses", "Courses & Sections", BookOpen],
  ["/rooms", "Rooms", DoorOpen],
  ["/colleges", "Colleges & Exports", Building2],
  ["/distribution", "Distribution Log", Send],
  ["/workflow", "Approval & Publication", ShieldCheck],
  ["/bulk", "Bulk Editing", ListChecks],
  ["/scenarios", "What-If Sandbox", FlaskConical],
  ["/compare", "Version Comparison", GitCompare],
  ["/clone", "Clone Semester", Copy],
  ["/fairness", "Workload Report", FileBarChart],
  ["/rules", "Rules & Settings", ShieldCheck],
  ["/versions", "Versions", History],
  ["/reports", "Reports", FileBarChart],
] as const;

const ar: Record<string, string> = {
  Dashboard: "لوحة المعلومات",
  "UQU 1448 Importer": "مستورد جداول 1448",
  "Data Import": "استيراد البيانات",
  "Schedule Generator": "مولد الجدول",
  "Schedule Editor": "محرر الجدول",
  "Unscheduled Queue": "اللقاءات غير المجدولة",
  "Data Quality Center": "مركز جودة البيانات",
  Faculty: "أعضاء هيئة التدريس",
  "Faculty Schedule": "جدول عضو التدريس",
  "Courses & Sections": "المقررات والشعب",
  Rooms: "القاعات",
  "Colleges & Exports": "الكليات والتصدير",
  "Distribution Log": "سجل التوزيع",
  "Approval & Publication": "الاعتماد والنشر",
  "Bulk Editing": "التحرير الجماعي",
  "What-If Sandbox": "سيناريوهات افتراضية",
  "Version Comparison": "مقارنة الإصدارات",
  "Clone Semester": "نسخ فصل دراسي",
  "Workload Report": "تقرير توزيع العبء",
  "Rules & Settings": "القواعد والإعدادات",
  Versions: "الإصدارات",
  Reports: "التقارير",
};

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { locale, setLocale, theme, setTheme, toast } = useApp();

  return (
    <div className="app-shell">
      <button className="mobile-menu icon-btn" aria-label="Open navigation" onClick={() => setOpen(true)}>
        <Menu />
      </button>
      {open && <button className="scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}
      <aside className={open ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark">UQ</div>
          <div>
            <strong>UQU Schedule</strong>
            <small>Assistant · 1448</small>
          </div>
          <button className="close icon-btn" onClick={() => setOpen(false)} aria-label="Close">
            <X />
          </button>
        </div>
        <nav>
          {items.map(([href, label, Icon]) => (
            <Link key={href} href={href} onClick={() => setOpen(false)} className={pathname === href ? "active" : ""}>
              <Icon aria-hidden="true" />
              <span>{locale === "ar" ? ar[label] : label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <p>{locale === "ar" ? "نموذج داخلي — ليس نظاماً رسمياً" : "Internal prototype — not an official UQU system"}</p>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <p className="eyebrow">{locale === "ar" ? "قسم اللغة الإنجليزية · بيانات محلية" : "English Department · local data only"}</p>
          </div>
          <div className="header-actions">
            <button className="icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
              {theme === "dark" ? <Sun /> : <Moon />}
            </button>
            <button className="lang-btn" onClick={() => setLocale(locale === "en" ? "ar" : "en")}>
              <Languages />
              {locale === "en" ? "العربية" : "English"}
            </button>
          </div>
        </header>
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
