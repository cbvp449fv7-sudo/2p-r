import {get,set} from "idb-keyval";import type{AppData}from"./types";import{createDemoData}from"./demo";
const KEY="uqu-schedule-assistant:data:v3";export async function loadData(){const stored=await get<AppData>(KEY);return migrate(stored??createDemoData())}export async function saveData(data:AppData){await set(KEY,data)}
export function migrate(data:AppData):AppData{return{...createDemoData(),...data,schemaVersion:3,settings:{...createDemoData().settings,...data.settings}}}
