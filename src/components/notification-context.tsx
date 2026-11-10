"use client";

import { createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readNotifications } from "@/data/supabase-notifications";
import { notificationError,type NotificationWorkspace } from "@/domain/notifications";

type Inbox = {snapshot:NotificationWorkspace|null;error:string;reload:()=>Promise<NotificationWorkspace|null>};
const NotificationContext=createContext<Inbox|null>(null);

export function NotificationProvider({client,actorId,paused,children}:{
  client:SupabaseClient|null;actorId:string|null;paused:boolean;children:ReactNode;
}){
  const [state,setState]=useState<{client:SupabaseClient|null;actor:string|null;snapshot:NotificationWorkspace|null;error:string}>({
    client,actor:actorId,snapshot:null,error:"",
  });
  if(state.client!==client || state.actor!==actorId)setState({client,actor:actorId,snapshot:null,error:""});
  const epoch=useRef({value:0}),working=useRef(paused);
  useEffect(()=>{working.current=paused;},[paused]);
  const reload=useCallback(async()=>{
    const version=++epoch.current.value;
    if(!client || !actorId)return null;
    try{
      const next=await readNotifications(client,actorId);
      if(version!==epoch.current.value)return null;
      setState({client,actor:actorId,snapshot:next,error:""});return next;
    }catch(cause){
      if(version===epoch.current.value)setState({client,actor:actorId,snapshot:null,error:notificationError(cause)});
      throw cause;
    }
  },[client,actorId]);
  useEffect(()=>{
    if(!client || !actorId)return;
    const lifetime=epoch.current;
    const refresh=()=>{
      if(!document.hidden && !working.current)void reload().catch(()=>{/* The shared inbox exposes the failure. */});
    };
    refresh();
    window.addEventListener("focus",refresh);
    window.addEventListener("ff-notifications-changed",refresh);
    document.addEventListener("visibilitychange",refresh);
    const timer=window.setInterval(refresh,60_000);
    return()=>{
      lifetime.value++;
      window.removeEventListener("focus",refresh);
      window.removeEventListener("ff-notifications-changed",refresh);
      document.removeEventListener("visibilitychange",refresh);
      window.clearInterval(timer);
    };
  },[client,actorId,reload]);
  return <NotificationContext value={{snapshot:state.actor===actorId?state.snapshot:null,
    error:state.actor===actorId?state.error:"",reload}}>{children}</NotificationContext>;
}
export function useNotifications(){
  const inbox=useContext(NotificationContext);
  if(!inbox)throw new Error("Gemeinsamer Benachrichtigungskontext fehlt.");
  return inbox;
}
