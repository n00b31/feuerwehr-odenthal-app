import type {NotificationWorkspace} from "../src/domain/notifications";

export function emptyInbox(actor:string):NotificationWorkspace{
  return {actor_id:actor,unread:0,notices:[],devices:[],public_key:null,server_ready:false,
    preferences:{push_enabled:false,categories:["services","changes","reminders","vehicles","administration","information"],reminder_two_hours:false}};
}
