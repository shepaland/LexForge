import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

function inside(root, path) {
  const rel = relative(root, path);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function snapshot(root, destination, files) {
  mkdirSync(destination);
  for (const file of files) {
    const source = resolve(root, file);
    let stat;
    try { stat = lstatSync(source); } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error(`Expected a file: ${file}`);
    const target = resolve(destination, file);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { dereference: false, verbatimSymlinks: true });
  }
}

try {
  const [action, directory, ...paths] = process.argv.slice(2);
  if (!directory || !['start', 'finish'].includes(action) ||
      (action === 'start' ? !paths.length : paths.length)) {
    throw new Error('Usage: node cycle-diff.mjs start <new-evidence-dir> <files...> | finish <evidence-dir>');
  }
  const evidence = resolve(directory);
  if (action === 'start') {
    const root = process.cwd();
    const files = [...new Set(paths.map(file => {
      const absolute = resolve(root, file);
      if (!inside(root, absolute) || absolute === evidence || inside(evidence, absolute)) {
        throw new Error(`Path must be a project file outside the evidence directory: ${file}`);
      }
      return relative(root, absolute);
    }))];
    if (existsSync(evidence)) throw new Error('Evidence directory already exists; use a new cycle directory');
    mkdirSync(evidence, { recursive: true });
    snapshot(root, resolve(evidence, 'before'), files);
    writeFileSync(resolve(evidence, 'manifest.json'), JSON.stringify({ root, files }, null, 2) + '\n');
  } else {
    const { root, files } = JSON.parse(readFileSync(resolve(evidence, 'manifest.json'), 'utf8'));
    if (!isAbsolute(root) || !Array.isArray(files) || files.some(file =>
      typeof file !== 'string' || isAbsolute(file) || !inside(root, resolve(root, file)))) {
      throw new Error('Invalid snapshot manifest');
    }
    snapshot(root, resolve(evidence, 'after'), files);
    const fd = openSync(resolve(evidence, 'cycle.patch'), 'wx');
    let diff;
    try {
      diff = spawnSync('git', ['diff', '--no-index', '--binary', '--no-ext-diff', '--no-textconv', '--', 'before', 'after'],
        { cwd: evidence, stdio: ['ignore', fd, 'pipe'], encoding: 'utf8' });
    } finally { closeSync(fd); }
    if (diff.error) throw diff.error;
    if (diff.status !== 0 && diff.status !== 1) throw new Error(diff.stderr || 'git diff failed');
  }
  process.stdout.write(`${evidence}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
