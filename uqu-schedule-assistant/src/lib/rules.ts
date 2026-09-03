import type { Assignment, Course, Faculty, Rank } from "./types";
export const RANK_LOADS:Record<Rank,number>={Professor:10,"Associate Professor":12,"Assistant Professor":14,Lecturer:16,"Teaching Assistant":16,"Language Instructor":18};
export const COMPENSATION_PER_UNIT=150;
export function teachingUnits(course:Pick<Course,"teachingType"|"duration">){return course.teachingType==="theoretical"?Math.floor(course.duration/50):Math.floor(course.duration/100)}
export function effectiveLoad(f:Faculty){return f.reducedLoad??f.normalLimit??RANK_LOADS[f.rank]}
export function assignedUnits(facultyId:string,items:Assignment[]){return items.filter(a=>a.facultyId===facultyId).reduce((n,a)=>n+a.teachingUnits,0)}
export function loadSummary(f:Faculty,items:Assignment[]){const assigned=assignedUnits(f.id,items),limit=effectiveLoad(f),overtime=Math.max(0,assigned-limit);return{assigned,limit,overtime,compensation:overtime*COMPENSATION_PER_UNIT,underload:Math.max(0,limit-assigned),adminWarning:Boolean(f.adminRole&&assigned<3)}}
