import type { AppData, Faculty, Course, Section, Room, Assignment, College, Settings } from "./types";
import { UNCLASSIFIED_COLLEGE_ID } from "./types";
import { defaultPeriodTable } from "./period-table";
import { DEFAULT_TITLE_LOADS } from "./rules";
const days=["Sunday","Monday","Tuesday","Wednesday","Thursday"];
const all=days.map(day=>({day,start:"08:00",end:"17:00"}));
const ranks:Faculty["rank"][]=["Professor","Associate Professor","Assistant Professor","Lecturer","Teaching Assistant","Language Instructor"];
const specs=["Linguistics","Literature","Translation"];
/** Colleges the app always knows about. Demo colleges stay fictional. */
export function defaultColleges():College[]{return[
 {id:UNCLASSIFIED_COLLEGE_ID,nameAr:"غير مصنف",nameEn:"Unclassified",builtIn:true},
 {id:"COL-DEMO-LANG",nameAr:"كلية اللغات التجريبية",nameEn:"Demo College of Languages",builtIn:true}
]}

/** Settings shared by the demo dataset and by every migration. */
export function defaultSettings():Settings{return{days,startHour:8,endHour:17,totalWorkHours:35,overtimeCeiling:null,timeoutMs:3000,
 weights:{preferences:5,preferredDays:3,facultyGaps:4,studentGaps:4,balanced:3,isolatedDays:2,overtime:6,earlyLate:2,consistentTimes:3,sameBuilding:2},
 programs:[{name:"English Linguistic Studies",credits:130,enabled:true,status:"Confirmed public listing"},{name:"English Language and Literature",credits:130,enabled:true,status:"Confirmed public listing"},{name:"English program",credits:71,enabled:true,status:"Active status unconfirmed"},{name:"Applied Linguistics",credits:0,enabled:false,status:"Historical; confirm internally"},{name:"English Literature (Master\u2019s)",credits:0,enabled:false,status:"Historical; confirm internally"},{name:"Translation (Master\u2019s)",credits:0,enabled:false,status:"Historical; confirm internally"}],
 periods:defaultPeriodTable(),thursdayInPersonPenalty:80,thursdayRemotePenalty:5,preparatoryMinPeriods:6,preparatoryMaxPeriods:8,
 remoteTravelCounts:false,minBreakMinutes:10,operatorName:"Local administrator",semester:"1448",scheduleVersionNumber:1,
 titleLoadMap:{...DEFAULT_TITLE_LOADS}}}

export function createDemoData():AppData{
 const faculty:Faculty[]=Array.from({length:12},(_,i)=>({id:`F-${String(i+1).padStart(3,"0")}`,nameEn:`Demo Faculty ${i+1}`,nameAr:`عضو هيئة تجريبي ${i+1}`,rank:ranks[i%6],specialization:specs[i%3],campus:i%2?"Aziziyah - Women":"Abdiyah - Men",status:i===3?"Studying":"Active",normalLimit:[10,12,14,16,16,18][i%6],reducedLoad:i===3?10:undefined,adminRole:i===0?"Program coordinator":undefined,available:all,unavailable:i%4===0?[{day:"Tuesday",start:"08:00",end:"10:00"}]:[],preferred:[{day:days[i%5],start:"10:00",end:"14:00"}],maxConsecutive:3,preferredDays:[days[i%5],days[(i+1)%5]],overtimeAllowed:i%3===0,overtimeApproval:i===6?"approved":"pending"}));
 const courses:Course[]=Array.from({length:15},(_,i)=>({code:`ENG-${101+i}`,nameEn:["Academic Writing","Phonetics","World Literature","Translation Practice","Research Methods"][i%5]+` ${Math.floor(i/5)+1}`,nameAr:["الكتابة الأكاديمية","الصوتيات","الأدب العالمي","تطبيقات الترجمة","مناهج البحث"][i%5]+` ${Math.floor(i/5)+1}`,program:i%2?"English Language and Literature":"English Linguistic Studies",level:(i%8)+1,creditHours:3,teachingType:i%5===3?"practical":"theoretical",specialization:specs[i%3],meetingsPerWeek:i%3===0?2:1,duration:i%5===3?100:50,roomType:i%5===3?"Language Lab":"Classroom"}));
 const sections:Section[]=Array.from({length:10},(_,i)=>({id:`SEC-${String(i+1).padStart(2,"0")}`,program:i%2?"English Language and Literature":"English Linguistic Studies",level:(i%8)+1,students:22+(i*3)%25,campus:i%2?"Aziziyah - Women":"Abdiyah - Men",courseCodes:[courses[i].code,courses[(i+5)%15].code],sharedGroups:i===1||i===2?["COHORT-L2"]:[`GROUP-${i+1}`],collegeIds:["COL-DEMO-LANG"],preparatory:false}));
 const rooms:Room[]=Array.from({length:8},(_,i)=>({id:`${i%2?"A":"B"}-${201+i}`,building:i%2?"Al Zahra":"College of Languages",campus:i%2?"Aziziyah - Women":"Abdiyah - Men",capacity:60,type:i===2||i===3?"Language Lab":"Classroom",availability:all,accessible:i%3!==0}));
 const now=new Date().toISOString();
 const assignments:Assignment[]=[
  {id:"A-001",courseCode:courses[0].code,sectionId:sections[0].id,facultyId:faculty[0].id,roomId:rooms[0].id,day:"Sunday",start:"10:00",end:"10:50",teachingUnits:1,locked:true,overtime:false,approval:"not-required",createdAt:now,updatedAt:now,activity:"نشاط 1",deliveryMode:"in-person",periods:[3],collegeIds:["COL-DEMO-LANG"]},
  {id:"A-002",courseCode:courses[2].code,sectionId:sections[2].id,facultyId:faculty[2].id,roomId:rooms[0].id,day:"Sunday",start:"10:00",end:"10:50",teachingUnits:1,locked:false,overtime:false,approval:"not-required",createdAt:now,updatedAt:now,activity:"نشاط 1",deliveryMode:"in-person",periods:[3],collegeIds:["COL-DEMO-LANG"]}
 ];
 return{schemaVersion:4,faculty,courses,sections,rooms,assignments,versions:[],settings:defaultSettings(),audit:[],
  colleges:defaultColleges(),collegeMappings:[],coursePatterns:[],facultyAliases:[],roomColorProfiles:[],travelRules:[],
  distributions:[],scenarios:[],scheduleState:"draft",approvedVersionId:null,sourceRows:[]};
}
