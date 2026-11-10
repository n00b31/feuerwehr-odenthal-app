"use client";

import { useState } from "react";
import type { CalendarView } from "@/domain/calendar";
import { useMobileLayout } from "./responsive-ui";
import {publicPath} from "@/config/app";

type Views=Partial<Record<"mobile"|"desktop",CalendarView>>;
function savedViews(key:string):{views:Views;error:string}{
  if(typeof window==="undefined")return {views:{},error:""};
  try{
    const raw=window.sessionStorage.getItem(key);
    if(!raw)return {views:{},error:""};
    const data:unknown=JSON.parse(raw);
    if(!data || typeof data!=="object")throw new Error("invalid_view");
    const views:Views={};
    for(const mode of ["mobile","desktop"] as const){
      if(mode in data){
        const value=Reflect.get(data,mode);
        if(value!=="month" && value!=="week" && value!=="list")throw new Error("invalid_view");
        views[mode]=value;
      }
    }
    return {views,error:""};
  }catch{return {views:{},error:"Die Kalenderansicht konnte nicht aus dem Sitzungsspeicher gelesen werden. Bitte erneut auswählen."};}
}
export function useCalendarView(actorId:string){
  const mobile=useMobileLayout(),key=`ff:${publicPath("/")}:calendar-view:${actorId}`;
  const [state,setState]=useState(()=>savedViews(key));
  const mode=mobile?"mobile":"desktop";
  function choose(view:CalendarView){
    const views={...state.views,[mode]:view};
    let error="";
    try{window.sessionStorage.setItem(key,JSON.stringify(views));}
    catch{error="Die Kalenderansicht gilt aktuell nur in dieser Ansicht; der Sitzungsspeicher ist nicht verfügbar.";}
    setState({views,error});
  }
  return {mobile,view:state.views[mode]??(mobile?"list":"month"),choose,error:state.error};
}
