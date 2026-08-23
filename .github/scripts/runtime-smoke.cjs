const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);

  const pageErrors = [];
  const consoleErrors = [];
  let freeCalls = 0;
  let seenSystem = '';
  let productPrepareCalls = 0;

  page.on('pageerror', error => pageErrors.push(String(error.message || error)));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.addInitScript(() => localStorage.setItem('u369-lang-all-v4', 'sr'));

  await page.route('**/api/status', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      version: '2026.08.23.1-test',
      runtime: 'consolidated',
      integrations: { claude: false, openai: false, grok: false, workersAi: true, shopify: false }
    })
  }));

  await page.route('**/api/free-ai', async route => {
    freeCalls += 1;
    const body = JSON.parse(route.request().postData() || '{}');
    seenSystem = body.messages?.[0]?.content || '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: 'Stabilan odgovor.' })
    });
  });

  await page.route('**/api/ui-i18n', async route => {
    const body = JSON.parse(route.request().postData() || '{}');
    const target = String(body.target || 'en').toLowerCase();
    let d = {};
    if (target.startsWith('fr')) {
      d = {
        chat: 'Discussion', products: 'Produits', settings: 'Paramètres', newChat: 'Nouvelle discussion',
        workspace: 'Espace de travail', aiMode: 'Mode IA', providers: 'Fournisseurs', chatHistory: 'Historique',
        messageUnit369: 'Message à Unit369', applicationLanguage: 'Langue de l’application', openMenu: 'Ouvrir le menu'
      };
    } else if (target.startsWith('ar')) {
      d = {
        chat: 'الدردشة', products: 'المنتجات', settings: 'الإعدادات', newChat: 'محادثة جديدة',
        workspace: 'مساحة العمل', aiMode: 'وضع الذكاء الاصطناعي', providers: 'المزوّدون', chatHistory: 'سجل المحادثات',
        messageUnit369: 'رسالة إلى Unit369', applicationLanguage: 'لغة التطبيق', openMenu: 'فتح القائمة'
      };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ d }) });
  });

  await page.route('**/api/product-prepare-safe', async route => {
    productPrepareCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        draft: {
          title: 'Test proizvod', description: 'Proveren opis.', productType: 'Odeća',
          tags: ['test'], suggestedSizes: ['S', 'M'], skuBase: 'TEST'
        }
      })
    });
  });

  await page.route('**/api/products', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ products: [] })
  }));

  const response = await page.goto('http://127.0.0.1:8787/', { waitUntil: 'domcontentloaded' });
  if (!response || response.status() !== 200) throw new Error('root did not return 200');
  await page.waitForFunction(() => window.__UNIT369_RUNTIME__?.owner === 'consolidated-runtime');
  await page.waitForTimeout(700);

  if (await page.locator('#u369-sidebar').count() !== 1) throw new Error('sidebar owner count');
  if (await page.locator('#u369-chat-composer').count() !== 1) throw new Error('composer owner count');
  if (await page.locator('link[href*="runtime.css"]').count() !== 1) throw new Error('runtime stylesheet count');
  if (await page.locator('script[src*="runtime.js"]').count() !== 1) throw new Error('runtime script count');
  if (await page.locator('#sendBtn,#prompt,#panels,#openaiKey,#grokKey').count()) throw new Error('legacy DOM present');
  if (!(await page.locator('#u369-menu').isVisible())) throw new Error('mobile menu missing');
  if ((await page.locator('#u369-work-title').textContent()) !== 'Ćaskanje') throw new Error('Serbian title missing');
  if ((await page.locator('#u369-chat-input').getAttribute('placeholder')) !== 'Poruka za Unit369') throw new Error('Serbian composer missing');

  await page.locator('#u369-menu').click();
  if (!(await page.locator('#u369-sidebar').evaluate(node => node.classList.contains('open')))) throw new Error('drawer failed');
  if (await page.locator('[data-chat-mode]').count() !== 3) throw new Error('AI modes count');
  if (await page.locator('#u369-side-providers .u369-provider').count() !== 4) throw new Error('provider count');
  await page.locator('[data-shell-page="team"]').click();

  await page.locator('#u369-chat-input').fill('Test poruka');
  await page.locator('#u369-chat-send').click();
  await page.locator('.u369-user-msg').filter({ hasText: 'Test poruka' }).waitFor();
  await page.locator('.u369-answer').filter({ hasText: 'Stabilan odgovor.' }).waitFor();
  if (freeCalls !== 1) throw new Error(`expected one Workers AI request, got ${freeCalls}`);
  if (!/natural standard Serbian/i.test(seenSystem) || !/Ekavian/i.test(seenSystem) || !/Bok/.test(seenSystem)) {
    throw new Error('Serbian AI language instruction missing');
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__UNIT369_RUNTIME__?.owner === 'consolidated-runtime');
  await page.waitForTimeout(350);
  if (await page.locator('#u369-sidebar').count() !== 1 || await page.locator('#u369-chat-composer').count() !== 1) {
    throw new Error('runtime duplicated after refresh');
  }
  await page.locator('.u369-user-msg').filter({ hasText: 'Test poruka' }).waitFor();
  await page.locator('.u369-answer').filter({ hasText: 'Stabilan odgovor.' }).waitFor();
  if (freeCalls !== 1) throw new Error('reload repeated the AI request');

  await page.locator('#u369-menu').click();
  await page.locator('[data-shell-page="product"]').click();
  if (!(await page.locator('#page-product').evaluate(node => node.classList.contains('active')))) throw new Error('product page inactive');
  if (await page.locator('#pws').count() !== 1 || await page.locator('#page-product form').count() !== 1) throw new Error('product workflow duplicate');
  await page.locator('#page-product [name="title"]').fill('Test');
  await page.locator('#page-product [name="description"]').fill('Beleške');
  await page.locator('#pws-ai').click();
  await page.locator('#page-product [name="title"]').waitFor();
  await page.waitForFunction(() => document.querySelector('#page-product [name="title"]')?.value === 'Test proizvod');
  if (productPrepareCalls !== 1) throw new Error('product prepare request count');
  await page.locator('#page-product [name="price"]').fill('20');
  await page.locator('#page-product [name="sizes"]').fill('S,M');
  await page.locator('#f button[type="submit"]').click();
  if (!(await page.locator('#pws-preview').evaluate(node => node.classList.contains('open')))) throw new Error('product preview failed');

  await page.locator('#u369-menu').click();
  await page.locator('[data-shell-page="settings"]').click();
  if (!(await page.locator('#page-settings').evaluate(node => node.classList.contains('active')))) throw new Error('settings page inactive');
  if (await page.locator('#ss-root').count() !== 1 || await page.locator('#u369-lang-all').count() !== 1) throw new Error('settings owner duplicate');
  await page.locator('#u369-lang-all-s').selectOption('fr');
  await page.waitForFunction(() => document.documentElement.lang.toLowerCase().startsWith('fr'));
  await page.waitForTimeout(180);
  if ((await page.locator('#page-settings .section-title').textContent()) !== 'Paramètres') throw new Error('French settings missing');
  if ((await page.locator('html').getAttribute('dir')) !== 'ltr') throw new Error('French direction wrong');
  await page.locator('#u369-lang-all-s').selectOption('ar');
  await page.waitForFunction(() => document.documentElement.lang.toLowerCase().startsWith('ar'));
  await page.waitForTimeout(180);
  if ((await page.locator('html').getAttribute('dir')) !== 'rtl') throw new Error('Arabic RTL missing');

  if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
  if (consoleErrors.length) throw new Error('console errors: ' + consoleErrors.join(' | '));

  await browser.close();
  console.log('consolidated runtime smoke test passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
