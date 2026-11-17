const { chromium } = require('playwright');
const base = process.env.BASE_URL || 'http://localhost:3100';
const results = [];
const ok = (name, cond, extra='') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.slice(0,200)));
  page.on('console', m => { if (m.type()==='error' && !/404/.test(m.text())) errs.push(m.text().slice(0,200)); });
  const toast = async () => (await page.locator('[data-sonner-toast]').first().textContent({ timeout: 5000 }).catch(()=>null));

  // 1 landing -> demo
  await page.goto(base);
  await page.getByRole('link', { name: /Explore demo/ }).first().click();
  await page.waitForURL('**/today');
  ok('demo lands on Today', (await page.locator('h1').textContent()).includes('Packed day ahead'));

  // 2 Had one
  await page.getByRole('button', { name: 'Had one' }).first().click();
  await page.waitForTimeout(1200);
  let t = await toast();
  ok('Had one toast', /Logged/.test(t||''), t||'');
  let body = await page.locator('main').innerText();
  ok('count 1 of 2 and stock 20', /1 of 2/.test(body) && /\b20\b/.test(body));
  ok('suggestion gone after logging (day covered)', /No drink suggested|You.re set/.test(body) || !/Had one/.test(body.replace('Log a drink','')));
  // undo
  await page.getByRole('button', { name: /Undo/ }).first().click();
  await page.waitForTimeout(1200);
  body = await page.locator('main').innerText();
  ok('undo restores 0 of 2 and 21 cans', /0 of 2/.test(body) && /\b21\b/.test(body));

  // 3 Plan: add to plan, then NL preference
  await page.goto(base + '/plan');
  await page.getByRole('button', { name: 'Add to plan' }).first().click();
  await page.waitForTimeout(1200);
  ok('accept toast', /plan/i.test(await toast() || ''));
  await page.fill('#nl', 'No reminders before 8');
  await page.getByRole('button', { name: 'Preview change' }).click();
  await page.waitForSelector('text=Here’s what would change');
  const prev = await page.locator('table').first().innerText();
  ok('NL preview shows before/after', /8 AM/.test(prev) && /7 AM/.test(prev), prev.replace(/\s+/g,' '));
  await page.getByRole('button', { name: 'Apply change' }).click();
  await page.waitForTimeout(1200);
  ok('NL applied + undo offered', await page.getByRole('button', { name: /Undo/ }).first().isVisible());
  await page.getByRole('button', { name: /Undo/ }).last().click().catch(()=>{});
  await page.fill('#nl', 'Keep it to three drinks per day');
  await page.getByRole('button', { name: 'Preview change' }).click();
  await page.waitForSelector('text=conflicts with product limits');
  ok('policy conflict rejected', true);
  await page.fill('#nl', 'I prefer matcha on office days');
  await page.getByRole('button', { name: 'Preview change' }).click();
  await page.waitForSelector('text=Which days are your office days');
  ok('office days clarification (no inference)', true);
  await page.getByRole('button', { name: 'Write my brief' }).click();
  await page.waitForTimeout(1200);
  ok('brief written', /Weekly brief/.test(await page.locator('main').innerText()) && /Suggested drinks|No drinks/.test(await page.locator('main').innerText()));

  // 4 Supply
  await page.goto(base + '/supply');
  await page.getByRole('button', { name: 'Correct count' }).first().click();
  await page.fill('#stk-chai', '3');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(1200);
  ok('stock corrected', /3/.test(await page.locator('li', { hasText: 'Chai' }).first().innerText()));
  await page.getByRole('button', { name: 'Skip next' }).click();
  await page.getByRole('button', { name: 'Skip it' }).click();
  await page.waitForTimeout(1200);
  ok('skip shipment confirmed explicitly', /Skipped/.test(await page.locator('main').innerText()));

  // 5 Shop -> checkout
  await page.goto(base + '/shop');
  await page.getByRole('radio', { name: /One time/ }).click();
  await page.getByRole('button', { name: 'Continue to simulated checkout' }).click();
  await page.waitForURL('**/shop/checkout**');
  await page.fill('#co-name', 'Ada'); await page.fill('#co-city', 'Chicago');
  await page.getByRole('button', { name: 'Place simulated order' }).click();
  await page.waitForURL('**/shop/confirmation**');
  ok('simulated order confirmation', /Order placed \(simulated\)/.test(await page.locator('h1').innerText()));

  // 6 Account
  await page.goto(base + '/account');
  await page.getByRole('button', { name: 'Refresh now' }).click();
  await page.waitForTimeout(1200);
  ok('demo refresh message is not a live claim', /Demo fixtures/.test(await page.locator('main').innerText()));
  await page.getByRole('button', { name: 'Delete imported data' }).first().click();
  await page.getByRole('button', { name: 'Delete imported data' }).last().click();
  await page.waitForTimeout(1200);
  await page.goto(base + '/today');
  ok('after deleting imported data agenda is empty', /Nothing on your calendar today|No calendar/.test(await page.locator('main').innerText()));

  // 7 scenarios
  for (const [id, expect] of [['evening-cutoff', /caffeine cutoff/], ['no-slots', /No open slot/], ['unknown-caffeine', /isn.t established/], ['two-drinks', /set for today|limit/], ['ambiguous-title', /Is .Session with Dana. a workout/], ['low-inventory', /Oolong/]]) {
    await page.goto(base + '/demo?scenario=' + id); await page.waitForURL('**/today');
    const txt = await page.locator('main').innerText();
    ok('scenario ' + id, expect.test(txt), txt.slice(0,0));
  }
  await page.getByRole('button', { name: 'Yes, it’s a workout' }).click().catch(()=>{});
  // isolation: second context has own state
  const ctx2 = await browser.newContext(); const p2 = await ctx2.newPage();
  await p2.goto(base + '/demo'); await p2.waitForURL('**/today');
  ok('second visitor isolated (default scenario)', /Packed day ahead/.test(await p2.locator('h1').innerText()));
  await ctx2.close();
  // no session
  const ctx3 = await browser.newContext(); const p3 = await ctx3.newPage();
  await p3.goto(base + '/today'); ok('no session redirects home', new URL(p3.url()).pathname === '/');
  await ctx3.close();

  console.log(results.map(r => r.join(' | ')).join('\n'));
  console.log('page errors:', [...new Set(errs)].slice(0,6));
  await browser.close();
})().catch(e => { console.log(results.map(r => r.join(' | ')).join('\n')); console.error('E2E CRASH', e.message.slice(0,400)); process.exit(1); });
