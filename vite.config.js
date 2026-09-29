import { defineConfig, loadEnv } from 'vite';

// Только для `npm run dev`: /api/lead обслуживает та же функция, что и на Vercel.
// Переменные TELEGRAM_* берутся из .env.local (он в .gitignore). На сборку не влияет.
function devApi() {
  return {
    name: 'korteam-dev-api',
    apply: 'serve',
    configureServer(server) {
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), 'TELEGRAM_'));
      server.middlewares.use('/api/lead', async (req, res) => {
        const mod = await server.ssrLoadModule('/api/lead.js');
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          for (const item of [].concat(v)) headers.append(k, item);
        }
        const request = new Request(`http://${req.headers.host}${req.originalUrl}`, {
          method: req.method,
          headers,
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
        });
        const handler = mod[req.method];
        const response = handler ? await handler(request) : new Response(null, { status: 405 });
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  };
}

export default defineConfig({ plugins: [devApi()] });
