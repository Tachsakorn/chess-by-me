/**
 * The previous release and this build, each served by `wrangler dev` with its own Worker and
 * files, behind one address that can be switched from one to the other the way a deploy switches
 * chessby.me (Fable review 1.1 area 8 test 3; after the review's proxy.cjs). Everything lives in
 * .release-cache/ at the root of the repository (git-ignored); wrangler never runs at the root.
 */
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CACHE = join(ROOT, '.release-cache');

/** The production build of `tag`, made once and kept in .release-cache/<tag>. */
export function previousRelease(tag: string): { dist: string; worker: string } {
  const dir = join(CACHE, tag);
  const dist = join(dir, 'dist');
  const worker = join(dir, 'deploy', 'production', 'worker.js');
  if (existsSync(join(dist, 'index.html')) && existsSync(worker)) return { dist, worker };
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const archive = join(CACHE, `${tag}.tar`);
  execSync(`git archive --format=tar -o "${archive}" ${tag}`, { cwd: ROOT, stdio: 'inherit' });
  // Relative, from inside the folder: Git's tar on Windows reads "C:" as a remote host.
  execSync(`tar -xf ../${tag}.tar`, { cwd: dir, stdio: 'inherit' });
  rmSync(archive, { force: true });
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'junction');
  execSync('npm run build:production', { cwd: dir, stdio: 'inherit' });
  return { dist, worker };
}

/** A copy of this repository's production build (dist/, made by the config's web server). */
export function currentBuild(): { dist: string; worker: string } {
  const dir = join(CACHE, 'current');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(join(ROOT, 'dist'), join(dir, 'dist'), { recursive: true });
  return { dist: join(dir, 'dist'), worker: join(ROOT, 'deploy', 'production', 'worker.js') };
}

const slash = (path: string) => path.replaceAll('\\', '/');

/** `wrangler dev` of one build on `port`; resolves once it answers. */
export async function serve(
  name: string,
  build: { dist: string; worker: string },
  port: number,
): Promise<ChildProcess> {
  const config = join(CACHE, `wrangler-${name}.jsonc`);
  writeFileSync(
    config,
    JSON.stringify({
      name: `release-test-${name}`,
      compatibility_date: '2026-11-01',
      main: slash(build.worker),
      assets: {
        directory: slash(build.dist),
        binding: 'ASSETS',
        run_worker_first: true,
        not_found_handling: 'single-page-application',
      },
    }),
  );
  const child = spawn(
    'npx',
    ['wrangler', 'dev', '-c', config, '--local', '--port', String(port), '--ip', '127.0.0.1'],
    { cwd: CACHE, shell: true, stdio: 'ignore', detached: process.platform !== 'win32' },
  );
  for (let i = 0; i < 240; i += 1) {
    const up = await fetch(`http://127.0.0.1:${port}/`).then(
      (r) => r.ok,
      () => false,
    );
    if (up) return child;
    await new Promise((r) => setTimeout(r, 500));
  }
  stop(child);
  throw new Error(`wrangler dev for ${name} did not start on ${port}`);
}

/** Stops a server and everything it started (npx, wrangler, workerd). */
export function stop(child: ChildProcess): void {
  if (child.pid === undefined) return;
  try {
    if (process.platform === 'win32')
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGKILL');
  } catch {
    // already gone
  }
}

/** One address in front of several ports; `to(port)` is the deploy. */
export function switchboard(
  port: number,
  first: number,
): Promise<{ to(next: number): void; close(): void }> {
  let target = first;
  const server: Server = createServer((incoming, outgoing) => {
    const forward = request(
      {
        host: '127.0.0.1',
        port: target,
        path: incoming.url,
        method: incoming.method,
        headers: { ...incoming.headers, host: `127.0.0.1:${target}` },
      },
      (answer) => {
        outgoing.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(outgoing);
      },
    );
    forward.on('error', () => {
      outgoing.statusCode = 502;
      outgoing.end();
    });
    incoming.pipe(forward);
  });
  return new Promise((done) =>
    server.listen(port, '127.0.0.1', () =>
      done({
        to: (next) => {
          target = next;
        },
        close: () => server.close(),
      }),
    ),
  );
}
