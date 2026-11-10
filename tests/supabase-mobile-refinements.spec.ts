import {test,expect,type Page} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {mkdir} from "node:fs/promises";
import path from "node:path";
import {mobileFixture} from "./mobile-fixture";
import {login} from "./supabase-events-fixture";
import {publicPath} from "../src/config/app";
import type {Notice} from "../src/domain/notifications";

type Fixture=Awaited<ReturnType<typeof mobileFixture>>;
function notices(fixture:Fixture){
  fixture.inbox.notices=Array.from({length:7},(_,i):Notice=>({
    id:`d0810000-0000-4000-8000-${String(i+1).padStart(12,"0")}`,
    source_kind:"event",target_id:fixture.state.events[i%4].id,event_type:"event_changed",category:"changes",
    title:`${i+1} · Aktualisierung: ${fixture.state.events[i%4].title}`,
    message:"Isolierte organisatorische Testnachricht mit zusätzlichen Informationen zur nächsten gemeinsamen Ausbildung.",
    created_at:new Date(fixture.state.now-i*60000).toISOString(),read_at:i%2?new Date(fixture.state.now).toISOString():null,
    delivery:{total:0,accepted:0,pending:0,failed:0,cancelled:0},
  })).reverse();
  fixture.inbox.unread=4;
}
async function capture(page:Page,name:string){
  if(!process.env.MOBILE_SCREENSHOT_DIR)return;
  await mkdir(process.env.MOBILE_SCREENSHOT_DIR,{recursive:true});
  await page.screenshot({path:path.join(process.env.MOBILE_SCREENSHOT_DIR,`081-${name}.png`),animations:"disabled"});
}
async function noOverflow(page:Page){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  for(const dialog of await page.getByRole("dialog").all())
    expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
}
async function navigate(page:Page,name:string){
  const width=page.viewportSize()?.width??1440,mobile=width<768;
  if(name==="Statistik" && mobile){
    await page.getByRole("button",{name:"Mehr Bereiche"}).click();
    await page.getByRole("dialog",{name:"Weitere Bereiche"}).getByRole("link",{name,exact:true}).click();
  }else await page.locator(mobile?".compact-bottom-nav":width<1100?".legacy-bottom-nav":".sidebar")
    .getByRole("link",{name,exact:true}).click();
}

for(const width of [320,375,390,430,768,1440])for(const theme of ["light","dark"] as const){
  test.describe(`DEV081 ${width}px ${theme}`,()=>{
    test.use({viewport:{width,height:844},colorScheme:theme});
  test("shared header, preview and calendar",async({context,page})=>{
    const fixture=await mobileFixture(context);notices(fixture);
    await login(page,true);
    const height=(await page.locator(".topbar").boundingBox())!.height;
    await navigate(page,"Start");
    await expect(page.getByText("Mein Feuerwehr-Cockpit",{exact:true})).toBeVisible();
    await expect(page.locator(".topbar")).toHaveCount(1);
    expect((await page.locator(".topbar").boundingBox())!.height).toBe(height);
    if(width<768){
      expect(height).toBeLessThanOrEqual(72);
      await expect(page.locator(".topbar .header-signout")).toBeHidden();
      const nav=page.getByRole("navigation",{name:"Mobile Navigation",exact:true});
      expect(await nav.getByRole("link").allTextContents()).toEqual(["Start","Termine","Dokumente","Profil"]);
      await expect(nav.getByRole("link",{name:"Start",exact:true})).toHaveAttribute("aria-current","page");
    }else await expect(page.locator(".topbar .header-signout")).toBeVisible();
    await noOverflow(page);
    if(width===390){
      await capture(page,`home-${theme}`);
      if(process.env.MOBILE_SCREENSHOT_DIR)await page.locator(".compact-bottom-nav").screenshot({
        path:path.join(process.env.MOBILE_SCREENSHOT_DIR,`081-navigation-${theme}.png`),animations:"disabled"});
    }
    const bell=page.getByRole("button",{name:"Benachrichtigungen öffnen",exact:true});
    await expect(bell.locator(".notification-badge")).toHaveText("4");
    const url=page.url();await bell.click();
    const preview=page.getByRole("dialog",{name:"Aktuelle Benachrichtigungen",exact:true});
    await expect(preview.locator(".notification-preview-item")).toHaveCount(5);
    await expect(preview.locator(".notification-preview-item").first()).toContainText("1 · Aktualisierung:");
    await expect(preview.locator(".notification-preview-item").nth(1)).toContainText("Gelesen");
    await expect(preview.locator(".notification-preview-item").first()).toContainText("Ungelesen");
    expect(page.url()).toBe(url);await noOverflow(page);
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
    if(width===390 || width===1440)await capture(page,`preview-${width}-${theme}`);
    await page.keyboard.press("Escape");await expect(preview).toHaveCount(0);await expect(bell).toBeFocused();
    await bell.click();await page.mouse.click(2,2);await expect(preview).toHaveCount(0);
    await page.getByRole("button",{name:"Farbschema wechseln"}).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme",theme==="light"?"dark":"light");
    await page.getByRole("button",{name:"Farbschema wechseln"}).click();
    if(width<768){
      await page.getByRole("button",{name:"Mehr Bereiche"}).click();
      await expect(page.getByRole("dialog",{name:"Weitere Bereiche"}).getByRole("link",{name:"Statistik",exact:true})).toBeVisible();
      if(width===390)await capture(page,`more-${theme}`);
      await page.getByRole("button",{name:"Dialog schließen",exact:true}).click();
    }
    await navigate(page,"Termine");
    await page.getByRole("button",{name:"Gemeinsamer Kalender",exact:true}).click();
    await expect(page.getByRole("button",{name:width<768?"Liste":"Monat",exact:true})).toHaveAttribute("aria-pressed","true");
    await expect(page.locator(width<768?".calendar-list":".calendar-month")).toBeVisible();
    await noOverflow(page);
    if(width===390 || width===1440){
      await page.locator(".calendar-toolbar").evaluate(element=>{
        const header=document.querySelector(".topbar")?.getBoundingClientRect().height??0;
        window.scrollTo({top:window.scrollY+element.getBoundingClientRect().top-header-12,behavior:"instant"});
      });
      await capture(page,`calendar-${width}-${theme}`);
    }
    if(width===390){
      await navigate(page,"Statistik");
      await expect(page.getByRole("heading",{name:"Mein Dienstbuch",exact:true})).toBeVisible();
      await capture(page,`statistics-${theme}`);
      await navigate(page,"Profil");
      await expect(page.getByRole("heading",{name:"Verifiziertes DEV-Profil"})).toBeVisible();
      await expect(page.getByRole("heading",{name:"Mein Dienstbuch",exact:true})).toHaveCount(0);
      await capture(page,`profile-${theme}`);
    }
    expect(fixture.state.audit).toHaveLength(0);
  });
  });
}

test("preview reuses inbox updates, explicit read and validated direct links",async({context,page})=>{
  const fixture=await mobileFixture(context);notices(fixture);await login(page,true);
  const bell=page.getByRole("button",{name:"Benachrichtigungen öffnen",exact:true});
  await bell.click();
  const preview=page.getByRole("dialog",{name:"Aktuelle Benachrichtigungen"});
  await preview.getByRole("link",{name:"Alle Benachrichtigungen",exact:true}).click();
  await expect(page).toHaveURL(/profil\/#posteingang$/);
  await expect(page.getByRole("heading",{name:"Posteingang · 4 ungelesen"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Mein Dienstbuch",exact:true})).toHaveCount(0);
  await bell.click();
  await preview.getByRole("link",{name:"Einstellungen",exact:true}).click();
  await expect(page).toHaveURL(/profil\/#benachrichtigungseinstellungen$/);
  await expect(page.getByRole("button",{name:"Benachrichtigungseinstellungen speichern"})).toBeVisible();
  await bell.click();
  await preview.locator(".notification-preview-item").first().click();
  await expect(preview).toHaveCount(0);
  await expect(page.getByRole("dialog",{name:fixture.state.events[0].title,exact:true})).toBeVisible();
  expect(fixture.notificationQueries).toContain("d0810000-0000-4000-8000-000000000001");
  await expect(bell.locator(".notification-badge")).toHaveText("3");
  expect(fixture.inbox.notices.find(notice=>notice.id.endsWith("000000000001"))?.read_at).not.toBeNull();
});

test("preview distinguishes empty/read inbox, rejects changed identity and revoked targets",async({context,page})=>{
  const fixture=await mobileFixture(context);await login(page,true);
  const bell=page.getByRole("button",{name:"Benachrichtigungen öffnen",exact:true});
  const preview=page.getByRole("dialog",{name:"Aktuelle Benachrichtigungen"});
  await bell.click();await expect(preview).toContainText("Dein Posteingang ist leer.");
  await page.keyboard.press("Escape");
  notices(fixture);fixture.inbox.notices.forEach(notice=>{notice.read_at=new Date(fixture.state.now).toISOString();});fixture.inbox.unread=0;
  await bell.click();await expect(preview).toContainText("Keine ungelesenen Benachrichtigungen.");
  const id=fixture.inbox.notices.at(-1)!.id;
  await context.route("https://syntheticci.supabase.co/rest/v1/rpc/ff_notifications",async route=>{
    if(route.request().postDataJSON().notice_id===id)return route.fulfill({contentType:"application/json",body:JSON.stringify({...fixture.inbox,notices:[]})});
    return route.fallback();
  });
  await preview.locator(".notification-preview-item").first().click();
  await expect(preview.getByRole("alert")).toContainText("nicht mehr berechtigt verfügbar");
  await page.keyboard.press("Escape");
  fixture.inbox.actor_id="a0810000-0000-4000-8000-000000000099";
  await bell.click();await expect(preview.getByRole("alert")).toBeVisible();
  await expect(preview.locator(".notification-preview-item")).toHaveCount(0);
});

test("calendar loads the next five beyond month boundaries, expands and remembers viewport-specific choice",async({context,page})=>{
  await page.setViewportSize({width:390,height:844});
  const fixture=await mobileFixture(context),prototype=fixture.state.events[0];
  fixture.state.events=Array.from({length:8},(_,i)=>({...prototype,id:`30000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`,
    title:`Kalender-Test ${i}`,starts_at:new Date(fixture.state.now+(i===1?-1800000:(i-1)*60*86400000)).toISOString(),
    ends_at:new Date(fixture.state.now+(i-1)*60*86400000+3600000).toISOString()})).reverse();
  await login(page,true);await page.getByRole("button",{name:"Gemeinsamer Kalender",exact:true}).click();
  const list=page.getByLabel("Nächste Kalendertermine");
  await expect(list.locator(".calendar-chip")).toHaveCount(5);
  await expect(list.locator(".calendar-chip").first()).toContainText("Kalender-Test 1");
  await expect(list).not.toContainText("Kalender-Test 0");
  expect(fixture.calendarQueries[0].page_size).toBe(5);
  await page.getByRole("button",{name:"Weitere Termine anzeigen"}).click();
  await expect(list.locator(".calendar-chip")).toHaveCount(7);
  await expect(page.getByRole("button",{name:"Weitere Termine anzeigen"})).toHaveCount(0);
  await list.locator(".calendar-chip").first().click();
  await expect(page.getByRole("dialog",{name:"Kalender-Test 1",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Dialog schließen",exact:true}).click();
  await page.getByRole("button",{name:"Monat",exact:true}).click();
  await navigate(page,"Profil");await navigate(page,"Termine");
  await page.getByRole("button",{name:"Gemeinsamer Kalender",exact:true}).click();
  await expect(page.getByRole("button",{name:"Monat",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"Liste",exact:true}).click();
  await page.setViewportSize({width:1440,height:1000});
  await expect(page.getByRole("button",{name:"Monat",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"Woche",exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole("button",{name:"Liste",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.setViewportSize({width:1440,height:1000});
  await expect(page.getByRole("button",{name:"Woche",exact:true})).toHaveAttribute("aria-pressed","true");
});

test("missing upcoming RPC is explicit and the existing month remains usable",async({context,page})=>{
  await mobileFixture(context);
  await context.route("https://syntheticci.supabase.co/rest/v1/rpc/ff_calendar_upcoming",route=>
    route.fulfill({status:404,contentType:"application/json",body:JSON.stringify({code:"PGRST202",message:"Synthetic missing RPC"})}));
  await login(page,true);
  await page.getByRole("button",{name:"Gemeinsamer Kalender",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("DEV-Migration 040");
  await page.getByRole("button",{name:"Monat",exact:true}).click();
  await expect(page.locator(".calendar-month")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("unavailable session storage explains the limitation without blocking calendar choices",async({context,page})=>{
  await context.addInitScript(()=>Object.defineProperty(window,"sessionStorage",{
    get(){throw new DOMException("Synthetic unavailable session storage","SecurityError");},
  }));
  await mobileFixture(context);await login(page,true);
  await page.getByRole("button",{name:"Gemeinsamer Kalender",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("Sitzungsspeicher");
  await page.getByRole("button",{name:"Monat",exact:true}).click();
  await expect(page.locator(".calendar-month")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("nur in dieser Ansicht");
});

test("journal stays only in statistics; profile settings and old journal bookmarks remain usable",async({context,page})=>{
  const fixture=await mobileFixture(context);await login(page,true);
  await navigate(page,"Start");
  await expect(page.getByRole("link",{name:"Mein Dienstbuch öffnen",exact:true})).toHaveAttribute("href",publicPath("/statistik/#dienstbuch"));
  await expect(page.getByRole("link",{name:"Mein Dienstbuch",exact:true})).toHaveAttribute("href",publicPath("/statistik/#dienstbuch"));
  await navigate(page,"Profil");
  await expect(page.getByRole("region",{name:"Digitales Feuerwehr-Dienstbuch"})).toHaveCount(0);
  await capture(page,"profile");
  await navigate(page,"Statistik");
  await expect(page.getByRole("heading",{name:"Mein Dienstbuch",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Mehr Bereiche"})).toHaveClass(/active/);
  await capture(page,"statistics");
  await page.goBack();
  await expect(page.getByRole("heading",{name:"Verifiziertes DEV-Profil"})).toBeVisible();
  await page.goto(publicPath("/profil/#dienstbuch"));
  await expect(page).toHaveURL(/statistik\/#dienstbuch$/);
  await expect(page.getByRole("heading",{name:"Mein Dienstbuch",exact:true})).toBeVisible();
  expect(fixture.state.audit).toHaveLength(0);
});
