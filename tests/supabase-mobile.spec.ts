import {test,expect,type Page} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {mkdir} from "node:fs/promises";
import path from "node:path";
import {publicPath} from "../src/config/app";
import {login,unit,admin} from "./supabase-events-fixture";
import {mobileFixture} from "./mobile-fixture";

async function noOverflow(page:Page){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  for(const dialog of await page.getByRole("dialog").all())
    expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
}
async function capture(page:Page,name:string){
  if(!process.env.MOBILE_SCREENSHOT_DIR)return;
  await mkdir(process.env.MOBILE_SCREENSHOT_DIR,{recursive:true});
  await page.screenshot({path:path.join(process.env.MOBILE_SCREENSHOT_DIR,`${name}.png`),animations:"disabled"});
}
for(const width of [320,375,390,430,768,1440])for(const theme of ["light","dark"] as const){
  test(`responsive services ${width}px ${theme}: compact summary, complete details and preserved scroll`,async({browser})=>{
    const context=await browser.newContext({viewport:{width,height:844},colorScheme:theme});
    const {state}=await mobileFixture(context),page=await context.newPage();await login(page,true);
    const mobile=width<768;
    await expect(page.locator(".service-summary")).toHaveCount(mobile?4:0);
    if(mobile){
      await expect(page.locator(".topbar .header-signout")).toBeHidden();
      expect(await page.locator(".topbar").evaluate(e=>e.getBoundingClientRect().height)).toBeLessThanOrEqual(72);
      const nav=page.getByRole("navigation",{name:"Mobile Navigation",exact:true});
      await expect(nav.getByRole("link")).toHaveCount(4);
      await expect(nav.getByRole("button",{name:"Mehr Bereiche"})).toBeVisible();
      for(const link of await nav.getByRole("link").all()){
        const box=await link.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(await link.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
      }
      const card=page.getByRole("button",{name:`Termindetails öffnen: ${state.events[1].title}`,exact:false});
      await card.evaluate(element=>element.scrollIntoView({block:"start"}));
      expect((await card.boundingBox())!.y).toBeGreaterThanOrEqual((await page.locator(".topbar").boundingBox())!.height);
      const scroll=await page.evaluate(()=>window.scrollY),queries=state.queries.length;
      expect(await card.evaluate(e=>e.getBoundingClientRect().height)).toBeLessThan(260);
      await card.click();
      const dialog=page.getByRole("dialog",{name:state.events[1].title,exact:true});
      await expect(dialog.getByText(state.events[1].description,{exact:true})).toBeVisible();
      await expect(dialog.getByRole("button",{name:"Ich komme",exact:false})).toBeEnabled();
      await expect(dialog.getByRole("button",{name:"Termin bearbeiten",exact:true})).toBeVisible();
      await noOverflow(page);
      expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
      if(width===390)await capture(page,`event-details-${theme}`);
      await dialog.getByRole("button",{name:"Zurück zur Terminübersicht"}).click();
      await expect(card).toBeFocused();
      expect(Math.abs(await page.evaluate(()=>window.scrollY)-scroll)).toBeLessThanOrEqual(2);
      expect(state.queries).toHaveLength(queries);expect(state.audit).toHaveLength(0);
      expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe("hidden");
      await page.evaluate(()=>window.scrollTo(0,0));
    }else{
      await expect(page.getByRole("button",{name:"Einzeltermin erstellen",exact:true})).toBeVisible();
      await expect(page.getByRole("combobox",{name:"Terminansicht",exact:true})).toBeVisible();
      await expect(page.getByRole("button",{name:"Ich komme",exact:false})).toHaveCount(4);
    }
    await noOverflow(page);
    if(width===390){
      await capture(page,`header-${theme}`);
      await page.locator(".service-summary").first().evaluate(element=>element.scrollIntoView({block:"start"}));
      await capture(page,`services-${theme}`);
    }
    if(width===1440 && theme==="light")await capture(page,"desktop-services");
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
    await context.close();
  });
}

for(const role of ["global","unit","member","delegate"] as const)test(`mobile tools, filters, response and role boundary: ${role}`,async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const {state,actor}=await mobileFixture(context,role),page=await context.newPage();await login(page,role==="global");
  const plans=role==="global" || role==="unit";
  await expect(page.getByRole("button",{name:"Verwalten",exact:true})).toHaveCount(plans?1:0);
  if(plans){
    await page.getByRole("button",{name:"Termin erstellen",exact:true}).click();
    const create=page.getByRole("dialog",{name:"Termin erstellen",exact:true});
    await expect(create.getByRole("button",{name:"Terminserie erstellen",exact:true})).toBeVisible();
    await expect(create.getByRole("button",{name:"Einzeltermin erstellen",exact:true})).toBeVisible();
    await create.getByRole("button",{name:"Dialog schließen"}).click();
    await page.getByRole("button",{name:"Verwalten",exact:true}).click();
    const manage=page.getByRole("dialog",{name:"Termine verwalten"});
    await expect(manage.getByRole("button",{name:"Termine aus CSV importieren"})).toBeVisible();
    await expect(manage.getByRole("button",{name:"CSV-Vorlage herunterladen"})).toBeVisible();
    await noOverflow(page);if(role==="global")await capture(page,"manage-actions");
    await manage.getByRole("button",{name:"Dialog schließen"}).click();
  }
  await page.getByRole("button",{name:"Filter öffnen"}).click();
  const filter=page.getByRole("dialog",{name:"Terminfilter",exact:true});
  await filter.getByRole("combobox",{name:"Terminansicht",exact:true}).selectOption("month");
  await filter.getByLabel("Monat und Jahr").fill("2026-11");
  await filter.getByRole("combobox",{name:"Terminstatus",exact:true}).selectOption("scheduled");
  await expect(filter.getByRole("button",{name:"Standardansicht wiederherstellen"})).toBeEnabled();
  if(role==="global")await capture(page,"filters");
  await filter.getByRole("button",{name:"Filter übernehmen und schließen"}).click();
  await expect(page.getByLabel("Aktive Terminfilter")).toContainText("November");
  await page.getByRole("button",{name:"Filter öffnen"}).click();
  await expect(filter.getByLabel("Monat und Jahr")).toHaveValue("2026-11");
  await expect(filter.getByRole("combobox",{name:"Terminstatus",exact:true})).toHaveValue("scheduled");
  await filter.getByRole("button",{name:"Standardansicht wiederherstellen"}).click();
  await expect(filter.getByRole("combobox",{name:"Terminansicht",exact:true})).toHaveValue("upcoming");
  await filter.getByRole("button",{name:"Dialog schließen"}).click();
  await page.getByRole("button",{name:`Termindetails öffnen: ${state.events[0].title}`,exact:false}).click();
  const details=page.getByRole("dialog",{name:state.events[0].title,exact:true});
  await expect(details.getByRole("button",{name:"Termin bearbeiten",exact:true})).toHaveCount(plans?1:0);
  await expect(details.getByRole("button",{name:"Organisator zuweisen"})).toHaveCount(plans?1:0);
  await expect(details.getByRole("button",{name:"Anwesenheit öffnen"})).toHaveCount(role==="member"?0:1);
  if(plans){
    const participants=details.locator("details.dev-participants");
    await expect(participants).not.toHaveAttribute("open","");
    await participants.locator("summary").click();
    await expect(participants.getByRole("list").getByText("Synthetic Member",{exact:true})).toBeVisible();
    await expect(participants.getByRole("list").getByText("Synthetic Admin",{exact:true})).toBeVisible();
  }
  await details.getByRole("button",{name:"Vielleicht",exact:false}).click();
  await expect(details.getByRole("status")).toContainText("Rückmeldung in Supabase gespeichert");
  expect(state.answers.get(`${state.events[0].id}:${actor}`)).toBe("maybe");
  await details.getByRole("button",{name:"Zurück zur Terminübersicht"}).click();
  await expect(page.getByRole("article",{name:state.events[0].title,exact:true})).toContainText("Vielleicht");
  await page.getByRole("button",{name:"Mehr Bereiche"}).click();
  const more=page.getByRole("dialog",{name:"Weitere Bereiche"});
  await expect(more.getByRole("link",{name:"Administration",exact:true})).toHaveCount(plans?1:0);
  await expect(more.getByRole("link",{name:"Statistik",exact:true})).toBeVisible();
  await context.close();
});

test("mobile single creation, started attendance completion and confirmation remain functional",async({context,page})=>{
  await page.setViewportSize({width:375,height:812});
  const {state}=await mobileFixture(context);
  state.events[0].starts_at=new Date(state.now-3600000).toISOString();
  await login(page,true);
  await page.getByRole("button",{name:"Termin erstellen",exact:true}).click();
  await page.getByRole("button",{name:"Einzeltermin erstellen",exact:true}).click();
  const editor=page.getByRole("dialog",{name:"Neuer Einzeltermin",exact:true});
  await editor.getByLabel("Titel",{exact:true}).fill("Mobile Testübung");
  await editor.getByLabel("Beschreibung",{exact:true}).fill("Isolierter mobiler Test");
  await editor.getByLabel("Beginn (Europe/Berlin)",{exact:true}).fill("2026-11-20T19:00");
  await editor.getByLabel("Ende (Europe/Berlin)",{exact:true}).fill("2026-11-20T21:00");
  await editor.getByLabel("Ort",{exact:true}).fill("Gerätehaus Scheuren");
  await editor.getByRole("button",{name:"Termin speichern",exact:true}).click();
  await expect(editor).toHaveCount(0);expect(state.events).toHaveLength(5);
  expect(new Set(state.events.map(event=>event.id)).size).toBe(5);
  await page.getByRole("button",{name:"Termine aktualisieren",exact:true}).click();
  await page.getByRole("button",{name:"Filter öffnen"}).click();
  await page.getByRole("dialog",{name:"Terminfilter"}).getByRole("combobox",{name:"Terminansicht"}).selectOption("open_attendance");
  await page.getByRole("button",{name:"Filter übernehmen und schließen"}).click();
  await page.getByRole("button",{name:`Termindetails öffnen: ${state.events[0].title}`,exact:false}).click();
  const details=page.getByRole("dialog",{name:state.events[0].title,exact:true});
  await expect(details.getByRole("button",{name:"Ich komme",exact:false})).toBeDisabled();
  await details.getByRole("button",{name:"Anwesenheit erfassen"}).click();
  await details.locator(".dev-attendance").getByRole("button",{name:"Liste abschließen",exact:true}).click();
  await expect(details.getByRole("button",{name:"Abschluss bestätigen",exact:true})).toBeVisible();
  await details.getByRole("button",{name:"Abschluss bestätigen",exact:true}).click();
  await expect(details.locator(".attendance-state")).toContainText("Verbindlich abgeschlossen");
  expect(state.attendance.get(state.events[0].id)?.state).toBe("COMPLETED");
  expect(state.attendanceAudit.some(row=>row.actor===admin)).toBe(true);
  await noOverflow(page);
  await details.getByRole("button",{name:"Zurück zur Terminübersicht"}).click();
  await expect(page.locator(".service-summary")).toHaveCount(0);
  await expect(page.getByRole("status").filter({hasText:"0 offene Anwesenheitslisten"})).toBeVisible();
});

test("mobile secondary routes, calendars and logout stay reachable without writes",async({context,page})=>{
  await page.setViewportSize({width:320,height:760});
  const {state}=await mobileFixture(context);await login(page,true);
  await page.getByRole("button",{name:"Gemeinsamer Kalender",exact:true}).click();
  await expect(page.getByRole("region",{name:"Gemeinsamer Feuerwehrkalender"})).toBeVisible();
  await noOverflow(page);
  await page.getByRole("button",{name:/Fahrzeugkalender/}).click();
  await expect(page.getByRole("region",{name:"Fahrzeuge und Reservierungen"})).toBeVisible();
  await noOverflow(page);
  await page.getByRole("button",{name:/Dienstverwaltung/}).click();
  const nav=page.getByRole("navigation",{name:"Mobile Navigation",exact:true});
  await nav.getByRole("link",{name:"Dokumente",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Dokumentenbereiche"})).toBeVisible();await noOverflow(page);
  await page.getByRole("button",{name:"Mehr Bereiche"}).click();
  await page.getByRole("dialog").getByRole("link",{name:"Statistik",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Mein Dienstbuch",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Meine Diensthistorie",exact:true})).toBeVisible();await noOverflow(page);
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await page.getByRole("button",{name:"Mehr Bereiche"}).click();
  await page.getByRole("dialog").getByRole("link",{name:"Administration",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Mitgliederverwaltung",exact:true})).toBeVisible();await noOverflow(page);
  await nav.getByRole("link",{name:"Profil",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Verifiziertes DEV-Profil"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Posteingang · 0 ungelesen"})).toBeVisible();await noOverflow(page);
  await page.getByRole("button",{name:"Abmelden / Sitzung entfernen",exact:true}).click();
  await expect(page.getByRole("button",{name:"Anmelden",exact:true})).toBeVisible();
  expect(state.audit).toHaveLength(0);expect(state.events.every(e=>e.unit_id===unit)).toBe(true);
});

test("home shares the compact header/navigation and preserves cockpit content; optional cockpit pixel comparison",async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:"light"});
  await mobileFixture(context);const page=await context.newPage();await login(page,true);
  await page.getByRole("navigation",{name:"Mobile Navigation",exact:true}).getByRole("link",{name:"Start",exact:true}).click();
  await expect(page.getByText("Mein Feuerwehr-Cockpit",{exact:true})).toBeVisible();
  await expect(page.locator(".mobile-workspace")).toHaveCount(0);
  await expect(page.locator(".topbar .header-signout")).toBeHidden();
  await expect(page.getByRole("navigation",{name:"Mobile Navigation",exact:true}).getByRole("link")).toHaveCount(4);
  await expect(page.getByRole("button",{name:"Mehr Bereiche"})).toHaveCount(1);
  if(process.env.MOBILE_BASELINE_URL){
    const baseline=await browser.newContext({viewport:{width:390,height:844},colorScheme:"light",baseURL:process.env.MOBILE_BASELINE_URL});
    await mobileFixture(baseline,"global",true);const old=await baseline.newPage();await login(old,true);
    await old.getByRole("link",{name:"Start",exact:true}).click();
    await expect(old.getByText("Mein Feuerwehr-Cockpit",{exact:true})).toBeVisible();
    for(const target of [page,old]){
      await target.evaluate(async()=>{
        await document.fonts.ready;
        const release=document.querySelector(".release-status");
        if(release)release.textContent="Deterministischer Versionsnachweis für den Layoutvergleich";
        window.scrollTo(0,0);
      });
    }
    const style=".topbar,.bottom-nav{display:none!important}";
    const current=await page.locator(".cockpit").screenshot({path:test.info().outputPath("current-cockpit.png"),animations:"disabled",style});
    const accepted=await old.locator(".cockpit").screenshot({path:test.info().outputPath("accepted-cockpit.png"),animations:"disabled",style});
    await test.info().attach("current-cockpit",{body:current,contentType:"image/png"});
    await test.info().attach("accepted-cockpit",{body:accepted,contentType:"image/png"});
    expect(current.equals(accepted),"Cockpit pixels must match; header and navigation are intentionally refined").toBe(true);
    await baseline.close();
  }
  await expect(page).toHaveURL(new RegExp(`${publicPath("/")}$`));
  await context.close();
});
