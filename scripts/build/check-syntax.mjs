import { readdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(import.meta.dirname, '../..');
const roots = ['src', 'scripts'];
const extensions = new Set(['.js', '.mjs']);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(path));
      continue;
    }

    if (entry.isFile() && extensions.has(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
}

async function main() {
  const files = (await Promise.all(roots.map((root) => collectFiles(resolve(projectRoot, root)))))
    .flat()
    .sort();

  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], {
      cwd: projectRoot,
      encoding: 'utf8'
    });

    if (result.status !== 0) {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      process.exitCode = result.status || 1;
      return;
    }
  }

  console.log(`Checked syntax for ${files.length} JavaScript modules.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
